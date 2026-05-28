import { fieldIssueSchema } from "@nas-tools/core";
import { isErr, trySync } from "@onrails/result";
import { z } from "zod";
import type { Maybe } from "./maybe.js";
import { fromNullable, none } from "./maybe.js";

export type { FieldIssue } from "@nas-tools/core";
export { fieldIssueSchema };

export const jobCountsSchema = z.object({
  total: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
});

export type JobCounts = z.infer<typeof jobCountsSchema>;

export const jobStatusSchema = z.enum([
  "queued",
  "running",
  "completed",
  "completed_with_failures",
  "failed",
  "canceled",
  "interrupted",
]);

export type JobStatus = z.infer<typeof jobStatusSchema>;

export const jobEventLevelSchema = z.enum(["info", "warning", "error"]);

export type JobEventLevel = z.infer<typeof jobEventLevelSchema>;

export const jobStatusExtraSchema = z.object({
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
});

export type JobStatusExtra = z.infer<typeof jobStatusExtraSchema>;

export const cuePairOutcomeSchema = z.enum(["completed", "failed"]);

export type CuePairOutcome = z.infer<typeof cuePairOutcomeSchema>;

export const jobEventDataSchema = z.object({
  itemId: z.string().optional(),
});

export type JobEventData = z.infer<typeof jobEventDataSchema>;

export const jobEventSeqSchema = z.object({
  seq: z.number().int(),
});

export type JobEventSeq = z.infer<typeof jobEventSeqSchema>;

export const jobStreamRecordSchema = z.object({
  status: jobStatusSchema,
});

export type JobStreamRecord = z.infer<typeof jobStreamRecordSchema>;

export const conflictResolutionSchema = z.enum(["skip", "overwrite"]);

export type ConflictResolution = z.infer<typeof conflictResolutionSchema>;

export const resolveConflictBodySchema = z.object({
  itemId: z.string(),
  resolution: conflictResolutionSchema,
});

export type ResolveConflictBody = z.infer<typeof resolveConflictBodySchema>;

export const resolveConflictOkSchema = z.object({
  ok: z.literal(true),
});

export const resolveConflictErrorSchema = z.object({
  ok: z.literal(false),
  status: z.number().int(),
  issues: z.array(fieldIssueSchema),
});

export const resolveConflictResultSchema = z.discriminatedUnion("ok", [
  resolveConflictOkSchema,
  resolveConflictErrorSchema,
]);

export type ResolveConflictResult = z.infer<typeof resolveConflictResultSchema>;

export const createJobInputSchema = z.object({
  id: z.string(),
  type: z.string(),
  status: jobStatusSchema,
  planId: z.string().nullable(),
  counts: jobCountsSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type CreateJobInput = z.infer<typeof createJobInputSchema>;

export const appendJobEventInputSchema = z.object({
  jobId: z.string(),
  seq: z.number().int(),
  type: z.string(),
  level: jobEventLevelSchema,
  message: z.string(),
  data: z.unknown().optional(),
});

export type AppendJobEventInput = z.infer<typeof appendJobEventInputSchema>;

export function parseEventItemId(data: string | null | undefined): Maybe<string> {
  const parsed = trySync(
    () => jobEventDataSchema.parse(JSON.parse(data ?? "{}")),
    () => undefined,
  )();
  if (isErr(parsed)) {
    return none<string>();
  }

  return fromNullable(parsed.value.itemId);
}

export const TERMINAL_JOB_STATUSES = new Set<JobStatus>([
  "completed",
  "completed_with_failures",
  "failed",
  "canceled",
  "interrupted",
]);

export function isTerminalStatus(status: JobStatus): boolean {
  return TERMINAL_JOB_STATUSES.has(status);
}
