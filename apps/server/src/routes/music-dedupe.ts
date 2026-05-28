import { mkdir, rename } from "node:fs/promises";
import { join } from "node:path";
import { Elysia, t } from "elysia";
import { getNasConfig } from "../lib/config-state.js";
import { streamDedupeGroups } from "../lib/dedupe.js";

export const musicDedupeRoutes = new Elysia()
  .get("/music-dedupe/scan", () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: unknown) =>
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        try {
          await streamDedupeGroups(getNasConfig().musicDir, send);
          controller.close();
        } catch (e) {
          console.error("Dedupe scan stream error:", e);
          controller.error(e);
        }
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  })
  .post(
    "/music-dedupe/apply",
    async ({ body }) => {
      const results = [];

      for (const task of body.moves) {
        try {
          await mkdir(join(task.to, ".."), { recursive: true });
          await rename(task.from, task.to);
          results.push({ from: task.from, ok: true });
        } catch (e) {
          results.push({ from: task.from, ok: false, error: String(e) });
        }
      }

      return { ok: true, results };
    },
    {
      body: t.Object({
        moves: t.Array(
          t.Object({
            from: t.String(),
            to: t.String(),
            reason: t.String(),
          }),
        ),
      }),
    },
  );
