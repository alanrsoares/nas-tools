import { publicSubrouter } from "../lib/subrouter.js";
import { prowlarrSearch } from "../prowlarr.js";
import type { Deps } from "../types/deps.js";

export function searchModule(deps: Deps) {
  return publicSubrouter(deps).get("/search", async ({ query, set }) => {
    const q = query.q as string | undefined;
    if (!q?.trim()) {
      set.status = 422;
      return {
        ok: false,
        issues: [{ path: ["q"], code: "REQUIRED", message: "Query is required" }],
      };
    }
    try {
      const results = await prowlarrSearch(q.trim());
      return { ok: true, results };
    } catch (cause) {
      set.status = 502;
      const message = cause instanceof Error ? cause.message : String(cause);
      return {
        ok: false,
        issues: [{ path: [], code: "PROWLARR_ERROR", message }],
      };
    }
  });
}
