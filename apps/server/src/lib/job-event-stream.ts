import type { JobEventSeq, JobStreamRecord } from "./job-types.js";
import type { Maybe } from "./maybe.js";
import { isNone } from "./maybe.js";
import { isTerminalStatus } from "./schemas.js";

export type JobEventStreamDeps = {
  getEvents: (jobId: string, after: number) => JobEventSeq[];
  loadJob: (jobId: string) => Maybe<JobStreamRecord>;
};

const encodeSse = (encoder: TextEncoder, event: JobEventSeq): Uint8Array =>
  encoder.encode(`data: ${JSON.stringify(event)}\n\n`);

const flushEvents = (
  events: JobEventSeq[],
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

const isJobDone = (job: Maybe<JobStreamRecord>): boolean =>
  isNone(job) || isTerminalStatus(job.value.status);

export const streamJobEvents = async (
  deps: JobEventStreamDeps,
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

export const createJobEventStream = (
  deps: JobEventStreamDeps,
  jobId: string,
): ReadableStream<Uint8Array> =>
  new ReadableStream({
    start(controller) {
      void streamJobEvents(deps, jobId, controller);
    },
  });
