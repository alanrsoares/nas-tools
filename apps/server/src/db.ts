import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { env } from "./env.js";

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
  planId: text("plan_id").notNull(),
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
  planId: text("plan_id"),
  counts: text("counts").notNull().default("{}"),
  startedAt: text("started_at"),
  completedAt: text("completed_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const jobEvents = sqliteTable("job_events", {
  id: text("id").primaryKey(),
  jobId: text("job_id").notNull(),
  seq: integer("seq").notNull(),
  type: text("type").notNull(),
  level: text("level").notNull(),
  message: text("message").notNull(),
  data: text("data"),
  createdAt: text("created_at").notNull(),
});

const dbPath = env.NAS_TOOLS_DB_PATH;
mkdirSync(path.dirname(dbPath), { recursive: true });

const sqlite = new Database(dbPath, { create: true });
sqlite.exec("PRAGMA journal_mode = WAL");
sqlite.exec("PRAGMA foreign_keys = ON");

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS move_plans (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    config TEXT NOT NULL,
    cue_split_enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS move_plan_items (
    id TEXT PRIMARY KEY,
    plan_id TEXT NOT NULL REFERENCES move_plans(id),
    status TEXT NOT NULL,
    media_type TEXT NOT NULL,
    source_path TEXT NOT NULL,
    target_path TEXT NOT NULL,
    artist_name TEXT,
    album_name TEXT NOT NULL,
    is_new_artist INTEGER,
    included INTEGER NOT NULL DEFAULT 1,
    issues TEXT NOT NULL DEFAULT '[]'
  );
  CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    status TEXT NOT NULL,
    plan_id TEXT REFERENCES move_plans(id),
    counts TEXT NOT NULL DEFAULT '{}',
    started_at TEXT,
    completed_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS job_events (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL REFERENCES jobs(id),
    seq INTEGER NOT NULL,
    type TEXT NOT NULL,
    level TEXT NOT NULL,
    message TEXT NOT NULL,
    data TEXT,
    created_at TEXT NOT NULL
  );
`);


export const db = drizzle(sqlite, {
  schema: { movePlans, movePlanItems, jobs, jobEvents },
});

// Mark any jobs left running/queued from a previous server process as interrupted
sqlite
  .prepare(
    `UPDATE jobs SET status = 'interrupted', updated_at = ? WHERE status IN ('running', 'queued', 'canceling')`,
  )
  .run(new Date().toISOString());
