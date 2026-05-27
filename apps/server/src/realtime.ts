export type StreamSend = (data: unknown) => void;

export function eventStream(run: (send: StreamSend) => Promise<void> | void): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send: StreamSend = (data) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        await run(send);
      } catch (cause) {
        send({
          type: "error",
          message: cause instanceof Error ? cause.message : String(cause),
        });
      } finally {
        controller.close();
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
}
