import {
  createMovePlanDraft,
  type FieldIssue,
  getMusicTargetDirectory,
  type MovePlan,
} from "@nas-tools/core";
import { eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db, jobs, movePlanItems, movePlans } from "../db.js";
import { executeJob } from "../execution.js";
import { getNasConfig } from "../lib/config-state.js";
import { toIssues } from "../lib/errors.js";
import { loadPlan, persistPlan } from "../lib/plans.js";

export const moveCompletedRoutes = new Elysia()
  .post("/move-completed/scan", async ({ set }) => {
    const result = await createMovePlanDraft(getNasConfig());
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
        cueSplitEnabled: body.cueSplitEnabled ?? plan.cueSplitEnabled,
        items: mergedItems,
        updatedAt: now,
      };

      db.update(movePlans)
        .set({
          status: "confirmed",
          cueSplitEnabled: confirmedPlan.cueSplitEnabled,
          updatedAt: now,
        })
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
        cueSplitEnabled: t.Optional(t.Boolean()),
      }),
    },
  );
