#!/usr/bin/env zx
import * as fs from "fs/promises";
import * as path from "path";
import inquirer from "inquirer";
// Common constants
export const FILE_EXTENSIONS = {
    CUE: ".cue",
    FLAC: ".flac",
    MP3: ".mp3",
    M4A: ".m4a",
    WAV: ".wav",
    OGG: ".ogg",
};
export const MUSIC_EXTENSIONS = [
    FILE_EXTENSIONS.FLAC,
    FILE_EXTENSIONS.MP3,
    FILE_EXTENSIONS.M4A,
    FILE_EXTENSIONS.WAV,
    FILE_EXTENSIONS.OGG,
];
// File system utilities
export const exists = async (path) => await fs
    .access(path)
    .then(() => true)
    .catch(() => false);
export const ensureDirectory = async (dirPath) => {
    await fs.mkdir(dirPath, { recursive: true });
};
export const readDirectory = async (dirPath) => {
    return await fs.readdir(dirPath);
};
export const readDirectoryWithTypes = async (dirPath) => {
    return await fs.readdir(dirPath, { withFileTypes: true });
};
// File type checking utilities
export const isMusicFile = (file) => MUSIC_EXTENSIONS.some((ext) => file.toLowerCase().endsWith(ext));
export const isFlacFile = (file) => file.toLowerCase().endsWith(FILE_EXTENSIONS.FLAC);
export const isCueFile = (file) => file.toLowerCase().endsWith(FILE_EXTENSIONS.CUE);
// Path manipulation utilities
export const getBasename = (file, ext) => {
    return ext ? path.basename(file, ext) : path.basename(file);
};
export const getDirname = (filePath) => path.dirname(filePath);
export const joinPath = (...paths) => path.join(...paths);
// User interaction utilities
export const confirm = async (message) => {
    const { proceed } = await inquirer.prompt([
        {
            type: "confirm",
            name: "proceed",
            message,
            default: true,
        },
    ]);
    return proceed;
};
export const promptForInput = async (message, defaultValue, validator) => {
    const { value } = await inquirer.prompt([
        {
            type: "input",
            name: "value",
            message,
            default: defaultValue,
            validate: validator,
        },
    ]);
    return value.trim();
};
// Logging utilities
export const logInfo = (message) => {
    console.log(`ℹ️  ${message}`);
};
export const logSuccess = (message) => {
    console.log(`✅ ${message}`);
};
export const logWarning = (message) => {
    console.log(`⚠️  ${message}`);
};
export const logError = (message) => {
    console.error(`❌ ${message}`);
};
export const logProgress = (message) => {
    console.log(`🔄 ${message}`);
};
export const logFile = (message) => {
    console.log(`📁 ${message}`);
};
export const logMusic = (message) => {
    console.log(`🎵 ${message}`);
};
export const logDirectory = (message) => {
    console.log(`📂 ${message}`);
};
// File operation utilities
export const moveFile = async (source, destination) => {
    await fs.rename(source, destination);
};
// Validation utilities
export const validateDirectory = async (dirPath) => {
    const $exists = await exists(dirPath);
    if (!$exists) {
        logError(`Directory '${dirPath}' does not exist or is not accessible`);
        return false;
    }
    return true;
};
// Summary utilities
export const displaySummary = (successCount, failureCount, totalCount) => {
    console.log("\n📊 Summary:");
    if (successCount > 0) {
        console.log(`✅ Successfully moved: ${successCount} albums`);
    }
    if (failureCount > 0) {
        console.log(`❌ Failed: ${failureCount} albums`);
    }
    if (successCount === totalCount) {
        console.log("🎉 All albums processed successfully!");
    }
    else if (successCount > 0) {
        console.log(`📁 Processed ${successCount}/${totalCount} albums`);
    }
    else {
        console.log("😞 No albums were processed successfully");
    }
};
