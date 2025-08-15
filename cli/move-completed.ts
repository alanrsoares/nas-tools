#!/usr/bin/env zx

import * as path from "path";
import invariant from "tiny-invariant";
import { parseFile } from "music-metadata";
import { Command } from "commander";
import {
  exists,
  confirm,
  isMusicFile,
  logInfo,
  logSuccess,
  logWarning,
  logError,
  logProgress,
  readDirectoryWithTypes,
  readDirectory,
  ensureDirectory,
  moveFile,
  displaySummary,
  joinPath,
  getBasename,
  getDirname,
} from "./utils.js";

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

interface ScriptOptions {
  sourceDir: string;
  targetDir: string;
  backupDir: string;
  dryRun: boolean;
  interactive: boolean;
}

// Utility functions

const promptForArtistName = async (
  folderName: string,
  suggestions: string[]
) => {
  const { promptForInput } = await import("./utils.js");
  return await promptForInput(
    `Could not infer artist name for folder: ${folderName}`,
    suggestions[0] || "",
    (input: string) => {
      if (!input.trim()) {
        return "Artist name cannot be empty";
      }
      return true;
    }
  );
};

// ... existing code ...

// Scan for album folders in the source directory
async function scanAlbumFolders(sourceDir: string): Promise<AlbumFolder[]> {
  const albumFolders: AlbumFolder[] = [];

  try {
    const entries = await readDirectoryWithTypes(sourceDir);
    const directories = entries
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => joinPath(sourceDir, dirent.name));

    for (const dir of directories) {
      try {
        const files = await readDirectory(dir);
        const musicFiles = files.filter(isMusicFile);

        if (musicFiles.length > 0) {
          albumFolders.push({
            path: dir,
            name: getBasename(dir),
            musicFiles,
          });
        }
      } catch {
        // Skip if directory can't be read
        continue;
      }
    }
  } catch (error) {
    logError(`Error scanning source directory: ${error}`);
  }

  return albumFolders;
}

// Infer artist name from folder name
function inferArtistFromFolderName(folderName: string): string | null {
  // Common patterns for artist-album naming
  const patterns = [
    /^(.+?)\s*-\s*(.+?)(?:\s*\((\d{4})\))?$/i, // "Artist - Album (Year)"
    /^(.+?)\s*\/\s*(.+?)$/i, // "Artist/Album"
    /^(.+?)\s*_\s*(.+?)$/i, // "Artist_Album"
    /^(.+?)\s*–\s*(.+?)$/i, // "Artist – Album" (en dash)
  ];

  for (const pattern of patterns) {
    const match = folderName.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  return null;
}

// Extract artist name from music file metadata
async function extractArtistFromMetadata(
  filePath: string
): Promise<string | null> {
  try {
    const metadata = await parseFile(filePath);
    return metadata.common.artist || null;
  } catch {
    return null;
  }
}

// Infer artist name using multiple strategies
async function inferArtistName(
  albumFolder: AlbumFolder
): Promise<string | null> {
  // Strategy 1: Try to infer from folder name
  const folderArtist = inferArtistFromFolderName(albumFolder.name);
  if (folderArtist) {
    return folderArtist;
  }

  // Strategy 2: Try to extract from music file metadata
  for (const musicFile of albumFolder.musicFiles) {
    const musicFilePath = path.join(albumFolder.path, musicFile);
    const metadataArtist = await extractArtistFromMetadata(musicFilePath);
    if (metadataArtist) {
      return metadataArtist;
    }
  }

  return null;
}

// Determine target directory based on artist name
function getTargetDirectory(artistName: string, targetDir: string): string {
  const firstLetter = artistName.charAt(0).toUpperCase();

  for (const range of ALPHABETICAL_RANGES) {
    if (range.pattern.test(firstLetter)) {
      return joinPath(targetDir, range.name, artistName);
    }
  }

  // add to A-Z if it starts with a number
  if (/^\d/.test(artistName)) {
    return joinPath(targetDir, "A-Z", artistName);
  }

  // Fallback to U-Z for any unmatched characters
  return joinPath(targetDir, "U-Z", artistName);
}

// Check if artist folder already exists (case insensitive)
async function checkArtistExists(artistPath: string): Promise<boolean> {
  // First check if the exact path exists
  if (await exists(artistPath)) {
    return true;
  }

  // If not found, check for case-insensitive match in the parent directory
  const parentDir = getDirname(artistPath);
  const artistName = getBasename(artistPath);

  try {
    const entries = await readDirectoryWithTypes(parentDir);
    const directories = entries
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name);

    // Check if any directory name matches case-insensitively
    return directories.some(
      (dir) => dir.toLowerCase() === artistName.toLowerCase()
    );
  } catch {
    // If we can't read the parent directory, fall back to the original check
    return false;
  }
}

// Handle naming conflicts
async function resolveNamingConflict(
  targetPath: string,
  options: ScriptOptions
): Promise<string> {
  if (options.dryRun) {
    return targetPath;
  }

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
async function processAlbumFolders(
  albumFolders: AlbumFolder[],
  options: ScriptOptions
): Promise<MoveOperation[]> {
  const moveOperations: MoveOperation[] = [];

  for (const albumFolder of albumFolders) {
    // Infer artist name
    let artistName = await inferArtistName(albumFolder);

    if (!artistName) {
      if (options.interactive) {
        const suggestions = generateArtistSuggestions(albumFolder.name);
        artistName = await promptForArtistName(albumFolder.name, suggestions);
      } else {
        logWarning(`⚠️  Could not infer artist name for: ${albumFolder.name}`);
        continue;
      }
    }

    // Determine target path
    const targetPath = getTargetDirectory(artistName, options.targetDir);
    const isNewArtist = !(await checkArtistExists(targetPath));

    moveOperations.push({
      sourcePath: albumFolder.path,
      targetPath: joinPath(targetPath, albumFolder.name),
      artistName,
      albumName: albumFolder.name,
      isNewArtist,
    });

    logInfo(
      `${albumFolder.name} → ${artistName} ${isNewArtist ? "(new artist)" : ""}`
    );
  }

  return moveOperations;
}

// Display summary and get user confirmation
async function confirmProcessing(
  operations: MoveOperation[],
  options: ScriptOptions
): Promise<boolean> {
  logInfo(`📋 Found ${operations.length} albums to process:`);

  for (const operation of operations) {
    const artistIndicator = operation.isNewArtist ? "🆕" : "📁";
    logInfo(
      `${artistIndicator} ${operation.albumName} → ${operation.artistName}`
    );
  }

  if (options.dryRun) {
    logInfo("🔍 DRY RUN MODE - No files will be moved");
    return true;
  }

  return await confirm("Proceed with moving these albums?");
}

// Create backup of source folder
async function createBackup(
  sourcePath: string,
  backupDir: string
): Promise<void> {
  const backupPath = joinPath(backupDir, getBasename(sourcePath));

  try {
    // Check if source still exists before attempting backup
    if (!(await exists(sourcePath))) {
      logWarning(`⚠️  Source no longer exists: ${getBasename(sourcePath)}`);
      return;
    }

    await ensureDirectory(backupDir);

    // Use fs.cp for better reliability than shell cp
    const { cp } = await import("fs/promises");
    await cp(sourcePath, backupPath, { recursive: true });
    logSuccess(`✓ Backup: ${getBasename(sourcePath)}`);
  } catch (error) {
    logWarning(`⚠️  Backup failed for ${getBasename(sourcePath)}: ${error}`);
    // Don't throw - continue with move operation
  }
}

// Move album folder to target location
async function moveAlbumFolder(
  operation: MoveOperation,
  options: ScriptOptions
): Promise<boolean> {
  const { sourcePath, targetPath, albumName } = operation;

  try {
    // Check if source still exists before attempting move
    if (!(await exists(sourcePath))) {
      logWarning(`⚠️  Source no longer exists: ${albumName}`);
      return false;
    }

    logProgress(`Moving: ${albumName}`);

    // Resolve naming conflicts
    const finalTargetPath = await resolveNamingConflict(targetPath, options);

    // Create target directory
    await ensureDirectory(getDirname(finalTargetPath));

    // Move the folder
    await moveFile(sourcePath, finalTargetPath);

    logSuccess(`✓ Moved: ${albumName}`);
    return true;
  } catch (error) {
    logError(`❌ Failed to move ${albumName}: ${error}`);
    return false;
  }
}

/**
 * Move Completed Downloads Script
 *
 * Monitors the Transmission download completion directory and automatically
 * organizes completed music downloads into the appropriate music library structure.
 *
 * See move-completed.md for detailed specification and usage instructions.
 */
async function run(options: ScriptOptions) {
  // Validate directories
  const sourceExists = await exists(options.sourceDir);
  invariant(
    sourceExists,
    `❌ Source directory '${options.sourceDir}' does not exist or is not accessible`
  );

  const targetExists = await exists(options.targetDir);
  invariant(
    targetExists,
    `❌ Target directory '${options.targetDir}' does not exist or is not accessible`
  );

  logInfo(`Scanning '${options.sourceDir}' for album folders...`);

  const albumFolders = await scanAlbumFolders(options.sourceDir);

  if (albumFolders.length === 0) {
    logInfo("✨ No album folders found.");
    return;
  }

  logInfo(`📂 Found ${albumFolders.length} album folders`);

  const moveOperations = await processAlbumFolders(albumFolders, options);

  if (moveOperations.length === 0) {
    logInfo("⚠️  No valid albums to process.");
    return;
  }

  const proceed = await confirmProcessing(moveOperations, options);

  if (!proceed) {
    logInfo("❌ Operation cancelled.");
    return;
  }

  logProgress("🔄 Processing albums...");

  // Process albums serially
  let successCount = 0;
  let failureCount = 0;

  for (const operation of moveOperations) {
    try {
      // Create backup if not in dry-run mode
      if (!options.dryRun) {
        await createBackup(operation.sourcePath, options.backupDir);
      }

      // Move the folder
      const success = options.dryRun
        ? true
        : await moveAlbumFolder(operation, options);

      if (success) {
        successCount++;
      } else {
        failureCount++;
        // Continue processing other albums instead of stopping
        logWarning(`⚠️  Skipping ${operation.albumName} due to failure`);
      }
    } catch (error) {
      logError(`❌ Error processing ${operation.albumName}: ${error}`);
      failureCount++;
      // Continue processing other albums instead of stopping
      logWarning(`⚠️  Skipping ${operation.albumName} due to error`);
    }
  }

  displaySummary(successCount, failureCount, moveOperations.length);

  if (failureCount > 0) {
    process.exit(1);
  }
}

// Commander CLI setup
const program = new Command();

program
  .name("move-completed")
  .description(
    "Monitor Transmission download completion directory and organize completed music downloads into the music library structure."
  )
  .option(
    "-s, --source-dir <path>",
    "Source directory to monitor",
    DEFAULT_SOURCE_DIR
  )
  .option(
    "-t, --target-dir <path>",
    "Target music library directory",
    DEFAULT_TARGET_DIR
  )
  .option("-b, --backup-dir <path>", "Backup directory", DEFAULT_BACKUP_DIR)
  .option("--dry-run", "Preview changes without making them", false)
  .option(
    "-i, --interactive",
    "Prompt for artist name when inference fails",
    false
  )
  .showHelpAfterError()
  .version("1.0.0")
  .action(async (opts: Record<string, unknown>) => {
    const options: ScriptOptions = {
      sourceDir: opts["sourceDir"] as string,
      targetDir: opts["targetDir"] as string,
      backupDir: opts["backupDir"] as string,
      dryRun: Boolean(opts["dryRun"]),
      interactive: Boolean(opts["interactive"]),
    };

    try {
      await run(options);
    } catch (error) {
      logError(`Script failed: ${error}`);
      process.exit(1);
    }
  });

await program.parseAsync(process.argv);
