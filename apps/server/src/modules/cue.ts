import { t } from "elysia";

import { type CuePair, findCuePairs } from "../cue.js";
import { publicSubrouter } from "../lib/subrouter.js";
import { eventStream } from "../realtime.js";
import type { Deps } from "../types/deps.js";

export function cueModule(deps: Deps) {
  return publicSubrouter(deps)
    .get("/cue/scan", ({ config, query }) => {
      const nasConfig = config.get();
      const root = typeof query.root === "string" ? query.root : nasConfig.musicDir;
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
      ({ repos, execution, body }) => {
        const now = new Date().toISOString();
        const pairs = body.pairs.filter((pair: CuePair) => !pair.blocked);
        const jobId = crypto.randomUUID();

        repos.jobs.create({
          id: jobId,
          type: "cue_fix",
          status: "queued",
          planId: null,
          counts: {
            total: pairs.length,
            completed: 0,
            failed: 0,
            skipped: 0,
          },
          createdAt: now,
          updatedAt: now,
        });

        execution.executeCueJob(jobId, pairs);

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
}
