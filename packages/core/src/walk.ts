import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { ResultAsync } from "@onrails/result";

import { type CoreError, toCoreError } from "./errors.js";

export interface WalkEntry {
  path: string;
  name: string;
  isDirectory: boolean;
  size: number;
  mtimeMs: number;
}

async function walkDir(
  dir: string,
  depth: number,
  maxDepth: number,
  includeHidden: boolean,
): Promise<WalkEntry[]> {
  if (depth > maxDepth) return [];
  const names = await readdir(dir).catch(() => [] as string[]);
  const entries: WalkEntry[] = [];
  for (const name of names) {
    if (!includeHidden && name.startsWith(".")) continue;
    const entryPath = path.join(dir, name);
    const entryStat = await stat(entryPath).catch(() => undefined);
    if (!entryStat) continue;
    const isDirectory = entryStat.isDirectory();
    entries.push({
      path: entryPath,
      name,
      isDirectory,
      size: entryStat.size,
      mtimeMs: entryStat.mtimeMs,
    });
    if (isDirectory) {
      entries.push(...(await walkDir(entryPath, depth + 1, maxDepth, includeHidden)));
    }
  }
  return entries;
}

export function walk(
  root: string,
  options: { maxDepth?: number; includeHidden?: boolean } = {},
): ResultAsync<WalkEntry[], CoreError> {
  return ResultAsync.fromPromise(
    walkDir(root, 0, options.maxDepth ?? Infinity, options.includeHidden ?? false),
    (cause) => toCoreError(`Failed to walk directory: ${root}`, cause),
  );
}
