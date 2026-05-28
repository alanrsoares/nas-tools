import { join } from "node:path";
import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";

import { createApi } from "./api.js";
import type { Deps } from "./types/deps.js";

const webDistDir = join(import.meta.dirname, "../../web/dist");

export const createApp = (deps: Deps) =>
  new Elysia()
    .use(cors())
    .use(createApi(deps))
    .get("*", async ({ path }) => {
      const filePath = join(webDistDir, path);
      const file = Bun.file(filePath);

      if ((await file.exists()) && file.size > 0 && !filePath.endsWith("/")) {
        return file;
      }

      return Bun.file(join(webDistDir, "index.html"));
    });

export type App = ReturnType<typeof createApp>;
