import { readdir, rm } from "node:fs/promises";
import type { MovePlan } from "@nas-tools/core";

import type { JobEmitter } from "./job-types.js";
import { smartMerge } from "./smart-merge.js";

export type MergeOutcome =
  | { status: "merged" }
  | { status: "conflict"; conflictingFiles: string[] };

export async function mergeIntoExistingTarget(
  item: MovePlan["items"][number],
  emit: JobEmitter,
  force: boolean,
): Promise<MergeOutcome> {
  const [srcFiles, destFiles] = await Promise.all([
    readdir(item.sourcePath),
    readdir(item.targetPath),
  ]);
  const destSet = new Set(destFiles);
  const conflictingFiles = srcFiles.filter((f) => destSet.has(f));

  if (conflictingFiles.length > 0 && !force) {
    return { status: "conflict", conflictingFiles };
  }

  emit("move_merge", "warning", `Target exists, merging: ${item.albumName}`, { itemId: item.id });
  const { kept, replaced } = await smartMerge(item.sourcePath, item.targetPath);

  if (kept.length > 0) {
    emit("merge_kept", "info", `Kept higher-quality existing: ${kept.join(", ")}`, {
      itemId: item.id,
    });
  }
  if (replaced.length > 0) {
    emit("merge_replaced", "info", `Replaced with higher-quality source: ${replaced.join(", ")}`, {
      itemId: item.id,
    });
  }

  await rm(item.sourcePath, { recursive: true, force: true });
  return { status: "merged" };
}
