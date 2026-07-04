import { join, resolve, sep } from "node:path";
import { Elysia } from "elysia";

import { createApi } from "./api.js";
import { securityGuard } from "./security.js";
import type { Deps } from "./types/deps.js";

const webDistDir = resolve(import.meta.dirname, "../../web/dist");

const indexHtml = () => Bun.file(join(webDistDir, "index.html"));

export const createApp = (deps: Deps) =>
  new Elysia()
    .use(securityGuard)
    .use(createApi(deps))
    .get("*", async ({ path }) => {
      let decoded: string;
      try {
        decoded = decodeURIComponent(path);
      } catch {
        return indexHtml();
      }

      const filePath = resolve(join(webDistDir, decoded));
      if (!filePath.startsWith(webDistDir + sep)) {
        return indexHtml();
      }

      const file = Bun.file(filePath);
      if ((await file.exists()) && file.size > 0) {
        return file;
      }

      return indexHtml();
    });

export type App = ReturnType<typeof createApp>;
