#!/usr/bin/env zx
import type { Dirent } from "fs";
import * as fs from "fs/promises";
import * as path from "path";
import inquirer from "inquirer";
import pc from "picocolors";

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

export async function ensureDirectory(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

export const readDirectory = async (dirPath: string): Promise<string[]> =>
  await fs.readdir(dirPath);

export const readDirectoryWithTypes = async (
  dirPath: string,
): Promise<Dirent[]> => await fs.readdir(dirPath, { withFileTypes: true });

// File type checking utilities
export const isMusicFile = (file: string): boolean =>
  MUSIC_EXTENSIONS.some((ext) => file.toLowerCase().endsWith(ext));

export const isFlacFile = (file: string): boolean =>
  file.toLowerCase().endsWith(FILE_EXTENSIONS.FLAC);

export const isCueFile = (file: string): boolean =>
  file.toLowerCase().endsWith(FILE_EXTENSIONS.CUE);

// Path manipulation utilities
export const getBasename = (file: string, ext?: string): string =>
  ext ? path.basename(file, ext) : path.basename(file);

export const getDirname = (filePath: string): string => path.dirname(filePath);

export const joinPath = (...paths: string[]): string => path.join(...paths);

// User interaction utilities
export async function confirm(message: string): Promise<boolean> {
  const { proceed } = await inquirer.prompt<{ proceed: boolean }>([
    {
      type: "confirm",
      name: "proceed",
      message,
      default: true,
    },
  ]);
  return proceed;
}

export async function promptForInput(
  message: string,
  defaultValue?: string,
  validator?: (input: string) => boolean | string,
): Promise<string> {
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
}

// Logging utilities
export const logInfo = (message: string): void =>
  console.log(`${pc.blue("ℹ")} ${message}`);

export const logSuccess = (message: string): void =>
  console.log(`${pc.green("✓")} ${message}`);

export const logWarning = (message: string): void =>
  console.log(`${pc.yellow("⚠")} ${message}`);

export const logError = (message: string): void =>
  console.error(`${pc.red("✗")} ${message}`);

export const logProgress = (message: string): void =>
  console.log(`${pc.cyan("⟳")} ${message}`);

export const logFile = (message: string): void =>
  console.log(`${pc.magenta("📄")} ${message}`);

export const logMusic = (message: string): void =>
  console.log(`${pc.blue("♪")} ${message}`);

export const logDirectory = (message: string): void =>
  console.log(`${pc.cyan("📁")} ${message}`);

// File operation utilities
export async function moveFile(
  source: string,
  destination: string,
): Promise<void> {
  await fs.rename(source, destination);
}

// Validation utilities
export async function validateDirectory(dirPath: string): Promise<boolean> {
  const $exists = await exists(dirPath);
  if (!$exists) {
    logError(`Directory '${dirPath}' does not exist or is not accessible`);
    return false;
  }
  return true;
}

// Summary utilities
export function displaySummary(
  successCount: number,
  failureCount: number,
  totalCount: number,
): void {
  console.log(`\n${pc.bold(pc.blue("📊 Summary:"))}`);

  if (successCount > 0) {
    console.log(
      `${pc.green("✓")} Successfully moved: ${pc.bold(
        successCount.toString(),
      )} albums`,
    );
  }

  if (failureCount > 0) {
    console.log(
      `${pc.red("✗")} Failed: ${pc.bold(failureCount.toString())} albums`,
    );
  }

  if (successCount === totalCount) {
    console.log(`${pc.green("★")} All albums processed successfully!`);
  } else if (successCount > 0) {
    console.log(
      `${pc.cyan("📁")} Processed ${pc.bold(successCount.toString())}/${pc.bold(
        totalCount.toString(),
      )} albums`,
    );
  } else {
    console.log(`${pc.red("☹")} No albums were processed successfully`);
  }
}
