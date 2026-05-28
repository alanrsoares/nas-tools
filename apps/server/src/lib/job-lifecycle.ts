import type { JobCounts, JobStatus } from "./job-types.js";

type JobEventLevel = "info" | "warning" | "error";
type JobEmitter = (type: string, level: JobEventLevel, message: string, data?: unknown) => void;

type StatusUpdater = (
  status: JobStatus,
  counts: JobCounts,
  extra?: Partial<{ startedAt: string; completedAt: string }>,
) => void;

export const finalizeJob = (
  counts: JobCounts,
  setJobStatus: StatusUpdater,
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
  setJobStatus: StatusUpdater,
  emit: JobEmitter,
): boolean => {
  if (!signal.aborted) return false;
  setJobStatus("canceled", counts, { completedAt: new Date().toISOString() });
  emit("job_canceled", "info", "Job canceled by user");
  return true;
};

export const errorMessage = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);
