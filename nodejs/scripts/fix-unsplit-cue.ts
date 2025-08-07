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

import { $ } from "zx";
import * as fs from "fs";
import * as path from "path";
import inquirer from "inquirer";
import { Result, ok, err } from "neverthrow";

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

// Error types
type ValidationError =
  | "FILE_NOT_FOUND"
  | "FILE_NOT_READABLE"
  | "DIRECTORY_NOT_FOUND";
type DependencyError = "MISSING_DEPENDENCY";
type SplitError = "SPLIT_FAILED" | "CLEANUP_FAILED" | "UNKNOWN_ERROR";

// Utility functions
const isFlacFile = (file: string) =>
  file.toLowerCase().endsWith(FILE_EXTENSIONS.FLAC);
const isCueFile = (file: string) =>
  file.toLowerCase().endsWith(FILE_EXTENSIONS.CUE);
const getBasename = (file: string, ext: string) => path.basename(file, ext);

// Validate file exists and is readable
const validateFile = (filePath: string): Result<boolean, ValidationError> => {
  try {
    if (!fs.existsSync(filePath)) {
      return err("FILE_NOT_FOUND");
    }
    if (!fs.statSync(filePath).isFile()) {
      return err("FILE_NOT_READABLE");
    }
    return ok(true);
  } catch {
    return err("FILE_NOT_READABLE");
  }
};

// Check if a directory contains split tracks
const isAlreadySplit = (
  directory: string
): Result<boolean, ValidationError> => {
  try {
    const files = fs.readdirSync(directory);
    return ok(files.filter(isFlacFile).length > 1);
  } catch {
    return err("DIRECTORY_NOT_FOUND");
  }
};

// Check if required tools are available
async function checkDependencies(): Promise<Result<void, DependencyError>> {
  try {
    for (const dep of DEPENDENCIES) {
      await $`which ${dep}`;
    }
    return ok(undefined);
  } catch {
    return err("MISSING_DEPENDENCY");
  }
}

// Scan for matching .cue and .flac files that are not split
async function scanCueFlacPairs(
  searchPath: string
): Promise<Result<CueFlacPair[], ValidationError>> {
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

            if (cueBasename === flacBasename) {
              const isSplitResult = isAlreadySplit(dir);
              if (isSplitResult.isErr()) {
                continue;
              }

              if (!isSplitResult.value) {
                const cuePath = path.join(dir, cueFile);
                const flacPath = path.join(dir, flacFile);

                const cueValidation = validateFile(cuePath);
                const flacValidation = validateFile(flacPath);

                if (cueValidation.isOk() && flacValidation.isOk()) {
                  foundPairs.push({ directory: dir, cueFile, flacFile });
                }
              }
              break;
            }
          }
        }
      } catch {
        continue;
      }
    }
    return ok(foundPairs);
  } catch {
    return err("DIRECTORY_NOT_FOUND");
  }
}

// Split the FLAC file using cue sheet
async function splitFlacFile(
  cueFile: string,
  flacFile: string,
  outDir: string
): Promise<Result<void, SplitError>> {
  try {
    console.log(`🔄 Splitting '${flacFile}' using '${cueFile}'...`);

    // Create output directory
    await $`mkdir -p ${outDir}`;

    // Use proper quoting for filenames with special characters
    const quotedCueFile = `"${cueFile}"`;
    const quotedFlacFile = `"${flacFile}"`;
    const quotedOutDir = `"${outDir}"`;

    // Split the file with proper quoting
    await $`cuebreakpoints ${quotedCueFile} | shnsplit -f ${quotedCueFile} -o flac -t "%n. %t" -d ${quotedOutDir} ${quotedFlacFile}`;

    // Tag the split files with metadata if cuetag is available
    try {
      await $`cuetag ${quotedCueFile} ${quotedOutDir}/*.flac`;
      console.log("🏷️ Tagged split tracks with metadata");
    } catch {
      console.log("⚠️ cuetag not found, skipping metadata tagging");
    }

    return ok(undefined);
  } catch (error) {
    console.error(`❌ Error splitting file:`, error);
    return err("SPLIT_FAILED");
  }
}

// Cleanup after successful split
async function cleanupAfterSplit(
  directory: string,
  cueFile: string,
  flacFile: string
): Promise<Result<void, SplitError>> {
  try {
    const tempDir = path.join(directory, TEMP_DIR);
    const splitCueFiles = fs.readdirSync(tempDir).filter(isCueFile);

    for (const splitCueFile of splitCueFiles) {
      const quotedSrc = `"${path.join(tempDir, splitCueFile)}"`;
      const quotedDest = `"${directory}/"`;
      await $`mv ${quotedSrc} ${quotedDest}`;
    }

    const quotedCueFile = `"${path.join(directory, cueFile)}"`;
    const quotedFlacFile = `"${path.join(directory, flacFile)}"`;
    const quotedTempDir = `"${tempDir}"`;

    await $`rm ${quotedCueFile}`;
    await $`rm ${quotedFlacFile}`;
    await $`rm -rf ${quotedTempDir}`;

    return ok(undefined);
  } catch (error) {
    console.error(`❌ Error during cleanup:`, error);
    return err("CLEANUP_FAILED");
  }
}

// Process a single cue/flac pair
async function processCueFlacPair(pair: CueFlacPair): Promise<SplitResult> {
  const { directory, cueFile, flacFile } = pair;

  try {
    // Change to the directory
    process.chdir(directory);

    // Split the file
    const splitResult = await splitFlacFile(cueFile, flacFile, TEMP_DIR);

    if (splitResult.isOk()) {
      // Cleanup
      const cleanupResult = await cleanupAfterSplit(
        directory,
        cueFile,
        flacFile
      );

      if (cleanupResult.isOk()) {
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
async function confirmProcessing(
  pairs: CueFlacPair[]
): Promise<Result<boolean, never>> {
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

  return ok(proceed);
}

// Main function
async function main(): Promise<
  Result<void, ValidationError | DependencyError>
> {
  const args = process.argv.slice(2);

  if (args.length !== 1) {
    console.error("Usage: zx fix-unsplit-cue.ts <folder_path>");
    process.exit(1);
  }

  const folderPath = args[0];

  if (!fs.existsSync(folderPath)) {
    console.error(`❌ Directory '${folderPath}' does not exist`);
    process.exit(1);
  }

  if (!fs.statSync(folderPath).isDirectory()) {
    console.error(`❌ '${folderPath}' is not a directory`);
    process.exit(1);
  }

  console.log("🔍 Checking dependencies...");
  const depsResult = await checkDependencies();
  if (depsResult.isErr()) {
    console.error("❌ Missing required dependencies:");
    console.error("   - flac encoder");
    console.error("   - cuebreakpoints (from cuetools)");
    console.error("   - shnsplit (from shntool)");
    console.error("Please install the missing tools.");
    return err("MISSING_DEPENDENCY");
  }

  console.log(`🔍 Scanning '${folderPath}' for unsplit cue/flac pairs...`);
  const pairsResult = await scanCueFlacPairs(folderPath);
  if (pairsResult.isErr()) {
    console.error("❌ Error scanning directories");
    return err(pairsResult.error);
  }

  const pairs = pairsResult.value;
  if (pairs.length === 0) {
    console.log("No unsplit cue/flac pairs found.");
    return ok(undefined);
  }

  const confirmResult = await confirmProcessing(pairs);
  if (confirmResult.isErr()) {
    return err("DIRECTORY_NOT_FOUND");
  }

  if (!confirmResult.value) {
    console.log("Operation cancelled.");
    return ok(undefined);
  }

  console.log("\n🔄 Processing files...\n");

  const results: SplitResult[] = [];
  let successCount = 0;
  let failureCount = 0;

  // Process files serially (one at a time)
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

  return ok(undefined);
}

// Run the main function
main()
  .then((result) => {
    result
      .map(() => {
        console.log("✅ Script completed successfully");
      })
      .mapErr((error) => {
        console.error("❌ Script failed:", error);
        process.exit(1);
      });
  })
  .catch((error) => {
    console.error("❌ Unexpected error:", error);
    process.exit(1);
  });
