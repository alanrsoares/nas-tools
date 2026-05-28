import { publicSubrouter } from "../lib/subrouter.js";
import { listPlexSections, scanAllPlexLibraries, scanPlexSection } from "../plex.js";
import type { Deps } from "../types/deps.js";

export function plexModule(deps: Deps) {
  return publicSubrouter(deps)
    .get("/plex/sections", async ({ set }) => {
      try {
        const sections = await listPlexSections();
        return { ok: true, sections };
      } catch (cause) {
        set.status = 502;
        const message = cause instanceof Error ? cause.message : String(cause);
        return { ok: false, issues: [{ path: [], code: "PLEX_ERROR", message }] };
      }
    })
    .post("/plex/scan", async ({ set }) => {
      try {
        const result = await scanAllPlexLibraries();
        return { ok: true, ...result };
      } catch (cause) {
        set.status = 502;
        const message = cause instanceof Error ? cause.message : String(cause);
        return { ok: false, issues: [{ path: [], code: "PLEX_ERROR", message }] };
      }
    })
    .post("/plex/sections/:key/scan", async ({ params, set }) => {
      try {
        const result = await scanPlexSection(params.key);
        return { ok: true, ...result };
      } catch (cause) {
        set.status = 502;
        const message = cause instanceof Error ? cause.message : String(cause);
        return { ok: false, issues: [{ path: [], code: "PLEX_ERROR", message }] };
      }
    });
}
