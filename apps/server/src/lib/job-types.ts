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
