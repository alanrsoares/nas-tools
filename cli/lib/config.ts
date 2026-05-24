import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { config as loadDotenv } from "dotenv";

export function loadNasToolsEnv(): void {
  const candidatePaths = [
    join(process.cwd(), ".env"),
    resolve(import.meta.dirname, "../../.env"),
    resolve(import.meta.dirname, "../../../.env"),
    process.env["HOME"] ? join(process.env["HOME"], "dev/nas-tools/.env") : "",
  ].filter((path) => path !== "");

  for (const path of [...new Set(candidatePaths)]) {
    if (existsSync(path)) {
      loadDotenv({ path, override: false, quiet: true });
    }
  }
}
