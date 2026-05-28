import type { Dirent } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { fromNullable, getOrElse, isNone, map as mapMaybe } from "@onrails/maybe";

import { safeAsync } from "../fp.js";
import { classifyGroup, classifyTempSplit, directoryScan } from "./classify.js";
import { isVisibleDirectory } from "./names.js";
import type { CueGroup, DirectoryScan, TempSplitGroup } from "./types.js";

async function readDirents(directory: string): Promise<Dirent[]> {
  return await safeAsync(
    () => readdir(directory, { withFileTypes: true }),
    `read ${directory}`,
  ).unwrapOr([]);
}

function childDirectoryPath(parent: string, entry: Dirent): string {
  return join(parent, entry.name);
}

export async function scanCueDirectories(
  directory: string,
  maxDepth: number,
  depth = 0,
): Promise<DirectoryScan[]> {
  const entries = await readDirents(directory);
  const current = getOrElse(
    mapMaybe(directoryScan(directory, entries), (scan) => [scan]),
    [],
  );
  if (depth >= maxDepth) {
    return current;
  }

  const childDirectories = entries
    .filter(isVisibleDirectory)
    .filter((entry) => entry.name !== "__temp_split");
  const nested = await childDirectories.reduce(
    async (scansPromise, entry) => {
      const scans = await scansPromise;
      const childScans = await scanCueDirectories(
        childDirectoryPath(directory, entry),
        maxDepth,
        depth + 1,
      );

      return [...scans, ...childScans];
    },
    Promise.resolve([] as DirectoryScan[]),
  );

  return [...current, ...nested];
}

function tempSplitEntry(entries: Dirent[]) {
  return fromNullable(
    entries.find((entry) => entry.isDirectory() && entry.name === "__temp_split"),
  );
}

async function tempSplitGroup(directory: string, tempEntry: Dirent): Promise<TempSplitGroup> {
  const tempDirectory = childDirectoryPath(directory, tempEntry);
  const entries = await readDirents(tempDirectory);

  return classifyTempSplit({ directory, tempDirectory, entries });
}

export async function scanTempSplitDirectories(
  directory: string,
  maxDepth: number,
  depth = 0,
): Promise<TempSplitGroup[]> {
  const entries = await readDirents(directory);
  const tempSplit = tempSplitEntry(entries);
  const current = isNone(tempSplit)
    ? ([] as TempSplitGroup[])
    : [await tempSplitGroup(directory, tempSplit.value)];
  if (depth >= maxDepth) {
    return current;
  }

  const childDirectories = entries
    .filter(isVisibleDirectory)
    .filter((entry) => entry.name !== "__temp_split");
  const nested = await childDirectories.reduce(
    async (groupsPromise, entry) => {
      const groups = await groupsPromise;
      const childGroups = await scanTempSplitDirectories(
        childDirectoryPath(directory, entry),
        maxDepth,
        depth + 1,
      );

      return [...groups, ...childGroups];
    },
    Promise.resolve([] as TempSplitGroup[]),
  );

  return [...current, ...nested].sort((a, b) => a.directory.localeCompare(b.directory));
}

export function groupCueDirectories(scans: DirectoryScan[]): CueGroup[] {
  return scans.map(classifyGroup).sort((a, b) => a.directory.localeCompare(b.directory));
}
