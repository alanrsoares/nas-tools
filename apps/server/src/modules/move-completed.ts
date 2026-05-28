import {
  createMovePlanDraft,
  type FieldIssue,
  getMusicTargetDirectory,
  type MovePlan,
} from "@nas-tools/core";
import { t } from "elysia";

import { toIssues } from "../lib/errors.js";
import { publicSubrouter } from "../lib/subrouter.js";
import type { Deps } from "../types/deps.js";

export function moveCompletedModule(deps: Deps) {
  return publicSubrouter(deps)
    .post("/move-completed/scan", async ({ config, repos, set }) => {
      const result = await createMovePlanDraft(config.get());
      return result.match(
        (plan) => {
          repos.plans.persist(plan);
          return { ok: true, plan };
        },
        (error) => {
          set.status = 422;
          return { ok: false, issues: toIssues(error) };
        },
      );
    })
    .get("/move-completed/plans/:id", ({ repos, params, set }) => {
      const plan = repos.plans.load(params.id);
      if (plan.isNothing) {
        set.status = 404;
        return {
          ok: false,
          issues: [{ path: [], code: "NOT_FOUND", message: "Plan not found" }],
        };
      }
      return { ok: true, plan: plan.value };
    })
    .post(
      "/move-completed/plans/:id/confirm",
      ({ repos, execution, params, body, set }) => {
        const plan = repos.plans.load(params.id);
        if (plan.isNothing) {
          set.status = 404;
          return {
            ok: false,
            issues: [{ path: [], code: "NOT_FOUND", message: "Plan not found" }],
          };
        }
        if (plan.value.status !== "draft") {
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

        const loadedPlan = plan.value;
        const editMap = new Map(body.items.map((edit) => [edit.id, edit]));

        const issues: FieldIssue[] = [];
        const mergedItems = loadedPlan.items.map((item) => {
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
              ? `${getMusicTargetDirectory(artistName, loadedPlan.config.musicDir)}/${item.albumName}`
              : item.targetPath;

          return { ...item, artistName, included, targetPath };
        });

        if (issues.length > 0) {
          set.status = 422;
          return { ok: false, issues };
        }

        const now = new Date().toISOString();
        const confirmedPlan: MovePlan = {
          ...loadedPlan,
          status: "confirmed",
          cueSplitEnabled: body.cueSplitEnabled ?? loadedPlan.cueSplitEnabled,
          items: mergedItems,
          updatedAt: now,
        };

        repos.plans.confirm(confirmedPlan, mergedItems);

        const jobId = crypto.randomUUID();
        repos.jobs.create({
          id: jobId,
          type: "move_completed",
          status: "queued",
          planId: loadedPlan.id,
          counts: { total: 0, completed: 0, failed: 0, skipped: 0 },
          createdAt: now,
          updatedAt: now,
        });

        execution.executeJob(jobId, confirmedPlan);

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
}
