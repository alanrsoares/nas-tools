import * as path from "node:path";
import {
  getMusicTargetDirectory,
  inferArtistNameForStagedItem,
  inferArtistNameFromFolder,
  type MovePlanError,
  type NasPathConfig,
  type StagedMediaItem,
  scanDownloadStagingArea,
} from "@nas-tools/core";
import type { Maybe } from "@onrails/maybe";
import { getOrElse, isNone, isSome, none, some } from "@onrails/maybe";
import { match } from "@onrails/pattern";
import { err, ok, ResultAsync } from "@onrails/result";
import type { Command } from "commander";
import { z } from "zod";

export { inferArtistNameFromFolder };

import { fail, formatError, runParsedCommand, safeAsync } from "../lib/fp.js";
import {
  confirm,
  displaySummary,
  ensureDirectory,
  exists,
  getBasename,
  getDirname,
  joinPath,
  logError,
  logInfo,
  logProgress,
  logSuccess,
  logWarning,
  moveFile,
  promptForInput,
  readDirectoryWithTypes,
} from "../lib/utils.js";
import { getBashFunctionsPath, processPairs, scanCueAudioPairs } from "./fix-unsplit-cue.js";

const DEFAULT_SOURCE_DIR = "/volmain/Download/Transmission/complete/";
const DEFAULT_TARGET_DIR = "/volmain/Public/FLAC/";
const DEFAULT_TV_DIR = "/volmain/Public/TV Series & Documentaries/";
const DEFAULT_MOVIE_DIR = "/volmain/Public/Movies/";
const DEFAULT_AUDIOBOOK_DIR = "/volmain/Public/Audiobooks/";
const DEFAULT_EBOOK_DIR = "/volmain/Public/Ebooks/";
const DEFAULT_BACKUP_DIR = "/volmain/Download/Transmission/backup/";

type MediaItem = Omit<StagedMediaItem, "id">;

interface MoveOperation {
  sourcePath: string;
  targetPath: string;
  type: MediaItem["type"];
  artistName?: string;
  albumName: string;
  isNewArtist?: boolean;
}

const optionsSchema = z.object({
  sourceDir: z.string().optional().default(DEFAULT_SOURCE_DIR),
  targetDir: z.string().optional().default(DEFAULT_TARGET_DIR),
  tvDir: z.string().optional().default(DEFAULT_TV_DIR),
  movieDir: z.string().optional().default(DEFAULT_MOVIE_DIR),
  audiobookDir: z.string().optional().default(DEFAULT_AUDIOBOOK_DIR),
  ebookDir: z.string().optional().default(DEFAULT_EBOOK_DIR),
  backupDir: z.string().optional().default(DEFAULT_BACKUP_DIR),
  dryRun: z.boolean().optional().default(false),
  interactive: z.boolean().optional().default(false),
  yes: z.boolean().optional().default(false),
});

type CommandOptions = z.infer<typeof optionsSchema>;

function movePlanErrorToFail(error: MovePlanError): ReturnType<typeof fail> {
  if (error.type === "VALIDATION_ERROR") {
    return fail(error.issues.map((issue) => issue.message).join("; "));
  }

  return fail("message" in error ? error.message : error.type);
}

function scanConfig(sourceDir: string): NasPathConfig {
  return {
    stagingDir: sourceDir,
    musicDir: "",
    tvDir: "",
    movieDir: "",
    audiobookDir: "",
    ebookDir: "",
    backupDir: "",
  };
}

export function scanMediaItems(
  sourceDir: string,
): ResultAsync<MediaItem[], ReturnType<typeof fail>> {
  return scanDownloadStagingArea(scanConfig(sourceDir))
    .mapErr(movePlanErrorToFail)
    .map((items) => items.map(({ id: _id, ...item }) => item));
}

async function promptForArtistName(folderName: string, suggestions: string[]): Promise<string> {
  return await promptForInput(
    `Could not infer artist name for folder: ${folderName}`,
    suggestions[0] || "",
    (input: string) => {
      if (!input.trim()) {
        return "Artist name cannot be empty";
      }
      return true;
    },
  );
}

function inferArtistName(
  mediaItem: MediaItem,
): ResultAsync<Maybe<string>, ReturnType<typeof fail>> {
  const staged: StagedMediaItem = { ...mediaItem, id: crypto.randomUUID() };
  return inferArtistNameForStagedItem(staged).mapErr(movePlanErrorToFail);
}

function checkArtistExists(artistPath: string): ResultAsync<boolean, ReturnType<typeof fail>> {
  return safeAsync(() => exists(artistPath), `Failed to access ${artistPath}`)
    .andThen((artistExists) =>
      artistExists
        ? ok<boolean, ReturnType<typeof fail>>(true)
        : safeAsync(
            () => readDirectoryWithTypes(getDirname(artistPath)),
            `Failed to inspect artists under ${getDirname(artistPath)}`,
          ).map((entries) =>
            entries
              .filter((dirent) => dirent.isDirectory())
              .map((dirent) => dirent.name)
              .some((dir) => dir.toLowerCase() === getBasename(artistPath).toLowerCase()),
          ),
    )
    .orElse(() => ok(false));
}

function resolveNamingConflict(
  targetPath: string,
  options: CommandOptions,
): ResultAsync<string, ReturnType<typeof fail>> {
  if (options.dryRun) {
    return ResultAsync.fromSafePromise(Promise.resolve(targetPath));
  }

  return ResultAsync.fromSafePromise(
    (async () => {
      let counter = 1;
      let newPath = targetPath;

      while (await exists(newPath)) {
        const dir = path.dirname(targetPath);
        const base = path.basename(targetPath);
        const ext = path.extname(base);
        const name = path.basename(base, ext);
        newPath = path.join(dir, `${name} (${counter})${ext}`);
        counter++;
      }

      if (counter > 1) {
        logWarning(`⚠️  Album already exists, using: ${getBasename(newPath)}`);
      }

      return newPath;
    })(),
  );
}

function generateArtistSuggestions(folderName: string): string[] {
  const suggestions: string[] = [folderName];
  const patterns = [/^(.+?)\s*-\s*(.+?)$/i, /^(.+?)\s*\/\s*(.+?)$/i, /^(.+?)\s*_\s*(.+?)$/i];

  for (const pattern of patterns) {
    const match = folderName.match(pattern);
    if (match?.[1]) {
      suggestions.push(match[1].trim());
    }
  }

  return [...new Set(suggestions.filter((s) => s.trim()))];
}

async function resolveArtistNameForItem(
  item: MediaItem,
  options: CommandOptions,
): Promise<string | undefined> {
  if (options.interactive) {
    return promptForArtistName(item.name, generateArtistSuggestions(item.name));
  }

  const inferredArtist = await inferArtistName(item).unwrapOr(none<string>());
  if (isSome(inferredArtist)) {
    return getOrElse(inferredArtist, "");
  }

  logWarning(`⚠️  Could not infer artist name for: ${item.name}`);
  return undefined;
}

async function appendMusicMoveOperation(
  moveOperations: MoveOperation[],
  item: MediaItem,
  options: CommandOptions,
): Promise<MoveOperation[]> {
  const artistName = await resolveArtistNameForItem(item, options);
  if (!artistName) {
    return moveOperations;
  }

  const artistDir = getMusicTargetDirectory(artistName, options.targetDir);
  const isNewArtist = !(await checkArtistExists(artistDir).unwrapOr(false));
  const operation: MoveOperation = {
    sourcePath: item.path,
    targetPath: joinPath(artistDir, item.name),
    type: "music",
    artistName,
    albumName: item.name,
    isNewArtist,
  };

  logInfo(`[Music] ${item.name} → ${artistName} ${isNewArtist ? "(new artist)" : ""}`);
  return [...moveOperations, operation];
}

function targetDirForMediaType(
  type: MediaItem["type"],
  options: CommandOptions,
): string | undefined {
  if (type === "tv") return options.tvDir;
  if (type === "movie") return options.movieDir;
  if (type === "audiobook") return options.audiobookDir;
  if (type === "ebook") return options.ebookDir;
  return undefined;
}

async function appendMediaMoveOperation(
  moveOperations: MoveOperation[],
  item: MediaItem,
  options: CommandOptions,
): Promise<MoveOperation[]> {
  if (item.type === "music") {
    return appendMusicMoveOperation(moveOperations, item, options);
  }

  const targetDir = targetDirForMediaType(item.type, options);
  if (!targetDir) {
    return moveOperations;
  }

  const operation: MoveOperation = {
    sourcePath: item.path,
    targetPath: joinPath(targetDir, item.name),
    type: item.type,
    albumName: item.name,
  };

  logInfo(`[${item.type.toUpperCase()}] ${item.name} → ${targetDir}`);
  return [...moveOperations, operation];
}

function processMediaItems(
  mediaItems: MediaItem[],
  options: CommandOptions,
): ResultAsync<MoveOperation[], ReturnType<typeof fail>> {
  return ResultAsync.fromSafePromise(
    mediaItems.reduce(
      async (operationsPromise, item) => {
        const moveOperations = await operationsPromise;
        return appendMediaMoveOperation(moveOperations, item, options);
      },
      Promise.resolve([] as MoveOperation[]),
    ),
  );
}

async function confirmProcessing(
  operations: MoveOperation[],
  options: CommandOptions,
): Promise<boolean> {
  logInfo(`📋 Found ${operations.length} items to process:`);

  for (const operation of operations) {
    const typeIcon = match(operation.type)
      .with("music", () => (operation.isNewArtist ? "🆕" : "♪"))
      .with("tv", () => "📺")
      .with("movie", () => "🎬")
      .with("audiobook", () => "📚")
      .with("ebook", () => "📖")
      .otherwise(() => "❓");

    const targetLabel =
      operation.type === "music"
        ? `${operation.artistName} / ${operation.albumName}`
        : operation.albumName;

    logInfo(`${typeIcon} [${operation.type}] ${targetLabel}`);
  }

  if (options.dryRun) {
    logInfo("🔍 DRY RUN MODE - No files will be moved");
    return true;
  }

  return await confirm("Proceed with moving these items?");
}

function createBackup(
  sourcePath: string,
  backupDir: string,
): ResultAsync<boolean, ReturnType<typeof fail>> {
  return ResultAsync.fromSafePromise(
    (async () => {
      if (!(await exists(sourcePath))) {
        logWarning(`⚠️  Source no longer exists: ${getBasename(sourcePath)}`);
        return false;
      }

      await ensureDirectory(backupDir);

      let backupPath = joinPath(backupDir, getBasename(sourcePath));
      let counter = 1;
      while (await exists(backupPath)) {
        backupPath = joinPath(backupDir, `${getBasename(sourcePath)} (${counter})`);
        counter++;
      }

      const { cp } = await import("node:fs/promises");
      await cp(sourcePath, backupPath, {
        recursive: true,
        preserveTimestamps: true,
        force: false,
        errorOnExist: true,
      });
      logSuccess(`✓ Backup: ${getBasename(backupPath)}`);
      return true;
    })(),
  ).orElse((error) =>
    err(
      fail(`Backup failed for ${getBasename(sourcePath)}; refusing to move: ${formatError(error)}`),
    ),
  );
}

function runCueSplit(targetPath: string): ResultAsync<void, ReturnType<typeof fail>> {
  return scanCueAudioPairs(targetPath, {
    dryRun: false,
    ignoreFailed: true,
    yes: true,
  }).andThen((pairs) => {
    if (pairs.length === 0) {
      return ok<void, ReturnType<typeof fail>>(undefined);
    }

    logProgress(`Found ${pairs.length} unsplit CUE pairs, splitting...`);

    return getBashFunctionsPath().andThen((bashPath) =>
      processPairs(pairs, async () => true, bashPath).map(() => undefined),
    );
  });
}

function moveMediaItem(
  operation: MoveOperation,
  options: CommandOptions,
): ResultAsync<boolean, ReturnType<typeof fail>> {
  const { sourcePath, targetPath, albumName, type } = operation;

  return safeAsync(() => exists(sourcePath), `Failed to access ${sourcePath}`)
    .andThen((sourceExists) =>
      sourceExists
        ? ok<undefined, ReturnType<typeof fail>>(undefined)
        : err(fail(`Source no longer exists: ${albumName}`)),
    )
    .map(() => logProgress(`Moving: ${albumName}`))
    .andThen(() => resolveNamingConflict(targetPath, options))
    .andThen((finalTargetPath) =>
      safeAsync(
        () => ensureDirectory(getDirname(finalTargetPath)),
        `Failed to create target parent for ${albumName}`,
      ).map(() => finalTargetPath),
    )
    .andThen((finalTargetPath) =>
      safeAsync(() => moveFile(sourcePath, finalTargetPath), `Failed to move ${albumName}`).map(
        () => finalTargetPath,
      ),
    )
    .andThen((finalTargetPath) => {
      logSuccess(`✓ Moved: ${albumName}`);

      if (type === "music" && !options.dryRun) {
        return runCueSplit(finalTargetPath).map(() => true);
      }

      return ok(true);
    })
    .orElse((error) => {
      logError(`❌ ${formatError(error)}`);
      return ok(false);
    });
}

function validateRequiredDirectory(
  dirPath: string,
  label: string,
  createIfMissing = false,
): ResultAsync<void, ReturnType<typeof fail>> {
  return safeAsync(async () => {
    const dirExists = await exists(dirPath);
    if (!dirExists && createIfMissing) {
      await ensureDirectory(dirPath);
      return true;
    }
    return dirExists;
  }, `Failed to access ${label} directory`).andThen(
    (dirExists) =>
      dirExists
        ? ok<void, ReturnType<typeof fail>>(undefined)
        : err(fail(`${label} directory '${dirPath}' does not exist or is not accessible`)),
  );
}

function processMoveOperations(
  moveOperations: MoveOperation[],
  options: CommandOptions,
): ResultAsync<{ successCount: number; failureCount: number }, ReturnType<typeof fail>> {
  return ResultAsync.fromSafePromise(
    moveOperations.reduce(
      async (summaryPromise, operation) => {
        const summary = await summaryPromise;

        const backupSucceeded = options.dryRun
          ? true
          : await createBackup(operation.sourcePath, options.backupDir).unwrapOr(false);

        const success = options.dryRun
          ? true
          : backupSucceeded
            ? await moveMediaItem(operation, options).unwrapOr(false)
            : false;

        if (success) {
          return { ...summary, successCount: summary.successCount + 1 };
        }

        logWarning(`⚠️  Skipping ${operation.albumName} due to failure`);
        return { ...summary, failureCount: summary.failureCount + 1 };
      },
      Promise.resolve({ successCount: 0, failureCount: 0 }),
    ),
  );
}

function run(options: CommandOptions): ResultAsync<void, ReturnType<typeof fail>> {
  return validateRequiredDirectory(options.sourceDir, "Source")
    .andThen(() => validateRequiredDirectory(options.targetDir, "Music Target", true))
    .andThen(() => validateRequiredDirectory(options.tvDir, "TV Target", true))
    .andThen(() => validateRequiredDirectory(options.movieDir, "Movie Target", true))
    .andThen(() => validateRequiredDirectory(options.audiobookDir, "Audiobook Target", true))
    .andThen(() => validateRequiredDirectory(options.ebookDir, "Ebook Target", true))
    .map(() => logInfo(`Scanning '${options.sourceDir}' for media items...`))
    .andThen(() => scanMediaItems(options.sourceDir))
    .andThen((mediaItems) =>
      match(mediaItems)
        .with([], () => {
          logInfo("✨ No media items found.");
          return ok<MediaItem[], ReturnType<typeof fail>>([]);
        })
        .otherwise((items) => {
          logInfo(`📂 Found ${items.length} media items`);
          return ok<MediaItem[], ReturnType<typeof fail>>(items);
        }),
    )
    .andThen((mediaItems) =>
      mediaItems.length === 0
        ? ok<MoveOperation[], ReturnType<typeof fail>>([])
        : processMediaItems(mediaItems, options),
    )
    .andThen((moveOperations) =>
      moveOperations.length === 0
        ? ok<Maybe<MoveOperation[]>, ReturnType<typeof fail>>(none<MoveOperation[]>())
        : options.yes
          ? ok<Maybe<MoveOperation[]>, ReturnType<typeof fail>>(some(moveOperations))
          : safeAsync(
              () => confirmProcessing(moveOperations, options),
              "Failed to confirm processing",
            ).map((proceed) => (proceed ? some(moveOperations) : none<MoveOperation[]>())),
    )
    .andThen((maybeOperations) =>
      isNone(maybeOperations)
        ? ok<void, ReturnType<typeof fail>>(undefined)
        : // biome-ignore lint/suspicious/useIterableCallbackReturn: Result.map for terminal side effect
          processMoveOperations(maybeOperations.value, options).map(
            ({ successCount, failureCount }) => {
              logProgress("🔄 Processing items...");
              displaySummary(successCount, failureCount, maybeOperations.value.length);

              if (failureCount > 0) {
                process.exitCode = 1;
              }
            },
          ),
    );
}

export default function moveCompletedCommand(program: Command): void {
  program
    .command("move-completed")
    .description(
      "Monitor Transmission download completion directory and organize completed downloads into the library structure",
    )
    .option("-s, --source-dir <path>", "Source directory to monitor", DEFAULT_SOURCE_DIR)
    .option("-t, --target-dir <path>", "Target music library directory", DEFAULT_TARGET_DIR)
    .option("--tv-dir <path>", "Target TV library directory", DEFAULT_TV_DIR)
    .option("--movie-dir <path>", "Target movie library directory", DEFAULT_MOVIE_DIR)
    .option("--audiobook-dir <path>", "Target audiobook library directory", DEFAULT_AUDIOBOOK_DIR)
    .option("--ebook-dir <path>", "Target ebook library directory", DEFAULT_EBOOK_DIR)
    .option("-b, --backup-dir <path>", "Backup directory", DEFAULT_BACKUP_DIR)
    .option("--dry-run", "Preview changes without making them", false)
    .option("-y, --yes", "Assume yes to all confirmations", false)
    .option("-i, --interactive", "Prompt for artist name when inference fails", false)
    .action(async (options: Record<string, unknown>) => {
      await runParsedCommand(
        optionsSchema,
        options,
        "Invalid move-completed options",
        run,
        (error) => {
          logError(`Script failed: ${formatError(error)}`);
          process.exit(1);
        },
      );
    });
}
