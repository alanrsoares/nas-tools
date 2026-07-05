import { publicSubrouter } from "../lib/subrouter.js";
import { getCategories, prowlarrSearch } from "../prowlarr.js";
import { eventStream } from "../realtime.js";
import type { Deps } from "../types/deps.js";

/** Top-level Torznab groups relevant to this app's downloads UI. */
const RELEVANT_CATEGORY_IDS = new Set([2000, 3000, 5000, 7000]);

export function searchModule(deps: Deps) {
  return publicSubrouter(deps)
    .get("/search/categories", async ({ set }) => {
      try {
        const categories = await getCategories();
        return {
          ok: true,
          categories: categories.filter((c) => RELEVANT_CATEGORY_IDS.has(c.id)),
        };
      } catch (cause) {
        set.status = 502;
        const message = cause instanceof Error ? cause.message : String(cause);
        return { ok: false, issues: [{ path: [], code: "PROWLARR_ERROR", message }] };
      }
    })
    .get("/search", ({ query, set, request }) => {
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

      return eventStream(async (send, signal) => {
        send({ type: "status", message: `Searching Prowlarr indexers for "${q.trim()}"...` });
        try {
          const results = await prowlarrSearch(q.trim(), categories, signal);
          send({ type: "result", results });
        } catch (cause) {
          const message = cause instanceof Error ? cause.message : String(cause);
          send({ type: "error", message });
        }
      }, request.signal);
    });
}
