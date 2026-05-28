import { existsSync } from "node:fs";
import path from "node:path";

const serverMigrationsAt = (serverRoot: string): string => path.join(serverRoot, "drizzle");

/** Resolve `apps/server/drizzle` whether running from `src/` or compiled `dist/`. */
export const resolveMigrationsFolder = (fromDir: string): string => {
  let dir = fromDir;
  while (dir !== path.dirname(dir)) {
    if (existsSync(path.join(dir, "drizzle.config.ts"))) {
      return serverMigrationsAt(dir);
    }
    const nestedConfig = path.join(dir, "apps", "server", "drizzle.config.ts");
    if (existsSync(nestedConfig)) {
      return serverMigrationsAt(path.join(dir, "apps", "server"));
    }
    dir = path.dirname(dir);
  }
  throw new Error("Could not locate drizzle.config.ts for migrations folder");
};
