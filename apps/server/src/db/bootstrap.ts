import type { Database } from "bun:sqlite";

/** Mark in-flight jobs as interrupted after a server restart. */
export const bootstrapDb = (sqlite: Database): void => {
  sqlite
    .prepare(
      `UPDATE jobs SET status = 'interrupted', updated_at = ? WHERE status IN ('running', 'queued', 'canceling')`,
    )
    .run(new Date().toISOString());
};
