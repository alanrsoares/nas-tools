import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";

import { env } from "../env.js";
import { bootstrapDb } from "./bootstrap.js";
import { resolveMigrationsFolder } from "./migrations-path.js";
import * as schema from "./schema.js";

export type DbInstance = ReturnType<typeof createDb>;
export type Db = DbInstance["db"];

export const createDb = (dbPath = env.NAS_TOOLS_DB_PATH) => {
  if (dbPath !== ":memory:") {
    mkdirSync(path.dirname(dbPath), { recursive: true });
  }

  const sqlite = new Database(dbPath, { create: true });
  sqlite.exec("PRAGMA journal_mode = WAL");

  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: resolveMigrationsFolder(import.meta.dirname) });

  sqlite.exec("PRAGMA foreign_keys = ON");
  bootstrapDb(sqlite);

  return {
    db,
    close: () => sqlite.close(),
  };
};
