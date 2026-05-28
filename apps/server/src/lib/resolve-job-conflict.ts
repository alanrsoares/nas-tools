import type { ExecutionService } from "../execution.js";
import type { ApiRepos } from "../types/deps.js";

type ApiIssue = { path: string[]; code: string; message: string };

type ResolveConflictResult = { ok: true } | { ok: false; status: number; issues: ApiIssue[] };

const fail = (status: number, code: string, message: string): ResolveConflictResult => ({
  ok: false,
  status,
  issues: [{ path: [], code, message }],
});

export async function resolveJobConflict(
  repos: ApiRepos,
  execution: ExecutionService,
  jobId: string,
  itemId: string,
  resolution: "skip" | "overwrite",
): Promise<ResolveConflictResult> {
  const job = repos.jobs.load(jobId);
  if (!job) return fail(404, "NOT_FOUND", "Job not found");
  if (!job.planId) return fail(400, "NO_PLAN", "Job has no plan");

  const plan = repos.plans.load(job.planId);
  if (!plan) return fail(404, "NOT_FOUND", "Plan not found");

  const item = plan.items.find((i) => i.id === itemId);
  if (!item) return fail(404, "NOT_FOUND", "Item not found");

  try {
    await execution.resolveConflictItem(job.id, item, plan, resolution);
    return { ok: true };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return fail(500, "RESOLVE_FAILED", message);
  }
}
