import { nasPathConfigSchema } from "@nas-tools/core";
import { Elysia } from "elysia";
import { getNasConfig, setNasConfig } from "../lib/config-state.js";

export const configRoutes = new Elysia()
  .get("/config", () => ({ ok: true, config: getNasConfig() }))
  .put("/config", async ({ body, set }) => {
    const parsed = nasPathConfigSchema.safeParse(body);
    if (!parsed.success) {
      set.status = 422;
      return {
        ok: false,
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.map(String),
          code: issue.code,
          message: issue.message,
        })),
      };
    }
    setNasConfig(parsed.data);
    return { ok: true, config: getNasConfig() };
  });
