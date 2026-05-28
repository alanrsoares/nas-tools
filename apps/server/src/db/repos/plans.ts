import type { MovePlan, NasPathConfig } from "@nas-tools/core";
import { eq } from "drizzle-orm";
import type { Db } from "../client.js";
import { movePlanItems, movePlans } from "../schema.js";

export type PlansRepo = {
  persist: (plan: MovePlan) => void;
  load: (planId: string) => MovePlan | undefined;
  confirm: (plan: MovePlan, mergedItems: MovePlan["items"]) => void;
};

export const createPlansRepo = (db: Db): PlansRepo => ({
  persist(plan) {
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
  },

  load(planId) {
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
  },

  confirm(plan, mergedItems) {
    const now = new Date().toISOString();
    db.update(movePlans)
      .set({
        status: "confirmed",
        cueSplitEnabled: plan.cueSplitEnabled,
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
  },
});
