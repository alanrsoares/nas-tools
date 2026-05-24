import { readdir } from "node:fs/promises";
import { join } from "node:path";
import {
  createMovePlanDraft,
  defaultNasPathConfig,
  type FieldIssue,
  getMusicTargetDirectory,
  type MovePlan,
  type MovePlanError,
  type NasPathConfig,
  nasPathConfigSchema,
} from "@nas-tools/core";
import { eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { z } from "zod";

import { db, jobs, movePlanItems, movePlans } from "./db.js";
import { env } from "./env.js";
import { cancelJob, executeJob, getJobEvents, isTerminalStatus } from "./execution.js";
import { listPlexSections, scanAllPlexLibraries, scanPlexSection } from "./plex.js";
import { prowlarrSearch } from "./prowlarr.js";
import {
  addTorrent,
  cleanCompletedTorrents,
  getTorrentDashboard,
  torrentAction,
} from "./transmission.js";

const jobCountsSchema = z.object({
  total: z.number(),
  completed: z.number(),
  failed: z.number(),
  skipped: z.number(),
});

const jobStatusSchema = z.enum([
  "queued",
  "running",
  "completed",
  "completed_with_failures",
  "failed",
  "canceled",
  "interrupted",
]);

const host = env.HOST;
const port = env.PORT;

let config: NasPathConfig = defaultNasPathConfig;

const toIssues = (error: MovePlanError): FieldIssue[] => {
  if (error.type === "VALIDATION_ERROR") return error.issues;
  return [
    {
      path: [],
      code: error.type,
      message: "message" in error ? error.message : error.type,
    },
  ];
};

function persistPlan(plan: MovePlan): void {
  const now = new Date().toISOString();
  db.insert(movePlans)
    .values({
      id: plan.id,
      status: plan.status,
      config: JSON.stringify(plan.config),
      cueSplitEnabled: plan.cueSplitEnabled,
      createdAt: plan.createdAt,
      updatedAt: now,
    })
    .run();

  for (const item of plan.items) {
    db.insert(movePlanItems)
      .values({
        id: item.id,
        planId: plan.id,
        status: item.status,
        mediaType: item.mediaType,
        sourcePath: item.sourcePath,
        targetPath: item.targetPath,
        artistName: item.artistName ?? null,
        albumName: item.albumName,
        isNewArtist: item.isNewArtist ?? null,
        included: item.included,
        issues: JSON.stringify(item.issues),
      })
      .run();
  }
}

function loadPlan(planId: string): MovePlan | undefined {
  const row = db.select().from(movePlans).where(eq(movePlans.id, planId)).get();
  if (!row) return undefined;

  const items = db.select().from(movePlanItems).where(eq(movePlanItems.planId, planId)).all();

  return {
    id: row.id,
    status: row.status as MovePlan["status"],
    // biome-ignore lint: config is written by this app and matches NasPathConfig; add Zod schema when NasPathConfig stabilises
    config: JSON.parse(row.config) as NasPathConfig,
    cueSplitEnabled: row.cueSplitEnabled,
    items: items.map((item) => ({
      id: item.id,
      status: item.status as MovePlan["items"][number]["status"],
      mediaType: item.mediaType as MovePlan["items"][number]["mediaType"],
      sourcePath: item.sourcePath,
      targetPath: item.targetPath,
      artistName: item.artistName ?? undefined,
      albumName: item.albumName,
      isNewArtist: item.isNewArtist ?? undefined,
      included: item.included,
      // biome-ignore lint: issues written by this app; validate when FieldIssue gets a Zod schema
      issues: JSON.parse(item.issues) as MovePlan["items"][number]["issues"],
    })),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function loadJob(jobId: string) {
  const row = db.select().from(jobs).where(eq(jobs.id, jobId)).get();
  if (!row) return undefined;
  return {
    ...row,
    status: jobStatusSchema.parse(row.status),
    counts: jobCountsSchema.parse(JSON.parse(row.counts)),
  };
}

async function getStagingStatus(stagingDir: string) {
  const entries = await readdir(stagingDir, { withFileTypes: true }).catch(() => []);
  const items = entries.filter((e) => (e.isDirectory() || e.isFile()) && !e.name.startsWith("."));
  const cueChecks = await Promise.all(
    items.map(async (entry) => {
      if (entry.isDirectory()) {
        const sub = await readdir(join(stagingDir, entry.name)).catch(() => [] as string[]);
        return sub.some((f) => f.toLowerCase().endsWith(".cue"));
      }
      return entry.name.toLowerCase().endsWith(".cue");
    }),
  );
  const preview = items
    .slice(0, 5)
    .map((e, i) => ({ name: e.name, hasCue: cueChecks[i] ?? false }));
  return { total: items.length, withCue: cueChecks.filter(Boolean).length, preview };
}

export const app = new Elysia({ prefix: "/api" })
  // ── Health ──────────────────────────────────────────────────
  .get("/health", () => ({ ok: true }))

  // ── Dashboard ────────────────────────────────────────────────
  .get("/dashboard", async () => {
    const [transmissionResult, stagingResult] = await Promise.allSettled([
      getTorrentDashboard(config.stagingDir),
      getStagingStatus(config.stagingDir),
    ]);
    return {
      ok: true,
      transmission: transmissionResult.status === "fulfilled" ? transmissionResult.value : null,
      staging: stagingResult.status === "fulfilled" ? stagingResult.value : null,
    };
  })

  // ── Config ──────────────────────────────────────────────────
  .get("/config", () => ({ ok: true, config }))
  .put("/config", async ({ body, set }) => {
    const parsed = nasPathConfigSchema.safeParse(body);
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
    config = parsed.data;
    return { ok: true, config };
  })

  // ── Move-completed / scan ────────────────────────────────────
  .post("/move-completed/scan", async ({ set }) => {
    const result = await createMovePlanDraft(config);
    return result.match(
      (plan) => {
        persistPlan(plan);
        return { ok: true, plan };
      },
      (error) => {
        set.status = 422;
        return { ok: false, issues: toIssues(error) };
      },
    );
  })

  // ── Move-completed / plans ───────────────────────────────────
  .get("/move-completed/plans/:id", ({ params, set }) => {
    const plan = loadPlan(params.id);
    if (!plan) {
      set.status = 404;
      return {
        ok: false,
        issues: [{ path: [], code: "NOT_FOUND", message: "Plan not found" }],
      };
    }
    return { ok: true, plan };
  })

  .post(
    "/move-completed/plans/:id/confirm",
    ({ params, body, set }) => {
      const plan = loadPlan(params.id);
      if (!plan) {
        set.status = 404;
        return {
          ok: false,
          issues: [{ path: [], code: "NOT_FOUND", message: "Plan not found" }],
        };
      }
      if (plan.status !== "draft") {
        set.status = 409;
        return {
          ok: false,
          issues: [
            {
              path: [],
              code: "PLAN_NOT_DRAFT",
              message: "Plan is not a draft",
            },
          ],
        };
      }

      // Merge user edits (artist corrections, include toggles)
      const editMap = new Map(body.items.map((edit) => [edit.id, edit]));

      const issues: FieldIssue[] = [];
      const mergedItems = plan.items.map((item) => {
        const edit = editMap.get(item.id);
        const artistName = edit?.artistName ?? item.artistName;
        const included = edit?.included ?? item.included;

        if (included && item.mediaType === "music" && !artistName) {
          issues.push({
            path: ["items", item.id, "artistName"],
            code: "ARTIST_REQUIRED",
            message: `Artist name required for "${item.albumName}"`,
          });
        }

        const targetPath =
          item.mediaType === "music" && artistName && artistName !== item.artistName
            ? `${getMusicTargetDirectory(artistName, plan.config.musicDir)}/${item.albumName}`
            : item.targetPath;

        return { ...item, artistName, included, targetPath };
      });

      if (issues.length > 0) {
        set.status = 422;
        return { ok: false, issues };
      }

      const now = new Date().toISOString();
      const confirmedPlan: MovePlan = {
        ...plan,
        status: "confirmed",
        items: mergedItems,
        updatedAt: now,
      };

      // Mark plan confirmed and update items
      db.update(movePlans)
        .set({ status: "confirmed", updatedAt: now })
        .where(eq(movePlans.id, plan.id))
        .run();

      for (const item of mergedItems) {
        db.update(movePlanItems)
          .set({
            artistName: item.artistName ?? null,
            targetPath: item.targetPath,
            included: item.included,
            status: item.included ? "included" : "excluded",
          })
          .where(eq(movePlanItems.id, item.id))
          .run();
      }

      // Create job
      const jobId = crypto.randomUUID();
      db.insert(jobs)
        .values({
          id: jobId,
          type: "move_completed",
          status: "queued",
          planId: plan.id,
          counts: JSON.stringify({
            total: 0,
            completed: 0,
            failed: 0,
            skipped: 0,
          }),
          createdAt: now,
          updatedAt: now,
        })
        .run();

      // Start execution (non-blocking)
      executeJob(jobId, confirmedPlan);

      return { ok: true, jobId };
    },
    {
      body: t.Object({
        items: t.Array(
          t.Object({
            id: t.String(),
            artistName: t.Optional(t.String()),
            included: t.Boolean(),
          }),
        ),
      }),
    },
  )

  // ── Jobs ─────────────────────────────────────────────────────
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

  // ── Transmission ─────────────────────────────────────────────
  .post("/transmission/clean", async ({ set }) => {
    try {
      const result = await cleanCompletedTorrents(config.stagingDir);
      return { ok: true, ...result };
    } catch (cause) {
      set.status = 502;
      const message = cause instanceof Error ? cause.message : String(cause);
      return {
        ok: false,
        issues: [{ path: [], code: "TRANSMISSION_ERROR", message }],
      };
    }
  })

  .post(
    "/transmission/add",
    async ({ body, set }) => {
      try {
        const result = await addTorrent(body.url);
        return { ok: true, ...result };
      } catch (cause) {
        set.status = 502;
        const message = cause instanceof Error ? cause.message : String(cause);
        return {
          ok: false,
          issues: [{ path: [], code: "TRANSMISSION_ERROR", message }],
        };
      }
    },
    { body: t.Object({ url: t.String() }) },
  )

  .post("/transmission/torrents/:id/:action", async ({ params, set }) => {
    const id = Number(params.id);
    const action = params.action as string;
    if (!["pause", "resume", "remove"].includes(action)) {
      set.status = 400;
      return {
        ok: false,
        issues: [
          { path: ["action"], code: "INVALID", message: "action must be pause, resume, or remove" },
        ],
      };
    }
    try {
      await torrentAction(id, action as "pause" | "resume" | "remove");
      return { ok: true };
    } catch (cause) {
      set.status = 502;
      const message = cause instanceof Error ? cause.message : String(cause);
      return { ok: false, issues: [{ path: [], code: "TRANSMISSION_ERROR", message }] };
    }
  })

  // ── Plex ──────────────────────────────────────────────────────
  .get("/plex/sections", async ({ set }) => {
    try {
      const sections = await listPlexSections();
      return { ok: true, sections };
    } catch (cause) {
      set.status = 502;
      const message = cause instanceof Error ? cause.message : String(cause);
      return { ok: false, issues: [{ path: [], code: "PLEX_ERROR", message }] };
    }
  })

  .post("/plex/scan", async ({ set }) => {
    try {
      const result = await scanAllPlexLibraries();
      return { ok: true, ...result };
    } catch (cause) {
      set.status = 502;
      const message = cause instanceof Error ? cause.message : String(cause);
      return { ok: false, issues: [{ path: [], code: "PLEX_ERROR", message }] };
    }
  })

  .post("/plex/sections/:key/scan", async ({ params, set }) => {
    try {
      const result = await scanPlexSection(params.key);
      return { ok: true, ...result };
    } catch (cause) {
      set.status = 502;
      const message = cause instanceof Error ? cause.message : String(cause);
      return { ok: false, issues: [{ path: [], code: "PLEX_ERROR", message }] };
    }
  })

  // ── Search ────────────────────────────────────────────────────
  .get("/search", async ({ query, set }) => {
    const q = query.q as string | undefined;
    if (!q?.trim()) {
      set.status = 422;
      return {
        ok: false,
        issues: [{ path: ["q"], code: "REQUIRED", message: "Query is required" }],
      };
    }
    try {
      const results = await prowlarrSearch(q.trim());
      return { ok: true, results };
    } catch (cause) {
      set.status = 502;
      const message = cause instanceof Error ? cause.message : String(cause);
      return {
        ok: false,
        issues: [{ path: [], code: "PROWLARR_ERROR", message }],
      };
    }
  });

export type App = typeof app;

if (import.meta.main) {
  app.listen({ hostname: host, port });
  console.log(`NAS Tools server listening on http://${host}:${port}`);
}
