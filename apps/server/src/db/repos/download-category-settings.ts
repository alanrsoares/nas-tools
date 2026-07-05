import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../client.js";
import { downloadCategorySettings } from "../schema.js";

const SINGLETON_ID = "singleton";
const activeCategoryIdsSchema = z.array(z.number());

export type DownloadCategorySettingsRepo = {
  /** null means no override has been saved — treat every category as active. */
  getActiveCategoryIds: () => number[] | null;
  setActiveCategoryIds: (ids: number[]) => void;
};

export function createDownloadCategorySettingsRepo(db: Db): DownloadCategorySettingsRepo {
  return {
    getActiveCategoryIds() {
      const row = db
        .select()
        .from(downloadCategorySettings)
        .where(eq(downloadCategorySettings.id, SINGLETON_ID))
        .get();
      if (!row) return null;
      return activeCategoryIdsSchema.parse(JSON.parse(row.activeCategoryIds));
    },

    setActiveCategoryIds(ids) {
      db.insert(downloadCategorySettings)
        .values({ id: SINGLETON_ID, activeCategoryIds: JSON.stringify(ids) })
        .onConflictDoUpdate({
          target: downloadCategorySettings.id,
          set: { activeCategoryIds: JSON.stringify(ids) },
        })
        .run();
    },
  };
}
