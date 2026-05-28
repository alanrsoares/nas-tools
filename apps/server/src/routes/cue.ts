import { Elysia, t } from "elysia";
import { type CuePair, findCuePairs } from "../cue.js";
import { db, jobs } from "../db.js";
import { executeCueJob } from "../execution.js";
import { getNasConfig } from "../lib/config-state.js";
import { eventStream } from "../realtime.js";

export const cueRoutes = new Elysia()
  .get("/cue/scan", ({ query }) => {
    const config = getNasConfig();
    const root = typeof query.root === "string" ? query.root : config.musicDir;
    const maxDepth = Number(query.maxDepth ?? 6);

    return eventStream(async (send) => {
      send({ type: "status", message: `Scanning ${root} for unsplit CUE pairs...` });
      const pairs = await findCuePairs(root, maxDepth, (progress) => {
        send({ type: "progress", ...progress });
      });
      send({
        type: "result",
        root,
        pairs,
        ready: pairs.filter((pair) => !pair.blocked).length,
        blocked: pairs.filter((pair) => pair.blocked).length,
      });
    });
  })
  .post(
    "/cue/fix/jobs",
    ({ body }) => {
      const now = new Date().toISOString();
      const pairs = body.pairs.filter((pair: CuePair) => !pair.blocked);
      const jobId = crypto.randomUUID();

      db.insert(jobs)
        .values({
          id: jobId,
          type: "cue_fix",
          status: "queued",
          planId: null,
          counts: JSON.stringify({
            total: pairs.length,
            completed: 0,
            failed: 0,
            skipped: 0,
          }),
          createdAt: now,
          updatedAt: now,
        })
        .run();

      executeCueJob(jobId, pairs);

      return { ok: true, jobId };
    },
    {
      body: t.Object({
        pairs: t.Array(
          t.Object({
            id: t.String(),
            directory: t.String(),
            cueFile: t.String(),
            audioFile: t.String(),
            blocked: t.Boolean(),
            risks: t.Array(t.String()),
          }),
        ),
      }),
    },
  );
