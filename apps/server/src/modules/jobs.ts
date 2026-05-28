import { buildConflictsList } from "../lib/conflicts.js";
import { createJobEventStream } from "../lib/job-event-stream.js";
import { isTerminalStatus } from "../lib/job-types.js";
import { resolveJobConflict } from "../lib/resolve-job-conflict.js";
import { publicSubrouter } from "../lib/subrouter.js";
import type { Deps } from "../types/deps.js";

export function jobsModule(deps: Deps) {
  return publicSubrouter(deps)
    .get("/jobs", ({ repos }) => ({ ok: true, jobs: repos.jobs.list() }))
    .get("/jobs/:id", ({ repos, params, set }) => {
      const job = repos.jobs.load(params.id);
      if (!job) {
        set.status = 404;
        return {
          ok: false,
          issues: [{ path: [], code: "NOT_FOUND", message: "Job not found" }],
        };
      }
      return { ok: true, job };
    })
    .get("/jobs/:id/events", ({ repos, execution, params, query }) => {
      const after = Number(query.after ?? -1);
      const events = execution.getJobEvents(params.id, after);
      const job = repos.jobs.load(params.id);
      return {
        ok: true,
        events,
        done: job ? isTerminalStatus(job.status) : true,
      };
    })
    .get("/jobs/:id/events/stream", ({ repos, execution, params }) => {
      const jobId = params.id;
      const stream = createJobEventStream(
        {
          getEvents: (id, after) => execution.getJobEvents(id, after),
          loadJob: (id) => repos.jobs.load(id) ?? null,
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
      if (!job) {
        set.status = 404;
        return {
          ok: false,
          issues: [{ path: [], code: "NOT_FOUND", message: "Job not found" }],
        };
      }
      if (isTerminalStatus(job.status)) {
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
      if (!job) {
        set.status = 404;
        return { ok: false, issues: [{ path: [], code: "NOT_FOUND", message: "Job not found" }] };
      }
      const conflicts = await buildConflictsList(deps, params.id, job.planId);
      return { ok: true, conflicts };
    })
    .post("/jobs/:id/resolve-conflict", async ({ repos, execution, params, body, set }) => {
      const { itemId, resolution } = body as { itemId: string; resolution: "skip" | "overwrite" };
      const result = await resolveJobConflict(repos, execution, params.id, itemId, resolution);
      if (!result.ok) {
        set.status = result.status;
        return { ok: false, issues: result.issues };
      }
      return { ok: true };
    });
}
