import type { MovePlan } from "@nas-tools/core";
import { match } from "@onrails/pattern";

import { cancelJobIfAborted, errorMessage, finalizeJob } from "./job-lifecycle.js";
import type { JobItemRunner } from "./job-item-runner.js";
import type { JobCounts, JobEmitter, JobStatusUpdater } from "./job-types.js";

export type RunMoveJobOptions = {
  items: MovePlan["items"];
  plan: MovePlan;
  signal: AbortSignal;
  runner: JobItemRunner;
  emit: JobEmitter;
  setJobStatus: JobStatusUpdater;
  counts: JobCounts;
  afterComplete: () => Promise<void>;
};

const runSingleMoveItem = async (
  item: MovePlan["items"][number],
  plan: MovePlan,
  runner: JobItemRunner,
  emit: JobEmitter,
  counts: JobCounts,
  setJobStatus: JobStatusUpdater,
): Promise<void> => {
  emit("item_started", "info", `Moving: ${item.albumName}`, { itemId: item.id });
  const outcome = await runner.run(item, plan, emit);

  match(outcome)
    .with({ status: "completed" }, () => {
      counts.completed++;
      emit("item_completed", "info", `Done: ${item.albumName} → ${item.targetPath}`, {
        itemId: item.id,
      });
    })
    .with({ status: "conflict" }, ({ conflictingFiles }) => {
      counts.failed++;
      emit("item_conflict", "warning", `Conflict: ${item.albumName}`, {
        itemId: item.id,
        conflictingFiles,
      });
    })
    .with({ status: "failed" }, ({ cause }) => {
      counts.failed++;
      emit("item_failed", "error", `Failed: ${item.albumName} — ${errorMessage(cause)}`, {
        itemId: item.id,
      });
    })
    .exhaustive();

  setJobStatus("running", counts);
};

export const runMoveJob = async (options: RunMoveJobOptions): Promise<void> => {
  const { items, plan, signal, runner, emit, setJobStatus, counts, afterComplete } = options;

  setJobStatus("running", counts, { startedAt: new Date().toISOString() });
  emit("job_started", "info", `Starting move of ${counts.total} item(s)`);

  for (const item of items) {
    if (cancelJobIfAborted(signal, counts, setJobStatus, emit)) return;
    await runSingleMoveItem(item, plan, runner, emit, counts, setJobStatus);
  }

  finalizeJob(
    counts,
    setJobStatus,
    emit,
    `Done: ${counts.completed} moved, ${counts.failed} failed`,
  );
  await afterComplete();
};
