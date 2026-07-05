export type StreamSend = (data: unknown) => void;

/**
 * SSE response wrapper. `run` receives a `signal` that fires when the client
 * disconnects or aborts — long work (upstream fetches) should honor it.
 * `send` becomes a no-op once the stream is closed, so late writes from an
 * already-running task never throw.
 */
export function eventStream(
  run: (send: StreamSend, signal: AbortSignal) => Promise<void> | void,
  clientSignal?: AbortSignal,
): Response {
  const encoder = new TextEncoder();
  const aborter = new AbortController();

  if (clientSignal) {
    if (clientSignal.aborted) aborter.abort();
    else clientSignal.addEventListener("abort", () => aborter.abort(), { once: true });
  }

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      // Comment frames reset Bun's connection idleTimeout during long work
      // (slow Prowlarr searches); SSE parsers ignore non-"data:" lines.
      const keepAlive = setInterval(() => {
        if (closed || aborter.signal.aborted) return;
        try {
          controller.enqueue(encoder.encode(": keep-alive\n\n"));
        } catch {
          closed = true;
        }
      }, 10_000);
      const close = () => {
        clearInterval(keepAlive);
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          // consumer already cancelled the stream
        }
      };

      const send: StreamSend = (data) => {
        if (closed || aborter.signal.aborted) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };

      aborter.signal.addEventListener("abort", close, { once: true });

      try {
        await run(send, aborter.signal);
      } catch (cause) {
        send({
          type: "error",
          message: cause instanceof Error ? cause.message : String(cause),
        });
      } finally {
        close();
      }
    },
    cancel() {
      aborter.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
