import * as path from "node:path";
import { Command } from "commander";
import { parseFile } from "music-metadata";
import { err, ok, ResultAsync } from "neverthrow";
import { Maybe } from "true-myth";
import { match } from "ts-pattern";
import { z } from "zod";

import { fail, formatError, parseWith, safeAsync } from "../lib/fp.js";
import {
  confirm,
  displaySummary,
  ensureDirectory,
  exists,
  getBasename,
  getDirname,
  isAudiobookFile,
  isCueFile,
  isMusicFile,
  isMovieFile,
  isTvFile,
  joinPath,
  logError,
  logInfo,
  logProgress,
  logSuccess,
  logWarning,
  moveFile,
  promptForInput,
  readDirectory,
  readDirectoryWithTypes,
} from "../lib/utils.js";
import {
  getBashFunctionsPath,
  processPairs,
  scanCueAudioPairs,
} from "./fix-unsplit-cue.js";

// Constants
const DEFAULT_SOURCE_DIR = "/volmain/Download/Transmission/complete/";
const DEFAULT_TARGET_DIR = "/volmain/Public/FLAC/";
const DEFAULT_TV_DIR = "/volmain/Public/TV Series & Documentaries/";
const DEFAULT_MOVIE_DIR = "/volmain/Public/Movies/";
const DEFAULT_AUDIOBOOK_DIR = "/volmain/Public/Audiobooks/";
const DEFAULT_BACKUP_DIR = "/volmain/Download/Transmission/backup/";

const ALPHABETICAL_RANGES = [
  { name: "A-D", pattern: /^[A-D]/i },
  { name: "E-F", pattern: /^[E-F]/i },
  { name: "G-I", pattern: /^[G-I]/i },
  { name: "J-M", pattern: /^[J-M]/i },
  { name: "N-Q", pattern: /^[N-Q]/i },
  { name: "R-T", pattern: /^[R-T]/i },
  { name: "U-Z", pattern: /^[U-Z]/i },
] as const;

// Types
type MediaType = "tv" | "audiobook" | "music" | "movie";

interface MediaItem {
  path: string;
  name: string;
  type: MediaType;
  files: string[];
  musicFiles: string[];
}

interface MoveOperation {
  sourcePath: string;
  targetPath: string;
  type: MediaType;
  artistName?: string;
  albumName: string;
  isNewArtist?: boolean;
}

// schema: strings are optional and have defaults
const optionsSchema = z.object({
  sourceDir: z.string().optional().default(DEFAULT_SOURCE_DIR),
  targetDir: z.string().optional().default(DEFAULT_TARGET_DIR),
  tvDir: z.string().optional().default(DEFAULT_TV_DIR),
  movieDir: z.string().optional().default(DEFAULT_MOVIE_DIR),
  audiobookDir: z.string().optional().default(DEFAULT_AUDIOBOOK_DIR),
  backupDir: z.string().optional().default(DEFAULT_BACKUP_DIR),
  dryRun: z.boolean().optional().default(false),
  interactive: z.boolean().optional().default(false),
  yes: z.boolean().optional().default(false),
});

type CommandOptions = z.infer<typeof optionsSchema>;

// Utility functions

async function promptForArtistName(
  folderName: string,
  suggestions: string[],
): Promise<string> {
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

// Detect the media type of a directory based on its contents
function detectMediaType(
  dirName: string,
  files: string[],
  path: string,
): MediaType | undefined {
  // Priority: TV > Audiobook > Music > Movie

  // 1. TV Check
  if (isTvFile(dirName) || files.some(isTvFile)) {
    return "tv";
  }

  // 2. Audiobook Check
  if (isAudiobookFile(dirName, path) || files.some((f) => isAudiobookFile(f))) {
    return "audiobook";
  }

  // 3. Music Check (including CUE files)
  if (files.some((f) => isMusicFile(f) || isCueFile(f))) {
    return "music";
  }

  // 4. Movie Check
  if (files.some(isMovieFile)) {
    return "movie";
  }

  return undefined;
}

// Scan for media items in the source directory
function scanMediaItems(
  sourceDir: string,
): ResultAsync<MediaItem[], ReturnType<typeof fail>> {
  return safeAsync(
    () => readDirectoryWithTypes(sourceDir),
    `Error scanning source directory ${sourceDir}`,
  ).andThen((entries) =>
    ResultAsync.fromSafePromise(
      entries
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => joinPath(sourceDir, dirent.name))
        .reduce(
          async (itemsPromise, dir) => {
            const items = await itemsPromise;
            const files = await readDirectory(dir).catch(() => []);
            const type = detectMediaType(getBasename(dir), files, dir);

            if (!type) {
              return items;
            }

            return [
              ...items,
              {
                path: dir,
                name: getBasename(dir),
                type,
                files,
                musicFiles: files.filter(isMusicFile),
              },
            ];
          },
          Promise.resolve([] as MediaItem[]),
        ),
    ),
  );
}

// Infer artist name from music files metadata
function inferArtistName(
  mediaItem: MediaItem,
): ResultAsync<Maybe<string>, ReturnType<typeof fail>> {
  return ResultAsync.fromSafePromise(
    mediaItem.musicFiles.reduce(
      async (artistPromise, file) => {
        const current = await artistPromise;
        if (current.isJust) {
          return current;
        }

        const filePath = joinPath(mediaItem.path, file);
        const metadata = await safeAsync(
          () => parseFile(filePath),
          `Could not read metadata for ${file}`,
        ).unwrapOr(undefined);
        const artist = metadata?.common.artist?.trim();

        return artist ? Maybe.just(artist) : Maybe.nothing<string>();
      },
      Promise.resolve(Maybe.nothing<string>() as Maybe<string>),
    ),
  );
}

// Get target directory based on artist name
function getTargetDirectory(artistName: string, targetDir: string): string {
  const firstChar = artistName.charAt(0).toUpperCase();

  // Find the appropriate alphabetical range
  const range = ALPHABETICAL_RANGES.find((r) => r.pattern.test(firstChar));

  if (range) {
    return joinPath(targetDir, range.name, artistName);
  }

  // Fallback to the target directory
  return joinPath(targetDir, artistName);
}

// Check if artist directory already exists
function checkArtistExists(
  artistPath: string,
): ResultAsync<boolean, ReturnType<typeof fail>> {
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
              .some(
                (dir) =>
                  dir.toLowerCase() === getBasename(artistPath).toLowerCase(),
              ),
          ),
    )
    .orElse(() => ok(false));
}

// Handle naming conflicts
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

// Generate suggestions for artist name
function generateArtistSuggestions(folderName: string): string[] {
  const suggestions: string[] = [];

  // Add folder name as first suggestion
  suggestions.push(folderName);

  // Add common patterns
  const patterns = [
    /^(.+?)\s*-\s*(.+?)$/i,
    /^(.+?)\s*\/\s*(.+?)$/i,
    /^(.+?)\s*_\s*(.+?)$/i,
  ];

  for (const pattern of patterns) {
    const match = folderName.match(pattern);
    if (match && match[1]) {
      suggestions.push(match[1].trim());
    }
  }

  // Remove duplicates and empty strings
  return [...new Set(suggestions.filter((s) => s.trim()))];
}

// Process media items and determine move operations
function processMediaItems(
  mediaItems: MediaItem[],
  options: CommandOptions,
): ResultAsync<MoveOperation[], ReturnType<typeof fail>> {
  return ResultAsync.fromSafePromise(
    mediaItems.reduce(
      async (operationsPromise, item) => {
        const moveOperations = await operationsPromise;

        // Routing logic based on media type
        if (item.type === "music") {
          const inferredArtist = await inferArtistName(item).unwrapOr(
            Maybe.nothing<string>(),
          );

          const artistName = await match(options.interactive)
            .when(
              () => inferredArtist.isJust,
              () => Promise.resolve(inferredArtist.unwrapOr("")),
            )
            .with(true, () =>
              promptForArtistName(
                item.name,
                generateArtistSuggestions(item.name),
              ),
            )
            .otherwise(() => {
              logWarning(`⚠️  Could not infer artist name for: ${item.name}`);
              return Promise.resolve(undefined);
            });

          if (!artistName) {
            return moveOperations;
          }

          const artistDir = getTargetDirectory(artistName, options.targetDir);
          const isNewArtist =
            !(await checkArtistExists(artistDir).unwrapOr(false));
          const operation: MoveOperation = {
            sourcePath: item.path,
            targetPath: joinPath(artistDir, item.name),
            type: "music",
            artistName,
            albumName: item.name,
            isNewArtist,
          };

          logInfo(
            `[Music] ${item.name} → ${artistName} ${isNewArtist ? "(new artist)" : ""}`,
          );
          return [...moveOperations, operation];
        }

        // Generic move for other types
        const targetDir = match(item.type)
          .with("tv", () => options.tvDir)
          .with("movie", () => options.movieDir)
          .with("audiobook", () => options.audiobookDir)
          .otherwise(() => undefined);

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
      },
      Promise.resolve([] as MoveOperation[]),
    ),
  );
}

// Display summary and get user confirmation
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

// Create backup of source folder
function createBackup(
  sourcePath: string,
  backupDir: string,
): ResultAsync<void, ReturnType<typeof fail>> {
  const backupPath = joinPath(backupDir, getBasename(sourcePath));

  return ResultAsync.fromSafePromise(
    (async () => {
      if (!(await exists(sourcePath))) {
        logWarning(`⚠️  Source no longer exists: ${getBasename(sourcePath)}`);
        return;
      }

      await ensureDirectory(backupDir);

      const { cp } = await import("fs/promises");
      await cp(sourcePath, backupPath, {
        recursive: true,
        preserveTimestamps: true,
      });
      logSuccess(`✓ Backup: ${getBasename(sourcePath)}`);
    })(),
  ).orElse((error) => {
    logWarning(
      `⚠️  Backup failed for ${getBasename(sourcePath)}: ${formatError(error)}`,
    );
    return ok(undefined);
  });
}

// Post-processing: split CUE if present
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

// Move media item to target location
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
      safeAsync(
        () => moveFile(sourcePath, finalTargetPath),
        `Failed to move ${albumName}`,
      ).map(() => finalTargetPath),
    )
    .andThen((finalTargetPath) => {
      logSuccess(`✓ Moved: ${albumName}`);

      // Post-processing for music
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
): ResultAsync<void, ReturnType<typeof fail>> {
  return safeAsync(
    () => exists(dirPath),
    `Failed to access ${label} directory`,
  ).andThen((exists) =>
    exists
      ? ok<void, ReturnType<typeof fail>>(undefined)
      : err(
          fail(
            `${label} directory '${dirPath}' does not exist or is not accessible`,
          ),
        ),
  );
}

function processMoveOperations(
  moveOperations: MoveOperation[],
  options: CommandOptions,
): ResultAsync<
  { successCount: number; failureCount: number },
  ReturnType<typeof fail>
> {
  return ResultAsync.fromSafePromise(
    moveOperations.reduce(
      async (summaryPromise, operation) => {
        const summary = await summaryPromise;

        if (!options.dryRun) {
          await createBackup(operation.sourcePath, options.backupDir);
        }

        const success = options.dryRun
          ? true
          : await moveMediaItem(operation, options).unwrapOr(false);

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

function run(
  options: CommandOptions,
): ResultAsync<void, ReturnType<typeof fail>> {
  return validateRequiredDirectory(options.sourceDir, "Source")
    .andThen(() => validateRequiredDirectory(options.targetDir, "Music Target"))
    .andThen(() => validateRequiredDirectory(options.tvDir, "TV Target"))
    .andThen(() => validateRequiredDirectory(options.movieDir, "Movie Target"))
    .andThen(() =>
      validateRequiredDirectory(options.audiobookDir, "Audiobook Target"),
    )
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
        ? ok<Maybe<MoveOperation[]>, ReturnType<typeof fail>>(
            Maybe.nothing<MoveOperation[]>(),
          )
        : options.yes
          ? ok<Maybe<MoveOperation[]>, ReturnType<typeof fail>>(
              Maybe.just(moveOperations),
            )
          : safeAsync(
              () => confirmProcessing(moveOperations, options),
              "Failed to confirm processing",
            ).map((proceed) =>
              proceed
                ? Maybe.just(moveOperations)
                : Maybe.nothing<MoveOperation[]>(),
            ),
    )
    .andThen((maybeOperations) =>
      maybeOperations.isNothing
        ? ok<void, ReturnType<typeof fail>>(undefined)
        : processMoveOperations(maybeOperations.value, options).map(
            ({ successCount, failureCount }) => {
              logProgress("🔄 Processing items...");
              displaySummary(
                successCount,
                failureCount,
                maybeOperations.value.length,
              );

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
    .option(
      "-s, --source-dir <path>",
      "Source directory to monitor",
      DEFAULT_SOURCE_DIR,
    )
    .option(
      "-t, --target-dir <path>",
      "Target music library directory",
      DEFAULT_TARGET_DIR,
    )
    .option("--tv-dir <path>", "Target TV library directory", DEFAULT_TV_DIR)
    .option(
      "--movie-dir <path>",
      "Target movie library directory",
      DEFAULT_MOVIE_DIR,
    )
    .option(
      "--audiobook-dir <path>",
      "Target audiobook library directory",
      DEFAULT_AUDIOBOOK_DIR,
    )
    .option("-b, --backup-dir <path>", "Backup directory", DEFAULT_BACKUP_DIR)
    .option("--dry-run", "Preview changes without making them", false)
    .option("-y, --yes", "Assume yes to all confirmations", false)
    .option(
      "-i, --interactive",
      "Prompt for artist name when inference fails",
      false,
    )
    .action(async (options: Record<string, unknown>) => {
      const result = await parseWith(
        optionsSchema,
        options,
        "Invalid move-completed options",
      ).asyncAndThen(run);

      result.match(
        () => undefined,
        (error) => {
          logError(`Script failed: ${formatError(error)}`);
          process.exit(1);
        },
      );
    });
}
