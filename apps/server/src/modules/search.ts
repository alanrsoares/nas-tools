import { t } from "elysia";
import { publicSubrouter } from "../lib/subrouter.js";
import { getCategories, type ProwlarrCategory, prowlarrSearch } from "../prowlarr.js";
import { eventStream } from "../realtime.js";
import type { Deps } from "../types/deps.js";

/** Top-level Torznab groups shown by default until the user customizes Settings. */
const DEFAULT_ACTIVE_GROUP_IDS = new Set([2000, 3000, 5000, 7000]);

function flattenIds(categories: ProwlarrCategory[]): number[] {
  return categories.flatMap((group) => [group.id, ...group.subCategories.map((sub) => sub.id)]);
}

function defaultActiveIds(categories: ProwlarrCategory[]): number[] {
  return flattenIds(categories.filter((group) => DEFAULT_ACTIVE_GROUP_IDS.has(group.id)));
}

export function searchModule(deps: Deps) {
  return publicSubrouter(deps)
    .get("/search/categories", async ({ set, repos }) => {
      try {
        const categories = await getCategories();
        return {
          ok: true,
          categories,
          activeIds:
            repos.downloadCategorySettings.getActiveCategoryIds() ?? defaultActiveIds(categories),
        };
      } catch (cause) {
        set.status = 502;
        const message = cause instanceof Error ? cause.message : String(cause);
        return { ok: false, issues: [{ path: [], code: "PROWLARR_ERROR", message }] };
      }
    })
    .put(
      "/search/categories/active",
      ({ body, repos }) => {
        repos.downloadCategorySettings.setActiveCategoryIds(body.activeIds);
        return { ok: true, activeIds: body.activeIds };
      },
      { body: t.Object({ activeIds: t.Array(t.Number()) }) },
    )
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
