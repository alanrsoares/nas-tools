import { publicSubrouter } from "../lib/subrouter.js";
import { prowlarrSearch } from "../prowlarr.js";
import { eventStream } from "../realtime.js";
import type { Deps } from "../types/deps.js";

export function searchModule(deps: Deps) {
  return publicSubrouter(deps).get("/search", ({ query, set }) => {
    const q = query.q as string | undefined;
    if (!q?.trim()) {
      set.status = 422;
      return {
        ok: false,
        issues: [{ path: ["q"], code: "REQUIRED", message: "Query is required" }],
      };
    }
    const categoriesRaw = query.categories as string | undefined;
    const categories = categoriesRaw
      ? categoriesRaw.split(",").map(Number).filter(Number.isFinite)
      : undefined;

    return eventStream(async (send) => {
      send({ type: "status", message: `Searching Prowlarr indexers for "${q.trim()}"...` });
      try {
        const results = await prowlarrSearch(q.trim(), categories);
        send({ type: "result", results });
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        send({ type: "error", message });
      }
    });
  });
}
