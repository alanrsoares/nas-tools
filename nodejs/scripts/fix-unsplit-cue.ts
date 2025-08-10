#!/usr/bin/env zx

/**
 * Spec:
 *
 * args:
 *  folder path
 *
 * The script should:
 *  - scan the given folder for all cue files that match the conditions:
 *    - cue file name matches an adjacent flac file
 *    - the cue file is not split
 *  - for each cue file that is not split, it should:
 *      - use the bash split_cue_flac function to handle the splitting and cleanup
 *
 * context, this will run in a busybox container, so we need to use the minimal tools available.
 *
 * refer to : <root_folder>/bash/functions.sh for the functions that are available.
 * If it makes sense translate them so the most of the logic is in typescript.
 *
 * Make heavy use of zx for interaction with os subprograms or shell.
 * The application should display a summary of matches and prompt for confirmation before proceeding.
 */

import { $ } from "zx";
import * as fs from "fs/promises";
import * as path from "path";
import inquirer from "inquirer";
import invariant from "tiny-invariant";

// Constants
const FILE_EXTENSIONS = {
  CUE: ".cue",
  FLAC: ".flac",
} as const;

const BASH_FUNCTIONS_PATH = "/home/admin/dev/nas-tools/bash/functions.sh";

// Types
interface CueFlacPair {
  directory: string;
  cueFile: string;
  flacFile: string;
}

// Utility functions
const isFlacFile = (file: string) =>
  file.toLowerCase().endsWith(FILE_EXTENSIONS.FLAC);

const isCueFile = (file: string) =>
  file.toLowerCase().endsWith(FILE_EXTENSIONS.CUE);

const getBasename = (file: string, ext: string) => path.basename(file, ext);

const exists = async (path: string) =>
  await fs
    .access(path)
    .then(() => true)
    .catch(() => false);

// Scan for matching .cue and .flac files that are not split (recursive)
async function scanCueFlacPairs(searchPath: string): Promise<CueFlacPair[]> {
  invariant(searchPath, "Search path is required");

  const foundPairs: CueFlacPair[] = [];

  try {
    // Check the current directory for cue/flac pairs
    try {
      const files = await fs.readdir(searchPath);
      const cueFiles = files.filter(isCueFile);
      const flacFiles = files.filter(isFlacFile);

      for (const cueFile of cueFiles) {
        invariant(cueFile, "Cue file name is required");
        const cueBasename = getBasename(cueFile, FILE_EXTENSIONS.CUE);

        for (const flacFile of flacFiles) {
          invariant(flacFile, "Flac file name is required");
          const flacBasename = getBasename(flacFile, FILE_EXTENSIONS.FLAC);

          if (cueBasename === flacBasename) {
            const cuePath = path.join(searchPath, cueFile);
            const flacPath = path.join(searchPath, flacFile);

            // Validate files exist and are readable
            if ((await exists(cuePath)) && (await exists(flacPath))) {
              foundPairs.push({
                directory: searchPath,
                cueFile,
                flacFile,
              });
            }
            break;
          }
        }
      }
    } catch {
      // Skip if current directory can't be read
    }

    // Recursively scan subdirectories
    const entries = await fs.readdir(searchPath, { withFileTypes: true });
    const subdirectories = entries
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => path.join(searchPath, dirent.name));

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
    console.error("❌ Error scanning directories:", error);
  }

  return foundPairs;
}

// Display summary and get user confirmation
async function confirmProcessing(pairs: CueFlacPair[]): Promise<boolean> {
  invariant(Array.isArray(pairs), "Pairs must be an array");

  console.log(`\n📋 Found ${pairs.length} unsplit cue/flac pairs:\n`);

  for (const pair of pairs) {
    console.log(`📂 Directory: ${pair.directory}`);
    console.log(`  📄 CUE: ${pair.cueFile}`);
    console.log(`  🎵 FLAC: ${pair.flacFile}\n`);
  }

  const { proceed } = await inquirer.prompt([
    {
      type: "confirm",
      name: "proceed",
      message: "Do you want to proceed with splitting these files?",
      default: true,
    },
  ]);

  return proceed;
}

// Process a single cue/flac pair using bash function
async function processCueFlacPair(pair: CueFlacPair): Promise<boolean> {
  const { directory, cueFile } = pair;
  invariant(directory, "Directory is required");
  invariant(cueFile, "Cue file is required");

  const cuePath = path.join(directory, cueFile);

  try {
    console.log(`\n🔄 Processing: ${cueFile}`);

    // Change to the directory and run the bash function
    await $`cd ${directory} && source ${BASH_FUNCTIONS_PATH} && split_cue_flac ${cueFile}`;

    // Prompt for cleanup
    const { proceed } = await inquirer.prompt([
      {
        type: "confirm",
        name: "proceed",
        message:
          "Do you want to cleanup original files and move split tracks to original directory?",
        default: true,
      },
    ]);

    if (proceed) {
      await $`cd ${directory} && source ${BASH_FUNCTIONS_PATH} && cleanup_temp_split ${cuePath}`;
    }

    console.log(`✅ Successfully processed: ${cueFile}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to process ${cueFile}:`, error);
    return false;
  }
}

// Main function
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

  console.log(`🔍 Scanning '${folderPath}' for unsplit cue/flac pairs...`);

  const pairs = await scanCueFlacPairs(folderPath);

  if (pairs.length === 0) {
    console.log("No unsplit cue/flac pairs found.");
    return;
  }

  const proceed = await confirmProcessing(pairs);
  if (!proceed) {
    console.log("Operation cancelled.");
    return;
  }

  console.log("\n🔄 Processing files...\n");

  // Process files serially
  let successCount = 0;
  let failureCount = 0;

  for (const pair of pairs) {
    invariant(pair, "Pair is required");
    invariant(pair.directory, "Pair directory is required");
    invariant(pair.cueFile, "Pair cue file is required");

    // before processing, list folder contents and prompt for confirmation
    const folderContents = await fs.readdir(pair.directory);
    console.log(`📁 Contents of ${pair.directory}:`);
    for (const file of folderContents) {
      console.log(`  ${file}`);
    }
    console.log("");

    const { proceed } = await inquirer.prompt([
      {
        type: "confirm",
        name: "proceed",
        message: `Do you want to process ${pair.cueFile}?`,
        default: true,
      },
    ]);

    if (!proceed) {
      console.log(`⏭️ Skipped: ${pair.cueFile}`);
      continue;
    }

    const success = await processCueFlacPair(pair);

    if (success) {
      successCount++;
    } else {
      failureCount++;
      console.error("🛑 Stopping processing due to failure.");
      break; // Fail-fast: Stop processing on first failure
    }
  }

  console.log("\n📊 Summary:");
  console.log(`✅ Successfully processed: ${successCount}`);
  console.log(`❌ Failed: ${failureCount}`);
  console.log(`📁 Total: ${pairs.length}`);

  if (failureCount > 0) {
    console.log(
      `⏭️ Skipped: ${
        pairs.length - successCount - failureCount
      } remaining files`
    );
    process.exit(1);
  }
}

// Run the main function
main().catch((error) => {
  console.error("❌ Script failed:", error);
  process.exit(1);
});
