import { Elysia, t } from "elysia";
import { getNasConfig } from "../lib/config-state.js";
import { addTorrent, cleanCompletedTorrents, torrentAction } from "../transmission.js";

export const transmissionRoutes = new Elysia()
  .post("/transmission/clean", async ({ set }) => {
    try {
      const result = await cleanCompletedTorrents(getNasConfig().stagingDir);
      return { ok: true, ...result };
    } catch (cause) {
      set.status = 502;
      const message = cause instanceof Error ? cause.message : String(cause);
      return {
        ok: false,
        issues: [{ path: [], code: "TRANSMISSION_ERROR", message }],
      };
    }
  })
  .post(
    "/transmission/add",
    async ({ body, set }) => {
      try {
        const result = await addTorrent(body.url);
        return { ok: true, ...result };
      } catch (cause) {
        set.status = 502;
        const message = cause instanceof Error ? cause.message : String(cause);
        return {
          ok: false,
          issues: [{ path: [], code: "TRANSMISSION_ERROR", message }],
        };
      }
    },
    { body: t.Object({ url: t.String() }) },
  )
  .post("/transmission/torrents/:id/:action", async ({ params, set }) => {
    const id = Number(params.id);
    const action = params.action as string;
    if (!["pause", "resume", "remove"].includes(action)) {
      set.status = 400;
      return {
        ok: false,
        issues: [
          { path: ["action"], code: "INVALID", message: "action must be pause, resume, or remove" },
        ],
      };
    }
    try {
      await torrentAction(id, action as "pause" | "resume" | "remove");
      return { ok: true };
    } catch (cause) {
      set.status = 502;
      const message = cause instanceof Error ? cause.message : String(cause);
      return { ok: false, issues: [{ path: [], code: "TRANSMISSION_ERROR", message }] };
    }
  });
