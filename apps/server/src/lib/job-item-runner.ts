import { cp, mkdir, rename } from "node:fs/promises";
import path from "node:path";
import type { MovePlan } from "@nas-tools/core";

import { findCuePairs, getBashFunctionsPath, splitCuePair } from "../cue.js";
import type { JobEmitter } from "./job-types.js";
import { mergeIntoExistingTarget } from "./merge-into-target.js";

export type ItemOutcome =
  | { status: "completed" }
  | { status: "conflict"; conflictingFiles: string[] }
  | { status: "failed"; cause: unknown };

export type JobItemRunner = {
  run(item: MovePlan["items"][number], plan: MovePlan, emit: JobEmitter): Promise<ItemOutcome>;
  runForced(
    item: MovePlan["items"][number],
    plan: MovePlan,
    emit: JobEmitter,
  ): Promise<ItemOutcome>;
};

async function splitCueForMovedItem(
  item: MovePlan["items"][number],
  plan: MovePlan,
  emit: JobEmitter,
): Promise<void> {
  if (!plan.cueSplitEnabled || item.mediaType !== "music") return;

  emit("cue_scan_started", "info", `Scanning for CUE pairs: ${item.albumName}`, {
    itemId: item.id,
  });

  const pairs = await findCuePairs(item.targetPath, 6);
  if (pairs.length === 0) {
    emit("cue_scan_completed", "info", `No CUE pairs found: ${item.albumName}`, {
      itemId: item.id,
    });
    return;
  }

  const bashFunctionsPath = await getBashFunctionsPath();
  if (!bashFunctionsPath) {
    throw new Error("Could not find bash/functions.sh. Set NAS_TOOLS_BASH_FUNCTIONS_PATH.");
  }

  emit("cue_scan_completed", "info", `Found ${pairs.length} CUE pair(s): ${item.albumName}`, {
    itemId: item.id,
    total: pairs.length,
  });

  for (const pair of pairs) {
    if (pair.blocked) {
      emit("cue_skipped", "warning", `Skipped blocked CUE: ${pair.cueFile}`, {
        itemId: item.id,
        pair,
      });
      continue;
    }

    emit("cue_started", "info", `Splitting CUE: ${pair.cueFile}`, { itemId: item.id, pair });
    await splitCuePair({
      pair,
      bashFunctionsPath,
      onLine: (line) => emit("cue_log", "info", line, { itemId: item.id, pairId: pair.id }),
    });
    emit("cue_completed", "info", `Split CUE complete: ${pair.cueFile}`, {
      itemId: item.id,
      pair,
    });
  }
}

async function runItem(
  item: MovePlan["items"][number],
  plan: MovePlan,
  emit: JobEmitter,
  force: boolean,
): Promise<ItemOutcome> {
  try {
    const backupDest = path.join(plan.config.backupDir, item.albumName);
    emit("backup_started", "info", `Backing up: ${item.albumName}`, { itemId: item.id });
    await cp(item.sourcePath, backupDest, { recursive: true });
    emit("backup_completed", "info", `Backup complete: ${item.albumName}`, {
      itemId: item.id,
      backupDest,
    });

    await mkdir(path.dirname(item.targetPath), { recursive: true });
    emit("move_started", "info", `Moving: ${item.albumName}`, { itemId: item.id });

    try {
      await rename(item.sourcePath, item.targetPath);
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code !== "ENOTEMPTY") throw cause;
      const mergeResult = await mergeIntoExistingTarget(item, emit, force);
      if (mergeResult.status === "conflict") {
        return { status: "conflict", conflictingFiles: mergeResult.conflictingFiles };
      }
    }

    emit("move_completed", "info", `Move complete: ${item.albumName}`, {
      itemId: item.id,
      targetPath: item.targetPath,
    });

    await splitCueForMovedItem(item, plan, emit);

    return { status: "completed" };
  } catch (cause) {
    return { status: "failed", cause };
  }
}

export const createFsItemRunner = (): JobItemRunner => ({
  run: (item, plan, emit) => runItem(item, plan, emit, false),
  runForced: (item, plan, emit) => runItem(item, plan, emit, true),
});
