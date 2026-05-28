import { defineConfig } from "drizzle-kit";

const dbPath = process.env.NAS_TOOLS_DB_PATH ?? "./cockpit.sqlite";
const url = dbPath.startsWith("file:") ? dbPath : `file:${dbPath}`;

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url,
  },
});
