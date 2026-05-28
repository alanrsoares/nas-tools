import { stat } from "node:fs/promises";
import path from "node:path";
import { type Maybe, none, some } from "@onrails/maybe";
import { parseFile } from "music-metadata";

import type { MediaType } from "./schemas.js";

const fileExtensions = {
  cue: ".cue",
  flac: ".flac",
  mp3: ".mp3",
  m4a: ".m4a",
  wav: ".wav",
  ogg: ".ogg",
  wv: ".wv",
  m4b: ".m4b",
  mkv: ".mkv",
  mp4: ".mp4",
  avi: ".avi",
} as const;

export const musicExtensions = [
  fileExtensions.flac,
  fileExtensions.mp3,
  fileExtensions.m4a,
  fileExtensions.wav,
  fileExtensions.ogg,
  fileExtensions.wv,
] as const;

const movieExtensions = [fileExtensions.mkv, fileExtensions.mp4, fileExtensions.avi] as const;
const tvPattern = /[sS]\d{1,2}[eE]\d{1,2}|[sS]\d{1,2}\s|[eE]\d{1,2}\s/i;

const fileNameEndsWith = (file: string, extensions: readonly string[]) =>
  extensions.some((ext) => file.toLowerCase().endsWith(ext));

export const isMusicFile = (file: string) => fileNameEndsWith(file, musicExtensions);
const isMovieFile = (file: string) => fileNameEndsWith(file, movieExtensions);
export const isCueFile = (file: string) => file.toLowerCase().endsWith(fileExtensions.cue);
const isTvFile = (file: string) => tvPattern.test(file);
const isAudiobookFile = (file: string, pathName?: string) =>
  file.toLowerCase().endsWith(fileExtensions.m4b) ||
  Boolean(pathName?.toLowerCase().includes("audiobook"));

export function detectMediaType(
  dirName: string,
  files: string[],
  dirPath: string,
): Maybe<MediaType> {
  if (isTvFile(dirName) || files.some(isTvFile)) return some("tv");
  if (isAudiobookFile(dirName, dirPath) || files.some((file) => isAudiobookFile(file))) {
    return some("audiobook");
  }
  if (files.some((file) => isMusicFile(file) || isCueFile(file))) return some("music");
  if (files.some(isMovieFile)) return some("movie");
  return none();
}

const audioExts = new Set(musicExtensions as readonly string[]);

export function isAudioFile(filePath: string): boolean {
  return audioExts.has(path.extname(filePath).toLowerCase());
}

export async function getAudioQualityScore(filePath: string): Promise<number> {
  try {
    const meta = await parseFile(filePath, { duration: false });
    const bits = meta.format.bitsPerSample ?? 0;
    const rate = meta.format.sampleRate ?? 0;
    const { size } = await stat(filePath);
    return bits * 1_000_000 + rate * 10 + size / 1_000_000;
  } catch {
    return 0;
  }
}
