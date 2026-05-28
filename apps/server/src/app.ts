import { join } from "node:path";
import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";
import { api } from "./api.js";

const webDistDir = join(import.meta.dirname, "../../web/dist");

export const app = new Elysia()
  .use(cors())
  .use(api)
  .get("*", async ({ path }) => {
    const filePath = join(webDistDir, path);
    const file = Bun.file(filePath);

    if ((await file.exists()) && file.size > 0 && !filePath.endsWith("/")) {
      return file;
    }

    return Bun.file(join(webDistDir, "index.html"));
  });
