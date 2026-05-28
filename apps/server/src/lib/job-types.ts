import type { JobCounts, JobEventLevel, JobStatus, JobStatusExtra } from "./schemas.js";

export type {
  AppendJobEventInput,
  ConflictResolution,
  CuePairOutcome,
  FieldIssue,
  JobCounts,
  JobEventData,
  JobEventLevel,
  JobEventSeq,
  JobStatus,
  JobStatusExtra,
  JobStreamRecord,
  ResolveConflictBody,
  ResolveConflictResult,
} from "./schemas.js";

export type JobEmitter = (
  type: string,
  level: JobEventLevel,
  message: string,
  data?: unknown,
) => void;

export type JobStatusUpdater = (
  status: JobStatus,
  counts: JobCounts,
  extra?: JobStatusExtra,
) => void;

export { isTerminalStatus } from "./schemas.js";
