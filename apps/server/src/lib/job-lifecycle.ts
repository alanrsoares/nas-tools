import type { JobCounts, JobEmitter, JobStatusUpdater } from "./job-types.js";

export const finalizeJob = (
  counts: JobCounts,
  setJobStatus: JobStatusUpdater,
  emit: JobEmitter,
  summary: string,
): void => {
  const finalStatus = counts.failed === 0 ? "completed" : "completed_with_failures";
  setJobStatus(finalStatus, counts, { completedAt: new Date().toISOString() });
  emit("job_completed", counts.failed === 0 ? "info" : "warning", summary, counts);
};

export const cancelJobIfAborted = (
  signal: AbortSignal,
  counts: JobCounts,
  setJobStatus: JobStatusUpdater,
  emit: JobEmitter,
): boolean => {
  if (!signal.aborted) return false;
  setJobStatus("canceled", counts, { completedAt: new Date().toISOString() });
  emit("job_canceled", "info", "Job canceled by user");
  return true;
};

export const errorMessage = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);
