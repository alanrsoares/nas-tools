import { Elysia } from "elysia";
import { db, jobs } from "../db.js";
import { cancelJob, getJobEvents, isTerminalStatus, resolveConflictItem } from "../execution.js";
import { buildConflictsList } from "../lib/conflicts.js";
import { loadJob } from "../lib/jobs.js";
import { loadPlan } from "../lib/plans.js";
import { jobCountsSchema } from "../lib/schemas.js";

export const jobRoutes = new Elysia()
  .get("/jobs", () => {
    const rows = db.select().from(jobs).orderBy(jobs.createdAt).all().reverse();
    return {
      ok: true,
      jobs: rows.map((row) => ({
        ...row,
        counts: jobCountsSchema.parse(JSON.parse(row.counts)),
      })),
    };
  })
  .get("/jobs/:id", ({ params, set }) => {
    const job = loadJob(params.id);
    if (!job) {
      set.status = 404;
      return {
        ok: false,
        issues: [{ path: [], code: "NOT_FOUND", message: "Job not found" }],
      };
    }
    return { ok: true, job };
  })
  .get("/jobs/:id/events", ({ params, query }) => {
    const after = Number(query.after ?? -1);
    const events = getJobEvents(params.id, after);
    const job = loadJob(params.id);
    return {
      ok: true,
      events,
      done: job ? isTerminalStatus(job.status) : true,
    };
  })
  .get("/jobs/:id/events/stream", ({ params }) => {
    const jobId = params.id;
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let lastSeq = -1;
        try {
          while (true) {
            const events = getJobEvents(jobId, lastSeq);
            for (const event of events) {
              lastSeq = event.seq;
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
            }
            const job = loadJob(jobId);
            if (!job || isTerminalStatus(job.status)) {
              controller.close();
              return;
            }
            await Bun.sleep(400);
          }
        } catch {
          // client disconnected
        }
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  })
  .post("/jobs/:id/cancel", ({ params, set }) => {
    const job = loadJob(params.id);
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
    cancelJob(params.id);
    return { ok: true };
  })
  .get("/jobs/:id/conflicts", async ({ params, set }) => {
    const job = loadJob(params.id);
    if (!job) {
      set.status = 404;
      return { ok: false, issues: [{ path: [], code: "NOT_FOUND", message: "Job not found" }] };
    }
    const conflicts = await buildConflictsList(params.id, job.planId);
    return { ok: true, conflicts };
  })
  .post("/jobs/:id/resolve-conflict", async ({ params, body, set }) => {
    const job = loadJob(params.id);
    if (!job) {
      set.status = 404;
      return { ok: false, issues: [{ path: [], code: "NOT_FOUND", message: "Job not found" }] };
    }
    if (!job.planId) {
      set.status = 400;
      return { ok: false, issues: [{ path: [], code: "NO_PLAN", message: "Job has no plan" }] };
    }
    const { itemId, resolution } = body as { itemId: string; resolution: "skip" | "overwrite" };
    const plan = loadPlan(job.planId);
    if (!plan) {
      set.status = 404;
      return { ok: false, issues: [{ path: [], code: "NOT_FOUND", message: "Plan not found" }] };
    }
    const item = plan.items.find((i) => i.id === itemId);
    if (!item) {
      set.status = 404;
      return { ok: false, issues: [{ path: [], code: "NOT_FOUND", message: "Item not found" }] };
    }
    try {
      await resolveConflictItem(job.id, item, plan, resolution);
      return { ok: true };
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      set.status = 500;
      return { ok: false, issues: [{ path: [], code: "RESOLVE_FAILED", message }] };
    }
  });
