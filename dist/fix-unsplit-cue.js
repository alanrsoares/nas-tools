#!/usr/bin/env zx
import { $ } from "zx";
import { Command } from "commander";
import invariant from "tiny-invariant";
import { exists, confirm as confirmPrompt, isFlacFile, isCueFile, getBasename, logInfo, logSuccess, logError, logProgress, logFile, logDirectory, logMusic, readDirectory, readDirectoryWithTypes, displaySummary, joinPath, FILE_EXTENSIONS, } from "./utils.js";
const BASH_FUNCTIONS_PATH = "/home/admin/dev/nas-tools/bash/functions.sh";
// Utility functions
function isWavFile(file) {
    return file.toLowerCase().endsWith(FILE_EXTENSIONS.WAV);
}
function isAudioFile(file) {
    return isFlacFile(file) || isWavFile(file);
}
// Scan for matching .cue and audio files that are not split (recursive)
async function scanCueAudioPairs(searchPath, options) {
    invariant(searchPath, "Search path is required");
    const foundPairs = [];
    try {
        // Check the current directory for cue/audio pairs
        const currentDirPairs = await findCueAudioPairsInDirectory(searchPath, options);
        foundPairs.push(...currentDirPairs);
        const entries = await readDirectoryWithTypes(searchPath);
        const subdirectories = entries
            .filter((dirent) => dirent.isDirectory())
            .map((dirent) => joinPath(searchPath, dirent.name));
        for (const subdir of subdirectories) {
            try {
                const subdirPairs = await scanCueAudioPairs(subdir, options);
                foundPairs.push(...subdirPairs);
            }
            catch {
                // Skip if subdirectory can't be accessed
                continue;
            }
        }
    }
    catch (error) {
        logError(`Error scanning directories: ${error}`);
    }
    return foundPairs;
}
// Find cue/audio pairs in a single directory
async function findCueAudioPairsInDirectory(searchPath, options) {
    const foundPairs = [];
    try {
        const files = await readDirectory(searchPath);
        const cueFiles = files.filter(isCueFile);
        const audioFiles = files.filter(isAudioFile);
        if (options.ignoreFailed && files.includes("__temp_split")) {
            logInfo(`Skipping directory with __temp_split: ${searchPath}`);
            return foundPairs;
        }
        for (const cueFile of cueFiles) {
            const cueBasename = getBasename(cueFile, FILE_EXTENSIONS.CUE);
            for (const audioFile of audioFiles) {
                let audioBasename;
                if (isFlacFile(audioFile)) {
                    audioBasename = getBasename(audioFile, FILE_EXTENSIONS.FLAC);
                }
                else if (isWavFile(audioFile)) {
                    audioBasename = getBasename(audioFile, FILE_EXTENSIONS.WAV);
                }
                else {
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
    }
    catch {
        // Skip if current directory can't be read
    }
    return foundPairs;
}
// Display summary and get user confirmation
async function confirmProcessing(pairs, ask) {
    logInfo(`Found ${pairs.length} unsplit cue/audio pairs:`);
    for (const pair of pairs) {
        logDirectory(`Directory: ${pair.directory}`);
        logFile(`  CUE: ${pair.cueFile}`);
        logMusic(`  Audio: ${pair.audioFile}`);
    }
    return await ask("Do you want to proceed with splitting these files?");
}
// Process a single cue/audio pair using bash function
async function processCueAudioPair(pair, ask) {
    const { directory, cueFile } = pair;
    invariant(directory, "Directory is required");
    invariant(cueFile, "Cue file is required");
    const cuePath = joinPath(directory, cueFile);
    try {
        logProgress(`Processing: ${cueFile}`);
        // Change to the directory and run the bash function
        await $ `cd ${directory} && source ${BASH_FUNCTIONS_PATH} && split_cue_audio ${cueFile}`;
        const proceed = await ask("Do you want to cleanup original files and move split tracks to original directory?");
        if (proceed) {
            await $ `cd ${directory} && source ${BASH_FUNCTIONS_PATH} && cleanup_temp_split ${cuePath}`;
        }
        logSuccess(`Successfully processed: ${cueFile}`);
        return true;
    }
    catch (error) {
        logError(`Failed to process ${cueFile}: ${error}`);
        return false;
    }
}
/**
 * Fix Unsplit CUE Files CLI
 *
 * Scans directories for unsplit CUE/Audio file pairs (FLAC or WAV) and provides an interactive
 * interface to split them using bash functions.
 *
 * Usage:
 *   tsx fix-unsplit-cue.ts [options] <folder_path>
 *
 * Options:
 *   -i, --ignore-failed   Skip directories that have an empty __temp_split folder
 *   -y, --yes             Assume "yes" to all confirmations (non-interactive)
 *   -V, --version         Show version
 *   -h, --help            Show help
 */
async function run(folderPath, options) {
    const folderExists = await exists(folderPath);
    invariant(folderExists, `❌ Directory '${folderPath}' does not exist or is not accessible`);
    const ask = async (q) => (options.yes ? true : confirmPrompt(q));
    logInfo(`Scanning '${folderPath}' for unsplit cue/audio pairs...`);
    if (options.ignoreFailed) {
        logInfo("Ignoring directories with empty __temp_split folders");
    }
    const pairs = await scanCueAudioPairs(folderPath, options);
    if (pairs.length === 0) {
        logInfo("No unsplit cue/audio pairs found.");
        return;
    }
    const proceed = await confirmProcessing(pairs, ask);
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
        const doProcess = await ask(`Do you want to process ${pair.cueFile}?`);
        if (!doProcess) {
            logInfo(`Skipped: ${pair.cueFile}`);
            continue;
        }
        const success = await processCueAudioPair(pair, ask);
        if (success) {
            successCount++;
        }
        else {
            failureCount++;
            logError("Stopping processing due to failure.");
            break; // Fail-fast: Stop processing on first failure
        }
    }
    displaySummary(successCount, failureCount, pairs.length);
    if (failureCount > 0) {
        process.exitCode = 1;
    }
}
// Commander CLI setup
const program = new Command();
program
    .name("fix-unsplit-cue")
    .description("Scan for unsplit CUE/Audio pairs (FLAC/WAV) and split them using your bash functions.")
    .argument("<folder_path>", "Root folder to scan recursively")
    .option("-i, --ignore-failed", "Skip directories that contain an empty __temp_split folder", false)
    .option("-y, --yes", 'Assume "yes" to all confirmations', false)
    .showHelpAfterError()
    .version("1.0.0")
    .action(async (folderPath, opts) => {
    const options = {
        ignoreFailed: Boolean(opts["ignoreFailed"]),
        yes: Boolean(opts["yes"]),
    };
    try {
        await run(folderPath, options);
    }
    catch (error) {
        logError(`Script failed: ${error}`);
        process.exit(1);
    }
});
await program.parseAsync(process.argv);
