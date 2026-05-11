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
  isMusicFile,
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

// Constants
const DEFAULT_SOURCE_DIR = "/volmain/Download/Transmission/complete/";
const DEFAULT_TARGET_DIR = "/volmain/Public/FLAC/";
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
interface AlbumFolder {
  path: string;
  name: string;
  artistName?: string;
  targetPath?: string;
  musicFiles: string[];
}

interface MoveOperation {
  sourcePath: string;
  targetPath: string;
  artistName: string;
  albumName: string;
  isNewArtist: boolean;
}

// schema: strings are optional and have defaults
const optionsSchema = z.object({
  sourceDir: z.string().optional().default(DEFAULT_SOURCE_DIR),
  targetDir: z.string().optional().default(DEFAULT_TARGET_DIR),
  backupDir: z.string().optional().default(DEFAULT_BACKUP_DIR),
  dryRun: z.boolean().optional().default(false),
  interactive: z.boolean().optional().default(false),
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

// Scan for album folders in the source directory
function scanAlbumFolders(
  sourceDir: string,
): ResultAsync<AlbumFolder[], ReturnType<typeof fail>> {
  return safeAsync(
    () => readDirectoryWithTypes(sourceDir),
    `Error scanning source directory ${sourceDir}`,
  ).andThen((entries) =>
    ResultAsync.fromSafePromise(
      entries
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => joinPath(sourceDir, dirent.name))
        .reduce(
          async (foldersPromise, dir) => {
            const folders = await foldersPromise;
            const files = await readDirectory(dir).catch(() => []);
            const musicFiles = files.filter(isMusicFile);

            return musicFiles.length
              ? [
                  ...folders,
                  {
                    path: dir,
                    name: getBasename(dir),
                    musicFiles,
                  },
                ]
              : folders;
          },
          Promise.resolve([] as AlbumFolder[]),
        ),
    ),
  );
}

// Infer artist name from music files metadata
function inferArtistName(
  albumFolder: AlbumFolder,
): ResultAsync<Maybe<string>, ReturnType<typeof fail>> {
  return ResultAsync.fromSafePromise(
    albumFolder.musicFiles.reduce(
      async (artistPromise, file) => {
        const current = await artistPromise;
        if (current.isJust) {
          return current;
        }

        const filePath = joinPath(albumFolder.path, file);
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

// Process album folders and determine move operations
function processAlbumFolders(
  albumFolders: AlbumFolder[],
  options: CommandOptions,
): ResultAsync<MoveOperation[], ReturnType<typeof fail>> {
  return ResultAsync.fromSafePromise(
    albumFolders.reduce(
      async (operationsPromise, albumFolder) => {
        const moveOperations = await operationsPromise;
        const inferredArtist = await inferArtistName(albumFolder).unwrapOr(
          Maybe.nothing<string>(),
        );

        const artistName = await match(options.interactive)
          .when(
            () => inferredArtist.isJust,
            () => Promise.resolve(inferredArtist.unwrapOr("")),
          )
          .with(true, () =>
            promptForArtistName(
              albumFolder.name,
              generateArtistSuggestions(albumFolder.name),
            ),
          )
          .otherwise(() => {
            logWarning(
              `⚠️  Could not infer artist name for: ${albumFolder.name}`,
            );
            return Promise.resolve(undefined);
          });

        if (!artistName) {
          return moveOperations;
        }

        const targetPath = getTargetDirectory(artistName, options.targetDir);
        const isNewArtist =
          !(await checkArtistExists(targetPath).unwrapOr(false));
        const operation = {
          sourcePath: albumFolder.path,
          targetPath: joinPath(targetPath, albumFolder.name),
          artistName,
          albumName: albumFolder.name,
          isNewArtist,
        };

        logInfo(
          `${albumFolder.name} → ${artistName} ${isNewArtist ? "(new artist)" : ""}`,
        );

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
  logInfo(`📋 Found ${operations.length} albums to process:`);

  for (const operation of operations) {
    const artistIndicator = operation.isNewArtist ? "🆕" : "📁";
    logInfo(
      `${artistIndicator} ${operation.albumName} → ${operation.artistName}`,
    );
  }

  if (options.dryRun) {
    logInfo("🔍 DRY RUN MODE - No files will be moved");
    return true;
  }

  return await confirm("Proceed with moving these albums?");
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
      await cp(sourcePath, backupPath, { recursive: true });
      logSuccess(`✓ Backup: ${getBasename(sourcePath)}`);
    })(),
  ).orElse((error) => {
    logWarning(
      `⚠️  Backup failed for ${getBasename(sourcePath)}: ${formatError(error)}`,
    );
    return ok(undefined);
  });
}

// Move album folder to target location
function moveAlbumFolder(
  operation: MoveOperation,
  options: CommandOptions,
): ResultAsync<boolean, ReturnType<typeof fail>> {
  const { sourcePath, targetPath, albumName } = operation;

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
      ),
    )
    .map(() => {
      logSuccess(`✓ Moved: ${albumName}`);
      return true;
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
          : await moveAlbumFolder(operation, options).unwrapOr(false);

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
    .andThen(() => validateRequiredDirectory(options.targetDir, "Target"))
    .map(() => logInfo(`Scanning '${options.sourceDir}' for album folders...`))
    .andThen(() => scanAlbumFolders(options.sourceDir))
    .andThen((albumFolders) =>
      match(albumFolders)
        .with([], () => {
          logInfo("✨ No album folders found.");
          return ok<AlbumFolder[], ReturnType<typeof fail>>([]);
        })
        .otherwise((folders) => {
          logInfo(`📂 Found ${folders.length} album folders`);
          return ok<AlbumFolder[], ReturnType<typeof fail>>(folders);
        }),
    )
    .andThen((albumFolders) =>
      albumFolders.length === 0
        ? ok<MoveOperation[], ReturnType<typeof fail>>([])
        : processAlbumFolders(albumFolders, options),
    )
    .andThen((moveOperations) =>
      moveOperations.length === 0
        ? ok<Maybe<MoveOperation[]>, ReturnType<typeof fail>>(
            Maybe.nothing<MoveOperation[]>(),
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
              logProgress("🔄 Processing albums...");
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
      "Monitor Transmission download completion directory and organize completed music downloads into the music library structure",
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
    .option("-b, --backup-dir <path>", "Backup directory", DEFAULT_BACKUP_DIR)
    .option("--dry-run", "Preview changes without making them", false)
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
