import type { MovePlan } from "@nas-tools/core";
import { cancelJobIfAborted, errorMessage, finalizeJob } from "./job-lifecycle.js";
import type { JobCounts } from "./job-types.js";

type JobEventLevel = "info" | "warning" | "error";
type JobEmitter = (type: string, level: JobEventLevel, message: string, data?: unknown) => void;
type StatusUpdater = (
  status: import("./job-types.js").JobStatus,
  counts: JobCounts,
  extra?: Partial<{ startedAt: string; completedAt: string }>,
) => void;

const runSingleMoveItem = async (
  item: MovePlan["items"][number],
  move: (item: MovePlan["items"][number]) => Promise<void>,
  emit: JobEmitter,
  counts: JobCounts,
  setJobStatus: StatusUpdater,
): Promise<void> => {
  emit("item_started", "info", `Moving: ${item.albumName}`, { itemId: item.id });
  try {
    await move(item);
    counts.completed++;
    emit("item_completed", "info", `Done: ${item.albumName} → ${item.targetPath}`, {
      itemId: item.id,
    });
  } catch (cause) {
    counts.failed++;
    emit("item_failed", "error", `Failed: ${item.albumName} — ${errorMessage(cause)}`, {
      itemId: item.id,
    });
  }
  setJobStatus("running", counts);
};

export const runMoveJob = async (options: {
  items: MovePlan["items"];
  signal: AbortSignal;
  move: (item: MovePlan["items"][number]) => Promise<void>;
  emit: JobEmitter;
  setJobStatus: StatusUpdater;
  counts: JobCounts;
  afterComplete: () => Promise<void>;
}): Promise<void> => {
  const { items, signal, move, emit, setJobStatus, counts, afterComplete } = options;

  setJobStatus("running", counts, { startedAt: new Date().toISOString() });
  emit("job_started", "info", `Starting move of ${counts.total} item(s)`);

  for (const item of items) {
    if (cancelJobIfAborted(signal, counts, setJobStatus, emit)) return;
    await runSingleMoveItem(item, move, emit, counts, setJobStatus);
  }

  finalizeJob(
    counts,
    setJobStatus,
    emit,
    `Done: ${counts.completed} moved, ${counts.failed} failed`,
  );
  await afterComplete();
};
