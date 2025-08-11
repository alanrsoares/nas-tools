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
interface CueAudioPair {
  directory: string;
  cueFile: string;
  audioFile: string;
}

interface ScriptOptions {
  ignoreFailed: boolean;
}

// Utility functions

// Check if file is a WAV file
function isWavFile(file: string): boolean {
  return file.toLowerCase().endsWith(FILE_EXTENSIONS.WAV);
}

// Check if file is an audio file (FLAC or WAV)
function isAudioFile(file: string): boolean {
  return isFlacFile(file) || isWavFile(file);
}

// Check if a directory has an empty __temp_split folder (indicating a failed split)
async function hasTempSplit(directory: string): Promise<boolean> {
  const tempSplitPath = joinPath(directory, "__temp_split");

  return await exists(tempSplitPath);
}

function hasFlag(arg: string, flags: string[]): boolean {
  return flags.includes(arg);
}

// Parse command line arguments
function parseArguments(args: string[]): {
  folderPath: string;
  options: ScriptOptions;
} {
  const options: ScriptOptions = {
    ignoreFailed: false,
  };

  let folderPath: string | undefined;
  const ignoreFailedFlags = ["--ignore-failed", "-i"];

  for (const arg of args) {
    if (hasFlag(arg, ignoreFailedFlags)) {
      options.ignoreFailed = true;
    } else if (!folderPath) {
      folderPath = arg;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }

  if (!folderPath) {
    throw new Error(
      "Usage: tsx fix-unsplit-cue.ts [--ignore-failed|-i] <folder_path>"
    );
  }

  return { folderPath, options };
}

// Scan for matching .cue and audio files that are not split (recursive)
async function scanCueAudioPairs(
  searchPath: string,
  options: ScriptOptions
): Promise<CueAudioPair[]> {
  invariant(searchPath, "Search path is required");

  const foundPairs: CueAudioPair[] = [];

  try {
    // Check if this directory should be skipped due to failed split
    if (options.ignoreFailed && (await hasTempSplit(searchPath))) {
      logInfo(`Skipping directory with empty __temp_split: ${searchPath}`);
      return foundPairs;
    }

    // Check the current directory for cue/audio pairs
    const currentDirPairs = await findCueAudioPairsInDirectory(
      searchPath,
      options
    );
    foundPairs.push(...currentDirPairs);

    // Recursively scan subdirectories
    const { readDirectoryWithTypes } = await import("./utils.js");
    const entries = await readDirectoryWithTypes(searchPath);
    const subdirectories = entries
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => joinPath(searchPath, dirent.name));

    for (const subdir of subdirectories) {
      try {
        const subdirPairs = await scanCueAudioPairs(subdir, options);
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

// Find cue/audio pairs in a single directory
async function findCueAudioPairsInDirectory(
  searchPath: string,
  options: ScriptOptions
): Promise<CueAudioPair[]> {
  const foundPairs: CueAudioPair[] = [];

  try {
    const files = await readDirectory(searchPath);
    const cueFiles = files.filter(isCueFile);
    const audioFiles = files.filter(isAudioFile);

    console.log({ files, options });

    if (options.ignoreFailed && files.includes("__temp_split")) {
      return foundPairs;
    }

    for (const cueFile of cueFiles) {
      const cueBasename = getBasename(cueFile, FILE_EXTENSIONS.CUE);

      for (const audioFile of audioFiles) {
        let audioBasename: string;

        if (isFlacFile(audioFile)) {
          audioBasename = getBasename(audioFile, FILE_EXTENSIONS.FLAC);
        } else if (isWavFile(audioFile)) {
          audioBasename = getBasename(audioFile, FILE_EXTENSIONS.WAV);
        } else {
          continue;
        }

        if (cueBasename !== audioBasename) {
          continue;
        }

        const cuePath = joinPath(searchPath, cueFile);
        const audioPath = joinPath(searchPath, audioFile);

        const [cueExists, audioExists] = await Promise.all([
          exists(cuePath),
          exists(audioPath),
        ]);

        if (!cueExists || !audioExists) {
          continue;
        }

        foundPairs.push({
          directory: searchPath,
          cueFile,
          audioFile,
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
async function confirmProcessing(pairs: CueAudioPair[]): Promise<boolean> {
  logInfo(`Found ${pairs.length} unsplit cue/audio pairs:`);

  for (const pair of pairs) {
    logDirectory(`Directory: ${pair.directory}`);
    logFile(`  CUE: ${pair.cueFile}`);
    logMusic(`  Audio: ${pair.audioFile}`);
  }

  return await confirm("Do you want to proceed with splitting these files?");
}

// Process a single cue/audio pair using bash function
async function processCueAudioPair(pair: CueAudioPair): Promise<boolean> {
  const { directory, cueFile } = pair;
  invariant(directory, "Directory is required");
  invariant(cueFile, "Cue file is required");

  const cuePath = joinPath(directory, cueFile);

  try {
    logProgress(`Processing: ${cueFile}`);

    // Change to the directory and run the bash function
    await $`cd ${directory} && source ${BASH_FUNCTIONS_PATH} && split_cue_audio ${cueFile}`;

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
 * Scans directories for unsplit CUE/Audio file pairs (FLAC or WAV) and provides an interactive
 * interface to split them using bash functions.
 *
 * Usage: tsx fix-unsplit-cue.ts [--ignore-failed|-i] <folder_path>
 *
 * Options:
 *   --ignore-failed, -i    Skip directories that have an empty __temp_split folder
 *                          (indicating a previously failed split attempt)
 *
 * See fix-unsplit-cue.md for detailed specification and usage instructions.
 */
async function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  let folderPath: string;
  let options: ScriptOptions;

  try {
    const parsed = parseArguments(args);
    folderPath = parsed.folderPath;
    options = parsed.options;
  } catch (error) {
    logError(`Invalid arguments: ${error}`);
    process.exit(1);
  }

  const folderExists = await exists(folderPath);
  invariant(
    folderExists,
    `❌ Directory '${folderPath}' does not exist or is not accessible`
  );

  logInfo(`Scanning '${folderPath}' for unsplit cue/audio pairs...`);
  if (options.ignoreFailed) {
    logInfo("Ignoring directories with empty __temp_split folders");
  }

  const pairs = await scanCueAudioPairs(folderPath, options);
  console.log({ options, pairs });

  if (pairs.length === 0) {
    logInfo("No unsplit cue/audio pairs found.");
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

    const success = await processCueAudioPair(pair);

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
