import { cp, mkdir, rename } from "node:fs/promises";
import path from "node:path";
import type { MovePlan } from "@nas-tools/core";
import { and, eq, gt } from "drizzle-orm";

import { type CuePair, findCuePairs, getBashFunctionsPath, splitCuePair } from "./cue.js";
import { db, jobEvents, jobs } from "./db.js";
import { triggerPlexMusicScan } from "./plex.js";
import { cleanCompletedTorrents } from "./transmission.js";

export type JobStatus =
  | "queued"
  | "running"
  | "completed"
  | "completed_with_failures"
  | "failed"
  | "canceled"
  | "interrupted";

export type JobCounts = {
  total: number;
  completed: number;
  failed: number;
  skipped: number;
};

const TERMINAL_STATUSES = new Set<JobStatus>([
  "completed",
  "completed_with_failures",
  "failed",
  "canceled",
  "interrupted",
]);

export function isTerminalStatus(status: JobStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

const activeControllers = new Map<string, AbortController>();

export function cancelJob(jobId: string): boolean {
  const controller = activeControllers.get(jobId);
  if (!controller) return false;
  controller.abort();
  return true;
}

export function executeJob(jobId: string, plan: MovePlan): void {
  const controller = new AbortController();
  activeControllers.set(jobId, controller);

  // Fire-and-forget — caller gets job ID immediately
  runExecution(jobId, plan, controller.signal).finally(() => {
    activeControllers.delete(jobId);
  });
}

type JobEventLevel = "info" | "warning" | "error";
type JobEmitter = (type: string, level: JobEventLevel, message: string, data?: unknown) => void;

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

async function runExecution(jobId: string, plan: MovePlan, signal: AbortSignal): Promise<void> {
  const now = () => new Date().toISOString();
  let seq = 0;

  const emit = (type: string, level: JobEventLevel, message: string, data?: unknown) => {
    db.insert(jobEvents)
      .values({
        id: crypto.randomUUID(),
        jobId,
        seq: seq++,
        type,
        level,
        message,
        data: data != null ? JSON.stringify(data) : null,
        createdAt: now(),
      })
      .run();
  };

  const setJobStatus = (
    status: JobStatus,
    counts: JobCounts,
    extra: Partial<{ startedAt: string; completedAt: string }> = {},
  ) => {
    db.update(jobs)
      .set({
        status,
        counts: JSON.stringify(counts),
        updatedAt: now(),
        ...extra,
      })
      .where(eq(jobs.id, jobId))
      .run();
  };

  const included = plan.items.filter((item) => item.included);
  const counts: JobCounts = {
    total: included.length,
    completed: 0,
    failed: 0,
    skipped: 0,
  };

  setJobStatus("running", counts, { startedAt: now() });
  emit("job_started", "info", `Starting move of ${counts.total} item(s)`);

  for (const item of included) {
    if (signal.aborted) {
      setJobStatus("canceled", counts, { completedAt: now() });
      emit("job_canceled", "info", "Job canceled by user");
      return;
    }

    emit("item_started", "info", `Moving: ${item.albumName}`, {
      itemId: item.id,
    });

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
      await rename(item.sourcePath, item.targetPath);
      emit("move_completed", "info", `Move complete: ${item.albumName}`, {
        itemId: item.id,
        targetPath: item.targetPath,
      });

      await splitCueForMovedItem(item, plan, emit);

      counts.completed++;
      emit("item_completed", "info", `Done: ${item.albumName} → ${item.targetPath}`, {
        itemId: item.id,
      });
    } catch (cause) {
      counts.failed++;
      const message = cause instanceof Error ? cause.message : String(cause);
      emit("item_failed", "error", `Failed: ${item.albumName} — ${message}`, {
        itemId: item.id,
      });
    }

    setJobStatus("running", counts);
  }

  const finalStatus = counts.failed === 0 ? "completed" : "completed_with_failures";
  setJobStatus(finalStatus, counts, { completedAt: now() });
  emit(
    "job_completed",
    counts.failed === 0 ? "info" : "warning",
    `Done: ${counts.completed} moved, ${counts.failed} failed`,
    counts,
  );

  if (counts.completed > 0) {
    try {
      const { removed } = await cleanCompletedTorrents(plan.config.stagingDir);
      emit(
        "torrents_cleaned",
        "info",
        `Removed ${removed} completed torrent${removed !== 1 ? "s" : ""} from Transmission`,
      );
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      emit("torrents_clean_failed", "warning", `Torrent cleanup skipped: ${message}`);
    }
  }

  const hasMusicItems = included.some((item) => item.mediaType === "music");
  if (hasMusicItems && counts.completed > 0) {
    try {
      const sectionTitle = await triggerPlexMusicScan();
      emit("plex_scan_triggered", "info", `Plex library scan triggered: ${sectionTitle}`);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      emit("plex_scan_failed", "warning", `Plex scan skipped: ${message}`);
    }
  }
}

export function executeCueJob(jobId: string, pairs: CuePair[]): void {
  const controller = new AbortController();
  activeControllers.set(jobId, controller);

  runCueExecution(jobId, pairs, controller.signal).finally(() => {
    activeControllers.delete(jobId);
  });
}

async function runCueExecution(
  jobId: string,
  pairs: CuePair[],
  signal: AbortSignal,
): Promise<void> {
  const now = () => new Date().toISOString();
  let seq = 0;

  const emit = (type: string, level: JobEventLevel, message: string, data?: unknown) => {
    db.insert(jobEvents)
      .values({
        id: crypto.randomUUID(),
        jobId,
        seq: seq++,
        type,
        level,
        message,
        data: data != null ? JSON.stringify(data) : null,
        createdAt: now(),
      })
      .run();
  };

  const setJobStatus = (
    status: JobStatus,
    counts: JobCounts,
    extra: Partial<{ startedAt: string; completedAt: string }> = {},
  ) => {
    db.update(jobs)
      .set({
        status,
        counts: JSON.stringify(counts),
        updatedAt: now(),
        ...extra,
      })
      .where(eq(jobs.id, jobId))
      .run();
  };

  const counts: JobCounts = {
    total: pairs.length,
    completed: 0,
    failed: 0,
    skipped: 0,
  };

  setJobStatus("running", counts, { startedAt: now() });
  emit("job_started", "info", `Starting CUE fix for ${counts.total} pair(s)`);

  const bashFunctionsPath = await getBashFunctionsPath();
  if (!bashFunctionsPath) {
    setJobStatus("failed", counts, { completedAt: now() });
    emit(
      "job_failed",
      "error",
      "Could not find bash/functions.sh. Set NAS_TOOLS_BASH_FUNCTIONS_PATH.",
    );
    return;
  }

  for (const pair of pairs) {
    if (signal.aborted) {
      setJobStatus("canceled", counts, { completedAt: now() });
      emit("job_canceled", "info", "Job canceled by user");
      return;
    }

    if (pair.blocked) {
      counts.skipped++;
      emit("item_skipped", "warning", `Skipped blocked CUE: ${pair.cueFile}`, pair);
      setJobStatus("running", counts);
      continue;
    }

    emit("item_started", "info", `Splitting: ${pair.cueFile}`, pair);

    try {
      await splitCuePair({
        pair,
        bashFunctionsPath,
        onLine: (line) => emit("item_log", "info", line, { pairId: pair.id }),
      });
      counts.completed++;
      emit("item_completed", "info", `Split complete: ${pair.cueFile}`, pair);
    } catch (cause) {
      counts.failed++;
      const message = cause instanceof Error ? cause.message : String(cause);
      emit("item_failed", "error", `Failed: ${pair.cueFile} — ${message}`, pair);
    }

    setJobStatus("running", counts);
  }

  const finalStatus = counts.failed === 0 ? "completed" : "completed_with_failures";
  setJobStatus(finalStatus, counts, { completedAt: now() });
  emit(
    "job_completed",
    counts.failed === 0 ? "info" : "warning",
    `Done: ${counts.completed} split, ${counts.failed} failed, ${counts.skipped} skipped`,
    counts,
  );
}

export function getJobEvents(jobId: string, afterSeq = -1) {
  return db
    .select()
    .from(jobEvents)
    .where(and(eq(jobEvents.jobId, jobId), gt(jobEvents.seq, afterSeq)))
    .orderBy(jobEvents.seq)
    .all();
}
