#!/usr/bin/env zx

import { $ } from "zx";
import invariant from "tiny-invariant";
import {
  exists,
  confirm,
  isFlacFile,
  isCueFile,
  getBasename,
  logInfo,
  logSuccess,
  logError,
  logProgress,
  logFile,
  logDirectory,
  logMusic,
  readDirectory,
  displaySummary,
  joinPath,
  FILE_EXTENSIONS,
} from "./utils.js";

const BASH_FUNCTIONS_PATH = "/home/admin/dev/nas-tools/bash/functions.sh";

// Types
interface CueFlacPair {
  directory: string;
  cueFile: string;
  flacFile: string;
}

// Utility functions

// Scan for matching .cue and .flac files that are not split (recursive)
async function scanCueFlacPairs(searchPath: string): Promise<CueFlacPair[]> {
  invariant(searchPath, "Search path is required");

  const foundPairs: CueFlacPair[] = [];

  try {
    // Check the current directory for cue/flac pairs
    const currentDirPairs = await findCueFlacPairsInDirectory(searchPath);
    foundPairs.push(...currentDirPairs);

    // Recursively scan subdirectories
    const { readDirectoryWithTypes } = await import("./utils.js");
    const entries = await readDirectoryWithTypes(searchPath);
    const subdirectories = entries
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => joinPath(searchPath, dirent.name));

    for (const subdir of subdirectories) {
      try {
        const subdirPairs = await scanCueFlacPairs(subdir);
        foundPairs.push(...subdirPairs);
      } catch {
        // Skip if subdirectory can't be accessed
        continue;
      }
    }
  } catch (error) {
    logError(`Error scanning directories: ${error}`);
  }

  return foundPairs;
}

// Find cue/flac pairs in a single directory
async function findCueFlacPairsInDirectory(
  searchPath: string
): Promise<CueFlacPair[]> {
  const foundPairs: CueFlacPair[] = [];

  try {
    const files = await readDirectory(searchPath);
    const cueFiles = files.filter(isCueFile);
    const flacFiles = files.filter(isFlacFile);

    for (const cueFile of cueFiles) {
      const cueBasename = getBasename(cueFile, FILE_EXTENSIONS.CUE);

      for (const flacFile of flacFiles) {
        const flacBasename = getBasename(flacFile, FILE_EXTENSIONS.FLAC);

        if (cueBasename !== flacBasename) {
          continue;
        }

        const cuePath = joinPath(searchPath, cueFile);
        const flacPath = joinPath(searchPath, flacFile);

        const [cueExists, flacExists] = await Promise.all([
          exists(cuePath),
          exists(flacPath),
        ]);

        if (!cueExists || !flacExists) {
          continue;
        }

        foundPairs.push({
          directory: searchPath,
          cueFile,
          flacFile,
        });

        break;
      }
    }
  } catch {
    // Skip if current directory can't be read
  }

  return foundPairs;
}

// Display summary and get user confirmation
async function confirmProcessing(pairs: CueFlacPair[]): Promise<boolean> {
  invariant(Array.isArray(pairs), "Pairs must be an array");

  logInfo(`Found ${pairs.length} unsplit cue/flac pairs:`);

  for (const pair of pairs) {
    logDirectory(`Directory: ${pair.directory}`);
    logFile(`  CUE: ${pair.cueFile}`);
    logMusic(`  FLAC: ${pair.flacFile}`);
  }

  return await confirm("Do you want to proceed with splitting these files?");
}

// Process a single cue/flac pair using bash function
async function processCueFlacPair(pair: CueFlacPair): Promise<boolean> {
  const { directory, cueFile } = pair;
  invariant(directory, "Directory is required");
  invariant(cueFile, "Cue file is required");

  const cuePath = joinPath(directory, cueFile);

  try {
    logProgress(`Processing: ${cueFile}`);

    // Change to the directory and run the bash function
    await $`cd ${directory} && source ${BASH_FUNCTIONS_PATH} && split_cue_flac ${cueFile}`;

    const proceed = await confirm(
      "Do you want to cleanup original files and move split tracks to original directory?"
    );

    if (proceed) {
      await $`cd ${directory} && source ${BASH_FUNCTIONS_PATH} && cleanup_temp_split ${cuePath}`;
    }

    logSuccess(`Successfully processed: ${cueFile}`);
    return true;
  } catch (error) {
    logError(`Failed to process ${cueFile}: ${error}`);
    return false;
  }
}

/**
 * Fix Unsplit CUE Files Script
 *
 * Scans directories for unsplit CUE/FLAC file pairs and provides an interactive
 * interface to split them using bash functions.
 *
 * See fix-unsplit-cue.md for detailed specification and usage instructions.
 */
async function main() {
  const args = process.argv.slice(2);

  // Validate arguments
  invariant(args.length === 1, "Usage: zx fix-unsplit-cue.ts <folder_path>");

  const folderPath = args[0];
  invariant(folderPath, "Folder path is required");

  const folderExists = await exists(folderPath);
  invariant(
    folderExists,
    `❌ Directory '${folderPath}' does not exist or is not accessible`
  );

  logInfo(`Scanning '${folderPath}' for unsplit cue/flac pairs...`);

  const pairs = await scanCueFlacPairs(folderPath);

  if (pairs.length === 0) {
    logInfo("No unsplit cue/flac pairs found.");
    return;
  }

  const proceed = await confirmProcessing(pairs);

  if (!proceed) {
    logInfo("Operation cancelled.");
    return;
  }

  logProgress("Processing files...");

  // Process files serially
  let successCount = 0;
  let failureCount = 0;

  for (const pair of pairs) {
    invariant(pair, "Pair is required");
    invariant(pair.directory, "Pair directory is required");
    invariant(pair.cueFile, "Pair cue file is required");

    // before processing, list folder contents and prompt for confirmation
    const folderContents = await readDirectory(pair.directory);
    logDirectory(`Contents of ${pair.directory}:`);
    for (const file of folderContents) {
      logFile(`-  ${file}`);
    }
    logInfo("");

    const proceed = await confirm(`Do you want to process ${pair.cueFile}?`);

    if (!proceed) {
      logInfo(`Skipped: ${pair.cueFile}`);
      continue;
    }

    const success = await processCueFlacPair(pair);

    if (success) {
      successCount++;
    } else {
      failureCount++;
      logError("Stopping processing due to failure.");
      break; // Fail-fast: Stop processing on first failure
    }
  }

  displaySummary(successCount, failureCount, pairs.length);

  if (failureCount > 0) {
    process.exit(1);
  }
}

// Run the main function
main().catch((error) => {
  logError(`Script failed: ${error}`);
  process.exit(1);
});
