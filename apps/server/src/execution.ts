import type { MovePlan } from "@nas-tools/core";

import { type CuePair, getBashFunctionsPath, splitCuePair } from "./cue.js";
import type { JobEventsRepo, JobsRepo } from "./db/index.js";
import type { JobItemRunner } from "./lib/job-item-runner.js";
import { errorMessage } from "./lib/job-lifecycle.js";
import type {
  ConflictResolution,
  CuePairOutcome,
  JobCounts,
  JobEmitter,
  JobStatusExtra,
  JobStatusUpdater,
} from "./lib/job-types.js";
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

export const createExecutionService = (
  repos: ExecutionRepos,
  runner: JobItemRunner,
): ExecutionService => {
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
    const outcome = await runner.runForced(item, plan, emit);
    if (outcome.status === "completed") {
      emit("item_completed", "info", `Done: ${item.albumName} → ${item.targetPath}`, {
        itemId: item.id,
      });
    } else {
      const cause =
        outcome.status === "failed"
          ? outcome.cause
          : new Error("Unexpected conflict after force merge");
      emit("item_failed", "error", `Failed: ${item.albumName} — ${errorMessage(cause)}`, {
        itemId: item.id,
      });
      throw cause instanceof Error ? cause : new Error(String(cause));
    }
  };

  const executeJob = (jobId: string, plan: MovePlan): void => {
    const controller = new AbortController();
    activeControllers.set(jobId, controller);

    runExecution(jobId, plan, controller.signal).finally(() => {
      activeControllers.delete(jobId);
    });
  };

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

  async function runExecution(jobId: string, plan: MovePlan, signal: AbortSignal): Promise<void> {
    const emit = makeEmitter(jobId);
    const setJobStatus = makeJobStatusUpdater(jobId);
    const included = plan.items.filter((item) => item.included);
    const counts: JobCounts = { total: included.length, completed: 0, failed: 0, skipped: 0 };

    await runMoveJob({
      items: included,
      plan,
      signal,
      runner,
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
