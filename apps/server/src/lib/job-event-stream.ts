import { isTerminalStatus, type JobStatus } from "./job-types.js";

type JobEvent = { seq: number };
type JobRecord = { status: JobStatus };

type StreamDeps = {
  getEvents: (jobId: string, after: number) => JobEvent[];
  loadJob: (jobId: string) => JobRecord | null;
};

const encodeSse = (encoder: TextEncoder, event: JobEvent): Uint8Array =>
  encoder.encode(`data: ${JSON.stringify(event)}\n\n`);

const flushEvents = (
  events: JobEvent[],
  lastSeq: number,
  encoder: TextEncoder,
  controller: ReadableStreamDefaultController<Uint8Array>,
): number => {
  for (const event of events) {
    lastSeq = event.seq;
    controller.enqueue(encodeSse(encoder, event));
  }
  return lastSeq;
};

const isJobDone = (job: JobRecord | null): boolean => !job || isTerminalStatus(job.status);

export const streamJobEvents = async (
  deps: StreamDeps,
  jobId: string,
  controller: ReadableStreamDefaultController<Uint8Array>,
): Promise<void> => {
  const encoder = new TextEncoder();
  let lastSeq = -1;

  try {
    while (true) {
      lastSeq = flushEvents(deps.getEvents(jobId, lastSeq), lastSeq, encoder, controller);
      if (isJobDone(deps.loadJob(jobId))) {
        controller.close();
        return;
      }
      await Bun.sleep(400);
    }
  } catch {
    // client disconnected
  }
};

export const createJobEventStream = (deps: StreamDeps, jobId: string): ReadableStream<Uint8Array> =>
  new ReadableStream({
    start(controller) {
      void streamJobEvents(deps, jobId, controller);
    },
  });
