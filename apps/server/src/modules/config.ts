import { nasPathConfigSchema } from "@nas-tools/core";

import { publicSubrouter } from "../lib/subrouter.js";
import type { Deps } from "../types/deps.js";

export function configModule(deps: Deps) {
  return publicSubrouter(deps)
    .get("/config", ({ config }) => ({ ok: true, config: config.get() }))
    .put("/config", async ({ config, body, set }) => {
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
      config.set(parsed.data);
      return { ok: true, config: config.get() };
    });
}
