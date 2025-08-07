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
import { Result, ResultAsync, ok, err, okAsync, errAsync } from "neverthrow";

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
  | "DIRECTORY_NOT_FOUND"
  | "INVALID_ARGUMENTS"
  | "PERMISSION_DENIED";
type DependencyError = "MISSING_DEPENDENCY";
type SplitError =
  | "SPLIT_FAILED"
  | "CLEANUP_FAILED"
  | "UNKNOWN_ERROR"
  | "PROCESS_CHDIR_FAILED";
type UserError = "USER_CANCELLED" | "INQUIRER_ERROR";

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
    // Check if file is readable
    fs.accessSync(filePath, fs.constants.R_OK);
    return ok(true);
  } catch {
    return err("FILE_NOT_READABLE");
  }
};

// Validate directory exists and is accessible
const validateDirectory = (
  dirPath: string
): Result<boolean, ValidationError> => {
  try {
    if (!fs.existsSync(dirPath)) {
      return err("DIRECTORY_NOT_FOUND");
    }
    if (!fs.statSync(dirPath).isDirectory()) {
      return err("DIRECTORY_NOT_FOUND");
    }
    // Check if directory is readable and writable
    fs.accessSync(dirPath, fs.constants.R_OK | fs.constants.W_OK);
    return ok(true);
  } catch {
    return err("PERMISSION_DENIED");
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
function checkDependencies(): ResultAsync<void, DependencyError> {
  return ResultAsync.fromPromise(
    Promise.all(DEPENDENCIES.map((dep) => $`which ${dep}`)),
    () => "MISSING_DEPENDENCY" as DependencyError
  ).map(() => undefined);
}

// Validate command line arguments
const validateArguments = (args: string[]): Result<string, ValidationError> => {
  if (args.length !== 1) {
    return err("INVALID_ARGUMENTS");
  }
  return ok(args[0]);
};

// Scan for matching .cue and .flac files that are not split
function scanCueFlacPairs(
  searchPath: string
): ResultAsync<CueFlacPair[], ValidationError> {
  return ResultAsync.fromPromise(
    $`find ${searchPath} -type d`,
    () => "DIRECTORY_NOT_FOUND" as ValidationError
  ).andThen((result) => {
    const directories = result.stdout.trim().split("\n").filter(Boolean);
    const foundPairs: CueFlacPair[] = [];

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
  });
}

// Split the FLAC file using cue sheet
function splitFlacFile(
  cueFile: string,
  flacFile: string,
  outDir: string
): ResultAsync<void, SplitError> {
  return ResultAsync.fromPromise(
    (async () => {
      console.log(`🔄 Splitting '${flacFile}' using '${cueFile}'...`);

      // Create output directory
      await $`mkdir -p ${outDir}`;

      // Split the file - zx handles shell escaping automatically
      await $`cuebreakpoints ${cueFile} | shnsplit -f ${cueFile} -o flac -t "%n. %t" -d ${outDir} ${flacFile}`;

      // Tag the split files with metadata if cuetag is available
      try {
        await $`cuetag ${cueFile} ${outDir}/*.flac`;
        console.log("🏷️ Tagged split tracks with metadata");
      } catch {
        console.log("⚠️ cuetag not found, skipping metadata tagging");
      }
    })(),
    () => "SPLIT_FAILED" as SplitError
  );
}

// Cleanup after successful split
function cleanupAfterSplit(
  directory: string,
  cueFile: string,
  flacFile: string
): ResultAsync<void, SplitError> {
  return ResultAsync.fromPromise(
    (async () => {
      const tempDir = path.join(directory, TEMP_DIR);
      const splitCueFiles = fs.readdirSync(tempDir).filter(isCueFile);

      for (const splitCueFile of splitCueFiles) {
        const srcPath = path.join(tempDir, splitCueFile);
        await $`mv ${srcPath} ${directory}/`;
      }

      const cueFilePath = path.join(directory, cueFile);
      const flacFilePath = path.join(directory, flacFile);

      await $`rm ${cueFilePath}`;
      await $`rm ${flacFilePath}`;
      await $`rm -rf ${tempDir}`;
    })(),
    () => "CLEANUP_FAILED" as SplitError
  );
}

// Process a single cue/flac pair
async function processCueFlacPair(pair: CueFlacPair): Promise<SplitResult> {
  const { directory, cueFile, flacFile } = pair;

  try {
    // Change to the directory
    try {
      process.chdir(directory);
    } catch {
      return {
        success: false,
        directory,
        cueFile,
        flacFile,
        error: "Failed to change directory",
      };
    }

    // Split the file
    const splitResult = await splitFlacFile(cueFile, flacFile, TEMP_DIR);
    if (splitResult.isErr()) {
      return {
        success: false,
        directory,
        cueFile,
        flacFile,
        error: "Split failed",
      };
    }

    // Cleanup
    const cleanupResult = await cleanupAfterSplit(directory, cueFile, flacFile);
    if (cleanupResult.isErr()) {
      return {
        success: false,
        directory,
        cueFile,
        flacFile,
        error: "Cleanup failed",
      };
    }

    console.log(`✅ Successfully processed: ${cueFile}`);
    return { success: true, directory, cueFile, flacFile };
  } catch {
    return {
      success: false,
      directory,
      cueFile,
      flacFile,
      error: "Unknown error",
    };
  }
}

// Display summary and get user confirmation
function confirmProcessing(
  pairs: CueFlacPair[]
): ResultAsync<boolean, UserError> {
  return ResultAsync.fromPromise(
    (async () => {
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
    })(),
    () => "INQUIRER_ERROR" as UserError
  );
}

// Main function
function main(): ResultAsync<
  void,
  ValidationError | DependencyError | UserError
> {
  const args = process.argv.slice(2);

  return ResultAsync.fromPromise(
    (async () => {
      // Validate arguments
      const argsResult = validateArguments(args);
      if (argsResult.isErr()) {
        console.error("Usage: zx fix-unsplit-cue.ts <folder_path>");
        throw new Error(argsResult.error);
      }
      const folderPath = argsResult.value;

      // Validate input directory
      const dirValidation = validateDirectory(folderPath);
      if (dirValidation.isErr()) {
        console.error(
          `❌ Directory '${folderPath}' does not exist or is not accessible`
        );
        throw new Error(dirValidation.error);
      }

      console.log("🔍 Checking dependencies...");
      const depsResult = await checkDependencies();
      if (depsResult.isErr()) {
        console.error("❌ Missing required dependencies:");
        console.error("   - flac encoder");
        console.error("   - cuebreakpoints (from cuetools)");
        console.error("   - shnsplit (from shntool)");
        console.error("Please install the missing tools.");
        throw new Error(depsResult.error);
      }

      console.log(`🔍 Scanning '${folderPath}' for unsplit cue/flac pairs...`);
      const pairsResult = await scanCueFlacPairs(folderPath);
      if (pairsResult.isErr()) {
        console.error("❌ Error scanning directories");
        throw new Error(pairsResult.error);
      }

      const pairs = pairsResult.value;
      if (pairs.length === 0) {
        console.log("No unsplit cue/flac pairs found.");
        return;
      }

      const confirmResult = await confirmProcessing(pairs);
      if (confirmResult.isErr()) {
        console.error("❌ Error with user confirmation");
        throw new Error(confirmResult.error);
      }

      if (!confirmResult.value) {
        console.log("Operation cancelled.");
        return;
      }

      console.log("\n🔄 Processing files...\n");

      // Process files serially - fail-fast behavior (stop on first failure)
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
          console.error(
            `❌ Failed to process ${result.cueFile}: ${result.error}`
          );
          console.error("🛑 Stopping processing due to failure.");
          break; // Fail-fast: Stop processing on first failure to prevent cascading errors
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
    })(),
    (error) => {
      const errorMessage =
        error instanceof Error ? error.message : "UNKNOWN_ERROR";
      return errorMessage as ValidationError | DependencyError | UserError;
    }
  );
}

// Run the main function
main()
  .map(() => {
    console.log("✅ Script completed successfully");
  })
  .mapErr((error) => {
    console.error("❌ Script failed:", error);
    process.exit(1);
  });
