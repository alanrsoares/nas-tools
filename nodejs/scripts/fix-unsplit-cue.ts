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
 *      - split the cue file into tracks into a __temp_split folder under the cue file folder
 *      - then, it, when successful, should clenup this folder, meaning:
 *        - remove the source cue file
 *        - remove the source flac file
 *        - move the __temp_split/*.cue to the cue file folder
 *
 * context, this will run in a busybox container, so we need to use the minimal tools available.
 *
 * refer to : <root_folder>/bash/functions.sh for the functions that are available.
 * If it makes sense translate them so the most of the logic is in typescript.
 *
 * Make heavy use of zx for interaction with os subprograms or shell.
 * The application should display a summary of matches and prompt for confirmation before proceeding.
 */

import { $, argv, path } from "zx";
import * as fs from "fs";
import inquirer from "inquirer";

// Constants
const TEMP_DIR = "__temp_split";
const DEPENDENCIES = ["flac", "cuebreakpoints", "shnsplit"] as const;
const FILE_EXTENSIONS = {
  CUE: ".cue",
  FLAC: ".flac",
} as const;

// Types
interface CueFlacPair {
  directory: string;
  cueFile: string;
  flacFile: string;
}

interface SplitResult {
  success: boolean;
  directory: string;
  cueFile: string;
  flacFile: string;
  error?: string;
}

// Utility functions
const isFlacFile = (file: string) =>
  file.toLowerCase().endsWith(FILE_EXTENSIONS.FLAC);
const isCueFile = (file: string) =>
  file.toLowerCase().endsWith(FILE_EXTENSIONS.CUE);
const getBasename = (file: string, ext: string) => path.basename(file, ext);

// Check if required tools are available
async function checkDependencies(): Promise<boolean> {
  try {
    await Promise.all(DEPENDENCIES.map((dep) => $`which ${dep}`));
    return true;
  } catch {
    console.error("❌ Missing required dependencies:");
    console.error("   - flac encoder");
    console.error("   - cuebreakpoints (from cuetools)");
    console.error("   - shnsplit (from shntool)");
    console.error("Please install the missing tools.");
    return false;
  }
}

// Check if a directory contains split tracks
const isAlreadySplit = (directory: string): boolean => {
  try {
    const files = fs.readdirSync(directory);
    return files.filter(isFlacFile).length > 1;
  } catch {
    return false;
  }
};

// Scan for matching .cue and .flac files that are not split
async function scanCueFlacPairs(searchPath: string): Promise<CueFlacPair[]> {
  const foundPairs: CueFlacPair[] = [];

  try {
    const result = await $`find ${searchPath} -type d`;
    const directories = result.stdout.trim().split("\n").filter(Boolean);

    for (const dir of directories) {
      try {
        const files = fs.readdirSync(dir);
        const cueFiles = files.filter(isCueFile);
        const flacFiles = files.filter(isFlacFile);

        for (const cueFile of cueFiles) {
          const cueBasename = getBasename(cueFile, FILE_EXTENSIONS.CUE);

          for (const flacFile of flacFiles) {
            const flacBasename = getBasename(flacFile, FILE_EXTENSIONS.FLAC);

            if (cueBasename === flacBasename && !isAlreadySplit(dir)) {
              foundPairs.push({ directory: dir, cueFile, flacFile });
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

// Split the FLAC file using cue sheet
async function splitFlacFile(
  cueFile: string,
  flacFile: string,
  outDir: string
): Promise<boolean> {
  try {
    console.log(`🔄 Splitting '${flacFile}' using '${cueFile}'...`);
    await $`mkdir -p ${outDir}`;
    await $`cuebreakpoints ${cueFile} | shnsplit -f ${cueFile} -o flac -t "%n. %t" -d ${outDir} ${flacFile}`;

    try {
      await $`cuetag ${cueFile} ${outDir}/*.flac`;
      console.log("🏷️ Tagged split tracks with metadata");
    } catch {
      console.log("⚠️ cuetag not found, skipping metadata tagging");
    }

    return true;
  } catch (error) {
    console.error(`❌ Error splitting file:`, error);
    return false;
  }
}

// Cleanup after successful split
async function cleanupAfterSplit(
  directory: string,
  cueFile: string,
  flacFile: string
): Promise<boolean> {
  try {
    const tempDir = path.join(directory, TEMP_DIR);
    const splitCueFiles = fs.readdirSync(tempDir).filter(isCueFile);

    for (const splitCueFile of splitCueFiles) {
      await $`mv ${path.join(tempDir, splitCueFile)} ${directory}/`;
    }

    await $`rm ${path.join(directory, cueFile)}`;
    await $`rm ${path.join(directory, flacFile)}`;
    await $`rm -rf ${tempDir}`;

    return true;
  } catch (error) {
    console.error(`❌ Error during cleanup:`, error);
    return false;
  }
}

// Process a single cue/flac pair
async function processCueFlacPair(pair: CueFlacPair): Promise<SplitResult> {
  const { directory, cueFile, flacFile } = pair;

  try {
    process.chdir(directory);
    const splitSuccess = await splitFlacFile(cueFile, flacFile, TEMP_DIR);

    if (splitSuccess) {
      const cleanupSuccess = await cleanupAfterSplit(
        directory,
        cueFile,
        flacFile
      );

      if (cleanupSuccess) {
        console.log(`✅ Successfully processed: ${cueFile}`);
        return { success: true, directory, cueFile, flacFile };
      } else {
        return {
          success: false,
          directory,
          cueFile,
          flacFile,
          error: "Cleanup failed",
        };
      }
    } else {
      return {
        success: false,
        directory,
        cueFile,
        flacFile,
        error: "Split failed",
      };
    }
  } catch (error) {
    return {
      success: false,
      directory,
      cueFile,
      flacFile,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
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

// Main function
async function main() {
  if (argv.length !== 2) {
    console.error("Usage: zx fix-unsplit-cue.ts <folder_path>");
    process.exit(1);
  }

  const folderPath = argv[0];

  if (!fs.existsSync(folderPath)) {
    console.error(`❌ Directory '${folderPath}' does not exist`);
    process.exit(1);
  }

  if (!fs.statSync(folderPath).isDirectory()) {
    console.error(`❌ '${folderPath}' is not a directory`);
    process.exit(1);
  }

  console.log("🔍 Checking dependencies...");
  if (!(await checkDependencies())) {
    process.exit(1);
  }

  console.log(`🔍 Scanning '${folderPath}' for unsplit cue/flac pairs...`);
  const pairs = await scanCueFlacPairs(folderPath);

  if (pairs.length === 0) {
    console.log("No unsplit cue/flac pairs found.");
    process.exit(0);
  }

  if (!(await confirmProcessing(pairs))) {
    console.log("Operation cancelled.");
    process.exit(0);
  }

  console.log("\n🔄 Processing files...\n");

  const results: SplitResult[] = [];
  let successCount = 0;
  let failureCount = 0;

  for (const pair of pairs) {
    const result = await processCueFlacPair(pair);
    results.push(result);

    if (result.success) {
      successCount++;
    } else {
      failureCount++;
      console.error(`❌ Failed to process ${pair.cueFile}: ${result.error}`);
    }
  }

  console.log("\n📊 Summary:");
  console.log(`✅ Successfully processed: ${successCount}`);
  console.log(`❌ Failed: ${failureCount}`);
  console.log(`📁 Total: ${pairs.length}`);

  if (failureCount > 0) {
    process.exit(1);
  }
}

// Run the main function
main().catch((error) => {
  console.error("❌ Unexpected error:", error);
  process.exit(1);
});
