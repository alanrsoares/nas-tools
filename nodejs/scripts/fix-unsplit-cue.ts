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

// Find corresponding FLAC file for a CUE file
async function findFlacFile(cuePath: string): Promise<string | null> {
  const directory = path.dirname(cuePath);
  const cueFile = path.basename(cuePath);
  const cueBasename = getBasename(cueFile, FILE_EXTENSIONS.CUE);

  try {
    const files = await fs.readdir(directory);
    const flacFiles = files.filter(isFlacFile);

    for (const flacFile of flacFiles) {
      const flacBasename = getBasename(flacFile, FILE_EXTENSIONS.FLAC);
      if (cueBasename === flacBasename) {
        return flacFile;
      }
    }

    return null;
  } catch {
    return null;
  }
}

// Scan for matching .cue and .flac files that are not split
async function scanCueFlacPairs(searchPath: string): Promise<CueFlacPair[]> {
  const foundPairs: CueFlacPair[] = [];

  try {
    const directories = await fs
      .readdir(searchPath, { withFileTypes: true })
      .then((files) =>
        files
          .filter((dirent) => dirent.isDirectory())
          .map((dirent) => path.join(searchPath, dirent.name))
      );

    // Also check the search path itself
    directories.unshift(searchPath);

    for (const dir of directories) {
      try {
        const files = await fs.readdir(dir);
        const cueFiles = files.filter(isCueFile);
        const flacFiles = files.filter(isFlacFile);

        for (const cueFile of cueFiles) {
          const cueBasename = getBasename(cueFile, FILE_EXTENSIONS.CUE);

          for (const flacFile of flacFiles) {
            const flacBasename = getBasename(flacFile, FILE_EXTENSIONS.FLAC);

            if (cueBasename === flacBasename) {
              const cuePath = path.join(dir, cueFile);
              const flacPath = path.join(dir, flacFile);

              // Validate files exist and are readable
              if ((await exists(cuePath)) && (await exists(flacPath))) {
                foundPairs.push({
                  directory: dir,
                  cueFile,
                  flacFile,
                });
              }
              break;
            }
          }
        }
      } catch {
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
  console.log(`\n📋 Found ${pairs.length} unsplit cue/flac pairs:\n`);

  for (const pair of pairs) {
    console.log(`📂 Directory: ${pair.directory}`);
    console.log(`  📁 CUE: ${pair.cueFile}`);
    console.log(`  🎵 FLAC: ${pair.flacFile}\n`);
  }

  const { proceed } = await inquirer.prompt([
    {
      type: "confirm",
      name: "proceed",
      message: "Do you want to proceed with splitting these files?",
      default: false,
    },
  ]);

  return proceed;
}

// Process a single cue/flac pair using bash function
async function processCueFlacPair(pair: CueFlacPair): Promise<boolean> {
  const { directory, cueFile } = pair;
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
        default: false,
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
  if (args.length !== 1) {
    console.error("Usage: zx fix-unsplit-cue.ts <folder_path>");
    process.exit(1);
  }

  const folderPath = args[0];

  // Validate input directory
  if (!(await exists(folderPath))) {
    console.error(
      `❌ Directory '${folderPath}' does not exist or is not accessible`
    );
    process.exit(1);
  }

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
