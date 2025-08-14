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
} as const;

export const MUSIC_EXTENSIONS = [
  FILE_EXTENSIONS.FLAC,
  FILE_EXTENSIONS.MP3,
  FILE_EXTENSIONS.M4A,
  FILE_EXTENSIONS.WAV,
  FILE_EXTENSIONS.OGG,
] as const;

// File system utilities
export const exists = async (path: string): Promise<boolean> =>
  await fs
    .access(path)
    .then(() => true)
    .catch(() => false);

export const ensureDirectory = async (dirPath: string): Promise<void> => {
  await fs.mkdir(dirPath, { recursive: true });
};

export const readDirectory = async (dirPath: string): Promise<string[]> => {
  return await fs.readdir(dirPath);
};

export const readDirectoryWithTypes = async (dirPath: string) => {
  return await fs.readdir(dirPath, { withFileTypes: true });
};

// File type checking utilities
export const isMusicFile = (file: string): boolean =>
  MUSIC_EXTENSIONS.some((ext) => file.toLowerCase().endsWith(ext));

export const isFlacFile = (file: string): boolean =>
  file.toLowerCase().endsWith(FILE_EXTENSIONS.FLAC);

export const isCueFile = (file: string): boolean =>
  file.toLowerCase().endsWith(FILE_EXTENSIONS.CUE);

export const hasExtension = (file: string, extension: string): boolean =>
  file.toLowerCase().endsWith(extension.toLowerCase());

// Path manipulation utilities
export const getBasename = (file: string, ext?: string): string => {
  return ext ? path.basename(file, ext) : path.basename(file);
};

export const getDirname = (filePath: string): string => path.dirname(filePath);

export const joinPath = (...paths: string[]): string => path.join(...paths);

export const resolvePath = (...paths: string[]): string =>
  path.resolve(...paths);

// User interaction utilities
export const confirm = async (message: string): Promise<boolean> => {
  const { proceed } = await inquirer.prompt<{ proceed: boolean }>([
    {
      type: "confirm",
      name: "proceed",
      message,
      default: true,
    },
  ]);
  return proceed;
};

export const promptForInput = async (
  message: string,
  defaultValue?: string,
  validator?: (input: string) => boolean | string
): Promise<string> => {
  const { value } = await inquirer.prompt<{ value: string }>([
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
export const logInfo = (message: string): void => {
  console.log(`ℹ️  ${message}`);
};

export const logSuccess = (message: string): void => {
  console.log(`✅ ${message}`);
};

export const logWarning = (message: string): void => {
  console.log(`⚠️  ${message}`);
};

export const logError = (message: string): void => {
  console.error(`❌ ${message}`);
};

export const logProgress = (message: string): void => {
  console.log(`🔄 ${message}`);
};

export const logFile = (message: string): void => {
  console.log(`📁 ${message}`);
};

export const logMusic = (message: string): void => {
  console.log(`🎵 ${message}`);
};

export const logDirectory = (message: string): void => {
  console.log(`📂 ${message}`);
};

// Error handling utilities
export const handleError = (error: unknown, context: string): void => {
  if (error instanceof Error) {
    logError(`${context}: ${error.message}`);
  } else {
    logError(`${context}: ${String(error)}`);
  }
};

export const withErrorHandling = async <T>(
  operation: () => Promise<T>,
  context: string,
  fallback?: T
): Promise<T | undefined> => {
  try {
    return await operation();
  } catch (error) {
    handleError(error, context);
    return fallback;
  }
};

// File operation utilities
export const moveFile = async (
  source: string,
  destination: string
): Promise<void> => {
  await fs.rename(source, destination);
};

export const copyFile = async (
  source: string,
  destination: string
): Promise<void> => {
  await fs.copyFile(source, destination);
};

export const removeFile = async (filePath: string): Promise<void> => {
  await fs.unlink(filePath);
};

export const removeDirectory = async (dirPath: string): Promise<void> => {
  await fs.rmdir(dirPath, { recursive: true });
};

// Validation utilities
export const validateDirectory = async (dirPath: string): Promise<boolean> => {
  const $exists = await exists(dirPath);
  if (!$exists) {
    logError(`Directory '${dirPath}' does not exist or is not accessible`);
    return false;
  }
  return true;
};

export const validateFile = async (filePath: string): Promise<boolean> => {
  const $exists = await exists(filePath);
  if (!$exists) {
    logError(`File '${filePath}' does not exist or is not accessible`);
    return false;
  }
  return true;
};

// Array utilities
export const filterFiles = (
  files: string[],
  predicate: (file: string) => boolean
): string[] => {
  return files.filter(predicate);
};

export const mapFiles = <T>(
  files: string[],
  mapper: (file: string) => T
): T[] => {
  return files.map(mapper);
};

// Summary utilities
export const displaySummary = (
  successCount: number,
  failureCount: number,
  totalCount: number
): void => {
  console.log("\n📊 Summary:");
  
  if (successCount > 0) {
    console.log(`✅ Successfully moved: ${successCount} albums`);
  }
  
  if (failureCount > 0) {
    console.log(`❌ Failed: ${failureCount} albums`);
  }
  
  if (successCount === totalCount) {
    console.log("🎉 All albums processed successfully!");
  } else if (successCount > 0) {
    console.log(`📁 Processed ${successCount}/${totalCount} albums`);
  } else {
    console.log("😞 No albums were processed successfully");
  }
};

// Common types
export interface FileInfo {
  name: string;
  path: string;
  isDirectory: boolean;
}

export interface ProcessingResult {
  success: boolean;
  error?: string;
}

export interface SummaryStats {
  successCount: number;
  failureCount: number;
  totalCount: number;
}
