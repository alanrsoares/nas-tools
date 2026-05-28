import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { match, when } from "@onrails/pattern";
import { err, errAsync, ok, ResultAsync } from "@onrails/result";
import type { Command } from "commander";
import { z } from "zod";
import { $ } from "zx";

import { env } from "../lib/env.js";
import { fail, formatError, runParsedCommand, safeAsync } from "../lib/fp.js";
import {
  confirm as confirmPrompt,
  displaySummary,
  exists,
  FILE_EXTENSIONS,
  getBasename,
  isCueFile,
  isFlacFile,
  isWavFile,
  isWvFile,
  joinPath,
  logDirectory,
  logError,
  logFile,
  logInfo,
  logMusic,
  logProgress,
  logSuccess,
  readDirectory,
  readDirectoryWithTypes,
} from "../lib/utils.js";

const COMMANDS_DIR = dirname(fileURLToPath(import.meta.url));
const BASH_FUNCTIONS_CANDIDATES = [
  env.NAS_TOOLS_BASH_FUNCTIONS_PATH,
  join(COMMANDS_DIR, "../../../bash/functions.sh"),
  join(COMMANDS_DIR, "../../bash/functions.sh"),
  join(process.cwd(), "bash/functions.sh"),
].filter((path): path is string => Boolean(path));

// Types
export interface CueAudioPair {
  directory: string;
  cueFile: string;
  audioFile: string;
}

export interface ProcessingSummary {
  successCount: number;
  failureCount: number;
}

const optionsSchema = z.object({
  dryRun: z.boolean(),
  ignoreFailed: z.boolean(),
  yes: z.boolean(),
});

export type CommandOptions = z.infer<typeof optionsSchema>;

// Utility functions

function isMetadataJunkFile(file: string): boolean {
  return file === ".DS_Store" || file.startsWith("._");
}

function isProcessableCueFile(file: string): boolean {
  return !isMetadataJunkFile(file) && isCueFile(file);
}

function isAudioFile(file: string): boolean {
  return !isMetadataJunkFile(file) && (isFlacFile(file) || isWavFile(file) || isWvFile(file));
}

export function getBashFunctionsPath(): ResultAsync<string, ReturnType<typeof fail>> {
  return ResultAsync.fromSafePromise(
    BASH_FUNCTIONS_CANDIDATES.reduce(
      async (foundPathPromise, candidate) => {
        const foundPath = await foundPathPromise;
        if (foundPath) {
          return foundPath;
        }

        return (await exists(candidate)) ? candidate : undefined;
      },
      Promise.resolve(undefined as string | undefined),
    ),
  ).andThen((path) =>
    path
      ? ok<string, ReturnType<typeof fail>>(path)
      : err(
          fail(
            "Could not find bash/functions.sh. Set NAS_TOOLS_BASH_FUNCTIONS_PATH to its full path.",
          ),
        ),
  );
}

// Scan for matching .cue and audio files that are not split (recursive)
export function scanCueAudioPairs(
  searchPath: string,
  options: CommandOptions,
): ResultAsync<CueAudioPair[], ReturnType<typeof fail>> {
  if (!searchPath) {
    return errAsync(fail("Search path is required"));
  }

  return findCueAudioPairsInDirectory(searchPath, options).andThen((currentDirPairs) =>
    safeAsync(() => readDirectoryWithTypes(searchPath), `Error scanning directory ${searchPath}`)
      .andThen((entries) =>
        ResultAsync.fromSafePromise(
          entries
            .filter((dirent) => dirent.isDirectory())
            .map((dirent) => joinPath(searchPath, dirent.name))
            .reduce(async (pairsPromise, subdir) => {
              const pairs = await pairsPromise;
              const subdirPairs = await scanCueAudioPairs(subdir, options).unwrapOr([]);

              return [...pairs, ...subdirPairs];
            }, Promise.resolve(currentDirPairs)),
        ),
      )
      .orElse((error) => {
        logError(formatError(error));
        return ok(currentDirPairs);
      }),
  );
}

function getAudioBasename(audioFile: string): string {
  return match(audioFile)
    .with(when(isFlacFile), (file) => getBasename(file, FILE_EXTENSIONS.FLAC))
    .with(when(isWavFile), (file) => getBasename(file, FILE_EXTENSIONS.WAV))
    .with(when(isWvFile), (file) => getBasename(file, FILE_EXTENSIONS.WV))
    .otherwise(() => "");
}

async function matchCueToAudio(
  cueFile: string,
  audioFiles: string[],
  searchPath: string,
): Promise<{ cueFile: string; audioFile: string } | null> {
  const cueBasename = getBasename(cueFile, FILE_EXTENSIONS.CUE).toLowerCase();
  for (const audioFile of audioFiles) {
    if (getAudioBasename(audioFile).toLowerCase() !== cueBasename) continue;
    const cuePath = joinPath(searchPath, cueFile);
    const audioPath = joinPath(searchPath, audioFile);
    const [cueExists, audioExists] = await Promise.all([exists(cuePath), exists(audioPath)]);
    if (cueExists && audioExists) return { cueFile, audioFile };
  }
  return null;
}

async function findPairsInFiles(
  files: string[],
  searchPath: string,
  options: CommandOptions,
): Promise<CueAudioPair[]> {
  if (options.ignoreFailed && files.includes("__temp_split")) {
    logInfo(`Skipping directory with __temp_split: ${searchPath}`);
    return [];
  }
  const cueFiles = files.filter(isProcessableCueFile);
  const audioFiles = files.filter(isAudioFile);
  const foundPairs: CueAudioPair[] = [];
  for (const cueFile of cueFiles) {
    const match = await matchCueToAudio(cueFile, audioFiles, searchPath);
    if (match) foundPairs.push({ directory: searchPath, ...match });
  }
  return foundPairs;
}

// Find cue/audio pairs in a single directory
function findCueAudioPairsInDirectory(
  searchPath: string,
  options: CommandOptions,
): ResultAsync<CueAudioPair[], ReturnType<typeof fail>> {
  return safeAsync(() => readDirectory(searchPath), `Could not read directory ${searchPath}`)
    .andThen((files) => ResultAsync.fromSafePromise(findPairsInFiles(files, searchPath, options)))
    .orElse(() => ok([]));
}

function displayCueAudioPairs(pairs: CueAudioPair[]): void {
  logInfo(`Found ${pairs.length} unsplit cue/audio pairs:`);

  for (const pair of pairs) {
    logDirectory(`Directory: ${pair.directory}`);
    logFile(`  CUE: ${pair.cueFile}`);
    logMusic(`  Audio: ${pair.audioFile}`);
  }
}

// Display summary and get user confirmation
async function confirmProcessing(
  pairs: CueAudioPair[],
  ask: (q: string) => Promise<boolean>,
): Promise<boolean> {
  displayCueAudioPairs(pairs);

  return await ask("Do you want to proceed with splitting these files?");
}

// Process a single cue/audio pair using bash function
function processCueAudioPair(
  pair: CueAudioPair,
  ask: (q: string) => Promise<boolean>,
  bashFunctionsPath: string,
): ResultAsync<boolean, ReturnType<typeof fail>> {
  const { directory, cueFile } = pair;
  const cuePath = joinPath(directory, cueFile);

  return safeAsync(async () => {
    logProgress(`Processing: ${cueFile}`);
    logInfo(`Using bash functions from: ${bashFunctionsPath}`);

    await $`cd ${directory} && source ${bashFunctionsPath} && split_cue_audio ${cueFile}`;

    const proceed = await ask(
      "Do you want to cleanup original files and move split tracks to original directory?",
    );

    if (proceed) {
      await $`cd ${directory} && source ${bashFunctionsPath} && cleanup_temp_split ${cuePath}`;
    }

    logSuccess(`Successfully processed: ${cueFile}`);
    return true;
  }, `Failed to process ${cueFile}`).orElse((error) => {
    logError(formatError(error));
    return ok(false);
  });
}

export function processPairs(
  pairs: CueAudioPair[],
  ask: (q: string) => Promise<boolean>,
  bashFunctionsPath: string,
): ResultAsync<ProcessingSummary, ReturnType<typeof fail>> {
  return ResultAsync.fromSafePromise(
    pairs.reduce(
      async (summaryPromise, pair) => {
        const summary = await summaryPromise;
        if (summary.failureCount > 0) {
          return summary;
        }

        const folderContents = await readDirectory(pair.directory);
        logDirectory(`Contents of ${pair.directory}:`);
        for (const file of folderContents) {
          logFile(`-  ${file}`);
        }
        logInfo("");

        const doProcess = await ask(`Do you want to process ${pair.cueFile}?`);
        if (!doProcess) {
          logInfo(`Skipped: ${pair.cueFile}`);
          return summary;
        }

        const success = await processCueAudioPair(pair, ask, bashFunctionsPath).unwrapOr(false);

        return success
          ? { ...summary, successCount: summary.successCount + 1 }
          : { ...summary, failureCount: summary.failureCount + 1 };
      },
      Promise.resolve({ successCount: 0, failureCount: 0 }),
    ),
  );
}

function run(
  folderPath: string,
  options: CommandOptions,
): ResultAsync<void, ReturnType<typeof fail>> {
  const ask = async (q: string) => (options.yes ? true : confirmPrompt(q));

  return (
    safeAsync(() => exists(folderPath), `Failed to access ${folderPath}`)
      .andThen((folderExists) =>
        folderExists
          ? ok<void, ReturnType<typeof fail>>(undefined)
          : err(fail(`Directory '${folderPath}' does not exist or is not accessible`)),
      )
      // biome-ignore lint/suspicious/useIterableCallbackReturn: Result.map for terminal side effect
      .map(() => {
        logInfo(`Scanning '${folderPath}' for unsplit cue/audio pairs...`);
        if (options.ignoreFailed) {
          logInfo("Ignoring directories with empty __temp_split folders");
        }
      })
      .andThen(() => scanCueAudioPairs(folderPath, options))
      .andThen((pairs) => {
        if (pairs.length === 0) {
          logInfo("No unsplit cue/audio pairs found.");
          return ResultAsync.ok(undefined);
        }

        if (options.dryRun) {
          displayCueAudioPairs(pairs);
          logInfo("Dry-run only. No files were changed.");
          logInfo(`Would process ${pairs.length} cue/audio pairs.`);
          return ResultAsync.ok(undefined);
        }

        return safeAsync(() => confirmProcessing(pairs, ask), "Failed to confirm processing")
          .andThen((proceed) =>
            proceed
              ? getBashFunctionsPath().map((bashFunctionsPath) => ({
                  bashFunctionsPath,
                  pairs,
                }))
              : ResultAsync.ok({
                  bashFunctionsPath: "",
                  pairs: [] as CueAudioPair[],
                }),
          )
          .andThen(({ bashFunctionsPath, pairs: confirmedPairs }) => {
            if (confirmedPairs.length === 0) {
              logInfo("Operation cancelled.");
              return ResultAsync.ok(undefined);
            }

            logProgress("Processing files...");

            return processPairs(confirmedPairs, ask, bashFunctionsPath).andThen(
              ({ successCount, failureCount }) => {
                if (failureCount > 0) {
                  logError("Stopping processing due to failure.");
                }

                displaySummary(successCount, failureCount, confirmedPairs.length);

                if (failureCount > 0) {
                  process.exitCode = 1;
                }

                return ResultAsync.ok(undefined);
              },
            );
          });
      })
  );
}

export default function fixUnsplitCueCommand(program: Command): void {
  program
    .command("fix-unsplit-cue")
    .description(
      "Scan for unsplit CUE/Audio pairs (FLAC/WAV/WV) and split them using bash functions",
    )
    .argument("<folder_path>", "Root folder to scan recursively")
    .option("--dry-run", "Preview pairs without splitting files", false)
    .option(
      "-i, --ignore-failed",
      "Skip directories that contain an empty __temp_split folder",
      false,
    )
    .option("-y, --yes", 'Assume "yes" to all confirmations', false)
    .action(async (folderPath: string, options: Record<string, unknown>) => {
      await runParsedCommand(
        optionsSchema,
        options,
        "Invalid fix-unsplit-cue options",
        (parsedOptions) => run(folderPath, parsedOptions),
        (error) => {
          logError(`Script failed: ${formatError(error)}`);
          process.exit(1);
        },
      );
    });
}
