import { t } from "elysia";

import { publicSubrouter } from "../lib/subrouter.js";
import {
  addTorrent,
  cleanCompletedTorrents,
  getPreviewInfo,
  torrentAction,
} from "../transmission.js";
import type { Deps } from "../types/deps.js";

function contentTypeFor(path: string): string {
  return path.toLowerCase().endsWith(".webm") ? "video/webm" : "video/mp4";
}

function parseRange(header: string | null, safeBytes: number): { start: number; end: number } {
  if (!header?.startsWith("bytes=")) return { start: 0, end: safeBytes - 1 };
  const [startStr, endStr] = header.slice("bytes=".length).split("-");
  const start = startStr ? Number(startStr) : 0;
  const end = endStr ? Number(endStr) : safeBytes - 1;
  if (Number.isNaN(start) || Number.isNaN(end)) return { start: 0, end: safeBytes - 1 };
  return { start, end };
}

export function transmissionModule(deps: Deps) {
  return publicSubrouter(deps)
    .post("/transmission/clean", async ({ config, set }) => {
      try {
        const result = await cleanCompletedTorrents(config.get().stagingDir);
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
            {
              path: ["action"],
              code: "INVALID",
              message: "action must be pause, resume, or remove",
            },
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
    })
    .get("/transmission/torrents/:id/preview", async ({ params, request, set, config }) => {
      const id = Number(params.id);
      if (Number.isNaN(id)) {
        set.status = 400;
        return {
          ok: false,
          issues: [{ path: ["id"], code: "INVALID", message: "id must be a number" }],
        };
      }

      const info = await getPreviewInfo(id, config.get().stagingDir).catch(() => null);
      if (!info || info.safeBytes <= 0) {
        set.status = 404;
        return {
          ok: false,
          issues: [{ path: [], code: "NOT_FOUND", message: "No previewable video data yet" }],
        };
      }

      const hasRangeHeader = request.headers.has("range");
      const { start: rawStart, end: rawEnd } = parseRange(
        request.headers.get("range"),
        info.safeBytes,
      );
      const start = Math.max(0, rawStart);
      const end = Math.min(rawEnd, info.safeBytes - 1);

      if (start >= info.safeBytes) {
        return new Response(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${info.safeBytes}` },
        });
      }

      const body = Bun.file(info.path).slice(start, end + 1);
      return new Response(body, {
        status: hasRangeHeader ? 206 : 200,
        headers: {
          "Content-Type": contentTypeFor(info.path),
          "Accept-Ranges": "bytes",
          "Content-Length": String(end - start + 1),
          ...(hasRangeHeader ? { "Content-Range": `bytes ${start}-${end}/${info.safeBytes}` } : {}),
        },
      });
    })
    .get("/transmission/torrents/:id/preview/status", async ({ params, set, config }) => {
      const id = Number(params.id);
      if (Number.isNaN(id)) {
        set.status = 400;
        return {
          ok: false,
          issues: [{ path: ["id"], code: "INVALID", message: "id must be a number" }],
        };
      }

      const info = await getPreviewInfo(id, config.get().stagingDir).catch(() => null);
      if (!info) {
        set.status = 404;
        return {
          ok: false,
          issues: [
            { path: [], code: "NOT_FOUND", message: "No previewable video file in torrent" },
          ],
        };
      }

      return { ok: true, safeBytes: info.safeBytes, fileLength: info.fileLength };
    });
}
