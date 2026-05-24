import { cp, mkdir, rename } from "node:fs/promises";
import path from "node:path";
import type { MovePlan } from "@nas-tools/core";
import { and, eq, gt } from "drizzle-orm";

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

async function runExecution(jobId: string, plan: MovePlan, signal: AbortSignal): Promise<void> {
  const now = () => new Date().toISOString();
  let seq = 0;

  const emit = (type: string, level: string, message: string, data?: unknown) => {
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
      await cp(item.sourcePath, backupDest, { recursive: true });
      await mkdir(path.dirname(item.targetPath), { recursive: true });
      await rename(item.sourcePath, item.targetPath);

      counts.completed++;
      emit("item_completed", "info", `Moved: ${item.albumName} → ${item.targetPath}`, {
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

export function getJobEvents(jobId: string, afterSeq = -1) {
  return db
    .select()
    .from(jobEvents)
    .where(and(eq(jobEvents.jobId, jobId), gt(jobEvents.seq, afterSeq)))
    .orderBy(jobEvents.seq)
    .all();
}
