import type { Dirent } from "node:fs";
import { cp, readdir } from "node:fs/promises";
import path from "node:path";
import { getAudioQualityScore, isAudioFile } from "@nas-tools/core";

export type MergeResult = { kept: string[]; replaced: string[] };

const emptyMerge = (): MergeResult => ({ kept: [], replaced: [] });

async function mergeAudioConflict(
  entry: Dirent,
  srcPath: string,
  destPath: string,
): Promise<MergeResult> {
  const [srcScore, destScore] = await Promise.all([
    getAudioQualityScore(srcPath),
    getAudioQualityScore(destPath),
  ]);
  if (srcScore > destScore) {
    await cp(srcPath, destPath);
    return { kept: [], replaced: [entry.name] };
  }
  return { kept: [entry.name], replaced: [] };
}

async function mergeConflictingEntry(
  entry: Dirent,
  srcPath: string,
  destPath: string,
): Promise<MergeResult> {
  if (entry.isDirectory()) return smartMerge(srcPath, destPath);
  if (!isAudioFile(entry.name)) return emptyMerge();
  return mergeAudioConflict(entry, srcPath, destPath);
}

export async function smartMerge(srcDir: string, destDir: string): Promise<MergeResult> {
  const kept: string[] = [];
  const replaced: string[] = [];

  const [srcEntries, destEntries] = await Promise.all([
    readdir(srcDir, { withFileTypes: true }),
    readdir(destDir, { withFileTypes: true }),
  ]);
  const destNames = new Set(destEntries.map((e) => e.name));

  for (const entry of srcEntries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    if (!destNames.has(entry.name)) {
      await cp(srcPath, destPath, { recursive: true });
      continue;
    }

    const result = await mergeConflictingEntry(entry, srcPath, destPath);
    kept.push(...result.kept);
    replaced.push(...result.replaced);
  }

  return { kept, replaced };
}
