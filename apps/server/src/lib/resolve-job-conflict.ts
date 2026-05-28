import type { ExecutionService } from "../execution.js";
import type { ApiRepos } from "../types/deps.js";
import type { ConflictResolution, FieldIssue, ResolveConflictResult } from "./schemas.js";

const fail = (status: number, code: string, message: string): ResolveConflictResult => ({
  ok: false,
  status,
  issues: [{ path: [], code, message } satisfies FieldIssue],
});

export async function resolveJobConflict(
  repos: ApiRepos,
  execution: ExecutionService,
  jobId: string,
  itemId: string,
  resolution: ConflictResolution,
): Promise<ResolveConflictResult> {
  const job = repos.jobs.load(jobId);
  if (job.isNothing) return fail(404, "NOT_FOUND", "Job not found");
  if (!job.value.planId) return fail(400, "NO_PLAN", "Job has no plan");

  const plan = repos.plans.load(job.value.planId);
  if (plan.isNothing) return fail(404, "NOT_FOUND", "Plan not found");

  const item = plan.value.items.find((i) => i.id === itemId);
  if (!item) return fail(404, "NOT_FOUND", "Item not found");

  try {
    await execution.resolveConflictItem(job.value.id, item, plan.value, resolution);
    return { ok: true };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return fail(500, "RESOLVE_FAILED", message);
  }
}

export type {
  ConflictResolution,
  FieldIssue,
  ResolveConflictBody,
  ResolveConflictResult,
} from "./schemas.js";
