import { cp, mkdir, rename } from "node:fs/promises";
import path from "node:path";
import type { MovePlan } from "@nas-tools/core";

import { type CuePair, findCuePairs, getBashFunctionsPath, splitCuePair } from "./cue.js";
import type { JobEventsRepo, JobsRepo } from "./db/index.js";
import { errorMessage } from "./lib/job-lifecycle.js";
import type {
  ConflictResolution,
  CuePairOutcome,
  JobCounts,
  JobEmitter,
  JobStatusExtra,
  JobStatusUpdater,
} from "./lib/job-types.js";
import { mergeIntoExistingTarget } from "./lib/merge-into-target.js";
import { runCueJob } from "./lib/run-cue-job.js";
import { runMoveJob } from "./lib/run-move-job.js";

export { isTerminalStatus, type JobCounts, type JobStatus } from "./lib/job-types.js";

import { triggerPlexMusicScan } from "./plex.js";
import { cleanCompletedTorrents } from "./transmission.js";

type ExecutionRepos = {
  jobs: JobsRepo;
  jobEvents: JobEventsRepo;
};

export type ExecutionService = {
  executeJob: (jobId: string, plan: MovePlan) => void;
  executeCueJob: (jobId: string, pairs: CuePair[]) => void;
  getJobEvents: JobEventsRepo["listAfter"];
  cancelJob: (jobId: string) => boolean;
  resolveConflictItem: (
    jobId: string,
    item: MovePlan["items"][number],
    plan: MovePlan,
    resolution: ConflictResolution,
  ) => Promise<void>;
};

export const createExecutionService = (repos: ExecutionRepos): ExecutionService => {
  const activeControllers = new Map<string, AbortController>();

  const makeEmitter = (jobId: string): JobEmitter => {
    let seq = 0;
    return (type, level, message, data) => {
      repos.jobEvents.append({ jobId, seq: seq++, type, level, message, data });
    };
  };

  const makeJobStatusUpdater = (jobId: string): JobStatusUpdater => {
    return (status, counts, extra: JobStatusExtra = {}) => {
      repos.jobs.updateStatus(jobId, status, counts, extra);
    };
  };

  const cancelJob = (jobId: string): boolean => {
    const controller = activeControllers.get(jobId);
    if (!controller) return false;
    controller.abort();
    return true;
  };

  const resolveConflictItem = async (
    jobId: string,
    item: MovePlan["items"][number],
    plan: MovePlan,
    resolution: ConflictResolution,
  ): Promise<void> => {
    const emit = makeEmitter(jobId);
    if (resolution === "skip") {
      emit("conflict_skipped", "warning", `Conflict skipped: ${item.albumName}`, {
        itemId: item.id,
      });
      return;
    }
    emit("item_started", "info", `Retrying (force merge): ${item.albumName}`, { itemId: item.id });
    try {
      await moveItem(item, plan, emit, true);
      emit("item_completed", "info", `Done: ${item.albumName} → ${item.targetPath}`, {
        itemId: item.id,
      });
    } catch (cause) {
      emit("item_failed", "error", `Failed: ${item.albumName} — ${errorMessage(cause)}`, {
        itemId: item.id,
      });
      throw cause;
    }
  };

  const executeJob = (jobId: string, plan: MovePlan): void => {
    const controller = new AbortController();
    activeControllers.set(jobId, controller);

    runExecution(jobId, plan, controller.signal).finally(() => {
      activeControllers.delete(jobId);
    });
  };

  async function moveItem(
    item: MovePlan["items"][number],
    plan: MovePlan,
    emit: JobEmitter,
    force = false,
  ): Promise<void> {
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
      await mergeIntoExistingTarget(item, emit, force);
    }

    emit("move_completed", "info", `Move complete: ${item.albumName}`, {
      itemId: item.id,
      targetPath: item.targetPath,
    });
    await splitCueForMovedItem(item, plan, emit);
  }

  async function cleanTorrentsStep(stagingDir: string, emit: JobEmitter): Promise<void> {
    try {
      const { removed } = await cleanCompletedTorrents(stagingDir);
      emit(
        "torrents_cleaned",
        "info",
        `Removed ${removed} completed torrent${removed !== 1 ? "s" : ""} from Transmission`,
      );
    } catch (cause) {
      emit("torrents_clean_failed", "warning", `Torrent cleanup skipped: ${errorMessage(cause)}`);
    }
  }

  async function plexScanStep(emit: JobEmitter): Promise<void> {
    try {
      const sectionTitle = await triggerPlexMusicScan();
      emit("plex_scan_triggered", "info", `Plex library scan triggered: ${sectionTitle}`);
    } catch (cause) {
      emit("plex_scan_failed", "warning", `Plex scan skipped: ${errorMessage(cause)}`);
    }
  }

  async function runPostExecution(
    included: MovePlan["items"],
    counts: JobCounts,
    plan: MovePlan,
    emit: JobEmitter,
  ): Promise<void> {
    if (counts.completed > 0) {
      await cleanTorrentsStep(plan.config.stagingDir, emit);
    }
    const hasMusicItems = included.some((item) => item.mediaType === "music");
    if (hasMusicItems && counts.completed > 0) {
      await plexScanStep(emit);
    }
  }

  async function processCuePair(
    pair: CuePair,
    bashFunctionsPath: string,
    emit: JobEmitter,
  ): Promise<CuePairOutcome> {
    emit("item_started", "info", `Splitting: ${pair.cueFile}`, pair);
    try {
      await splitCuePair({
        pair,
        bashFunctionsPath,
        onLine: (line) => emit("item_log", "info", line, { pairId: pair.id }),
      });
      emit("item_completed", "info", `Split complete: ${pair.cueFile}`, pair);
      return "completed";
    } catch (cause) {
      emit("item_failed", "error", `Failed: ${pair.cueFile} — ${errorMessage(cause)}`, pair);
      return "failed";
    }
  }

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
    const emit = makeEmitter(jobId);
    const setJobStatus = makeJobStatusUpdater(jobId);
    const included = plan.items.filter((item) => item.included);
    const counts: JobCounts = { total: included.length, completed: 0, failed: 0, skipped: 0 };

    await runMoveJob({
      items: included,
      signal,
      move: (item) => moveItem(item, plan, emit),
      emit,
      setJobStatus,
      counts,
      afterComplete: () => runPostExecution(included, counts, plan, emit),
    });
  }

  async function runCueExecution(
    jobId: string,
    pairs: CuePair[],
    signal: AbortSignal,
  ): Promise<void> {
    const emit = makeEmitter(jobId);
    const setJobStatus = makeJobStatusUpdater(jobId);
    const counts: JobCounts = { total: pairs.length, completed: 0, failed: 0, skipped: 0 };

    const bashFunctionsPath = await getBashFunctionsPath();
    if (!bashFunctionsPath) {
      setJobStatus("failed", counts, { completedAt: new Date().toISOString() });
      emit(
        "job_failed",
        "error",
        "Could not find bash/functions.sh. Set NAS_TOOLS_BASH_FUNCTIONS_PATH.",
      );
      return;
    }

    await runCueJob({
      pairs,
      signal,
      bashFunctionsPath,
      processPair: processCuePair,
      emit,
      setJobStatus,
      counts,
    });
  }

  const executeCueJob = (jobId: string, pairs: CuePair[]): void => {
    const controller = new AbortController();
    activeControllers.set(jobId, controller);

    runCueExecution(jobId, pairs, controller.signal).finally(() => {
      activeControllers.delete(jobId);
    });
  };

  return {
    executeJob,
    executeCueJob,
    getJobEvents: repos.jobEvents.listAfter,
    cancelJob,
    resolveConflictItem,
  };
};
