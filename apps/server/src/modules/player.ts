import { isErr } from "@onrails/result";
import { t } from "elysia";
import { publicSubrouter } from "../lib/subrouter.js";
import type { BrowseResult } from "../player/index.js";
import type { Deps } from "../types/deps.js";

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
};

const encodeSse = (encoder: TextEncoder, data: unknown): Uint8Array =>
  encoder.encode(`data: ${JSON.stringify(data)}\n\n`);

export function playerModule(deps: Deps) {
  const { player } = deps;

  return publicSubrouter(deps)
    .get("/player/status", () => {
      const encoder = new TextEncoder();
      let unsub: (() => void) | null = null;
      let timer: ReturnType<typeof setInterval> | null = null;

      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          const send = (data: unknown) => {
            try {
              controller.enqueue(encodeSse(encoder, data));
            } catch {
              /* client disconnected */
            }
          };
          send(player.getState());
          unsub = player.subscribe(send);
          timer = setInterval(() => send(player.getState()), 2000);
        },
        cancel() {
          if (timer) clearInterval(timer);
          unsub?.();
        },
      });

      return new Response(stream, { headers: SSE_HEADERS });
    })

    .get(
      "/player/list",
      async ({ query, set }) => {
        const result = await player.listTracks(query.path);
        if (isErr(result)) {
          set.status = 400;
          return { ok: false as const, message: result.error.message };
        }
        return { ok: true as const, files: result.value };
      },
      { query: t.Object({ path: t.String() }) },
    )

    .get(
      "/player/browse",
      async ({ query, set }) => {
        const result = await player.browse(query.path || undefined);
        if (isErr(result)) {
          set.status = 400;
          return { ok: false as const, message: result.error.message };
        }
        return { ok: true as const, ...(result.value as BrowseResult) };
      },
      { query: t.Object({ path: t.Optional(t.String()) }) },
    )

    .get("/player/devices", async ({ set }) => {
      const result = await player.listDevices();
      if (isErr(result)) {
        set.status = 500;
        return { ok: false as const, message: result.error.message };
      }
      return { ok: true as const, devices: result.value };
    })

    .post(
      "/player/play",
      async ({ body, set }) => {
        const result = await player.play(body.path, body.device ?? undefined);
        if (isErr(result)) {
          set.status = 500;
          return { ok: false as const, message: result.error.message };
        }
        return { ok: true as const };
      },
      { body: t.Object({ path: t.String(), device: t.Optional(t.String()) }) },
    )

    .post("/player/pause", async ({ set }) => {
      const result = await player.pause();
      if (isErr(result)) {
        set.status = 409;
        return { ok: false as const, message: result.error.message };
      }
      return { ok: true as const };
    })

    .post("/player/resume", async ({ set }) => {
      const result = await player.resume();
      if (isErr(result)) {
        set.status = 409;
        return { ok: false as const, message: result.error.message };
      }
      return { ok: true as const };
    })

    .post("/player/stop", async ({ set }) => {
      const result = await player.stop();
      if (isErr(result)) {
        set.status = 500;
        return { ok: false as const, message: result.error.message };
      }
      return { ok: true as const };
    });
}
