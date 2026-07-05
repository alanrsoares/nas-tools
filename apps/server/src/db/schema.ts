import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const movePlans = sqliteTable("move_plans", {
  id: text("id").primaryKey(),
  status: text("status").notNull(),
  config: text("config").notNull(),
  cueSplitEnabled: integer("cue_split_enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const movePlanItems = sqliteTable("move_plan_items", {
  id: text("id").primaryKey(),
  planId: text("plan_id")
    .notNull()
    .references(() => movePlans.id),
  status: text("status").notNull(),
  mediaType: text("media_type").notNull(),
  sourcePath: text("source_path").notNull(),
  targetPath: text("target_path").notNull(),
  artistName: text("artist_name"),
  albumName: text("album_name").notNull(),
  isNewArtist: integer("is_new_artist", { mode: "boolean" }),
  included: integer("included", { mode: "boolean" }).notNull().default(true),
  issues: text("issues").notNull().default("[]"),
});

export const jobs = sqliteTable("jobs", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  status: text("status").notNull(),
  planId: text("plan_id").references(() => movePlans.id),
  counts: text("counts").notNull().default("{}"),
  startedAt: text("started_at"),
  completedAt: text("completed_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const downloadCategorySettings = sqliteTable("download_category_settings", {
  id: text("id").primaryKey(),
  activeCategoryIds: text("active_category_ids").notNull(),
});

export const jobEvents = sqliteTable("job_events", {
  id: text("id").primaryKey(),
  jobId: text("job_id")
    .notNull()
    .references(() => jobs.id),
  seq: integer("seq").notNull(),
  type: text("type").notNull(),
  level: text("level").notNull(),
  message: text("message").notNull(),
  data: text("data"),
  createdAt: text("created_at").notNull(),
});
