import { buildConflictsList } from "../lib/conflicts.js";
import { createJobEventStream } from "../lib/job-event-stream.js";
import { isTerminalStatus } from "../lib/job-types.js";
import { isNone, map, matchMaybe } from "../lib/maybe.js";
import { resolveJobConflict } from "../lib/resolve-job-conflict.js";
import { resolveConflictBodySchema } from "../lib/schemas.js";
import { publicSubrouter } from "../lib/subrouter.js";
import type { Deps } from "../types/deps.js";

export function jobsModule(deps: Deps) {
  return publicSubrouter(deps)
    .get("/jobs", ({ repos }) => ({ ok: true, jobs: repos.jobs.list() }))
    .get("/jobs/:id", ({ repos, params, set }) => {
      const job = repos.jobs.load(params.id);
      if (isNone(job)) {
        set.status = 404;
        return {
          ok: false,
          issues: [{ path: [], code: "NOT_FOUND", message: "Job not found" }],
        };
      }
      return { ok: true, job: job.value };
    })
    .get("/jobs/:id/events", ({ repos, execution, params, query }) => {
      const after = Number(query.after ?? -1);
      const events = execution.getJobEvents(params.id, after);
      const job = repos.jobs.load(params.id);
      return {
        ok: true,
        events,
        done: matchMaybe(
          job,
          (loaded) => isTerminalStatus(loaded.status),
          () => true,
        ),
      };
    })
    .get("/jobs/:id/events/stream", ({ repos, execution, params }) => {
      const jobId = params.id;
      const stream = createJobEventStream(
        {
          getEvents: (id, after) => execution.getJobEvents(id, after),
          loadJob: (id) => map(repos.jobs.load(id), (job) => ({ status: job.status })),
        },
        jobId,
      );
      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    })
    .post("/jobs/:id/cancel", ({ repos, execution, params, set }) => {
      const job = repos.jobs.load(params.id);
      if (isNone(job)) {
        set.status = 404;
        return {
          ok: false,
          issues: [{ path: [], code: "NOT_FOUND", message: "Job not found" }],
        };
      }
      if (isTerminalStatus(job.value.status)) {
        set.status = 409;
        return {
          ok: false,
          issues: [
            {
              path: [],
              code: "ALREADY_TERMINAL",
              message: "Job already finished",
            },
          ],
        };
      }
      execution.cancelJob(params.id);
      return { ok: true };
    })
    .get("/jobs/:id/conflicts", async ({ repos, params, set }) => {
      const job = repos.jobs.load(params.id);
      if (isNone(job)) {
        set.status = 404;
        return { ok: false, issues: [{ path: [], code: "NOT_FOUND", message: "Job not found" }] };
      }
      const conflicts = await buildConflictsList(deps, params.id, job.value.planId);
      return { ok: true, conflicts };
    })
    .post("/jobs/:id/resolve-conflict", async ({ repos, execution, params, body, set }) => {
      const parsed = resolveConflictBodySchema.safeParse(body);
      if (!parsed.success) {
        set.status = 422;
        return {
          ok: false,
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.map(String),
            code: issue.code,
            message: issue.message,
          })),
        };
      }
      const result = await resolveJobConflict(
        repos,
        execution,
        params.id,
        parsed.data.itemId,
        parsed.data.resolution,
      );
      if (!result.ok) {
        set.status = result.status;
        return { ok: false, issues: result.issues };
      }
      return { ok: true };
    });
}
