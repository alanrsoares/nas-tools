import { readdir, rm } from "node:fs/promises";
import type { MovePlan } from "@nas-tools/core";

import type { JobEmitter } from "./job-types.js";
import { smartMerge } from "./smart-merge.js";

export async function mergeIntoExistingTarget(
  item: MovePlan["items"][number],
  emit: JobEmitter,
  force: boolean,
): Promise<void> {
  const [srcFiles, destFiles] = await Promise.all([
    readdir(item.sourcePath),
    readdir(item.targetPath),
  ]);
  const destSet = new Set(destFiles);
  const conflicts = srcFiles.filter((f) => destSet.has(f));
  if (conflicts.length > 0 && !force) {
    throw new Error(`Merge conflict — files already exist in target: ${conflicts.join(", ")}`);
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
}
