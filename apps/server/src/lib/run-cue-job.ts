import type { CuePair } from "../cue.js";
import { cancelJobIfAborted, finalizeJob } from "./job-lifecycle.js";
import type { CuePairOutcome, JobCounts, JobEmitter, JobStatusUpdater } from "./job-types.js";

export type RunCueJobOptions = {
  pairs: CuePair[];
  signal: AbortSignal;
  bashFunctionsPath: string;
  processPair: (
    pair: CuePair,
    bashFunctionsPath: string,
    emit: JobEmitter,
  ) => Promise<CuePairOutcome>;
  emit: JobEmitter;
  setJobStatus: JobStatusUpdater;
  counts: JobCounts;
};

export const runCueJob = async (options: RunCueJobOptions): Promise<void> => {
  const { pairs, signal, bashFunctionsPath, processPair, emit, setJobStatus, counts } = options;

  setJobStatus("running", counts, { startedAt: new Date().toISOString() });
  emit("job_started", "info", `Starting CUE fix for ${counts.total} pair(s)`);

  for (const pair of pairs) {
    if (cancelJobIfAborted(signal, counts, setJobStatus, emit)) return;

    if (pair.blocked) {
      counts.skipped++;
      emit("item_skipped", "warning", `Skipped blocked CUE: ${pair.cueFile}`, pair);
      setJobStatus("running", counts);
      continue;
    }

    const outcome = await processPair(pair, bashFunctionsPath, emit);
    counts[outcome]++;
    setJobStatus("running", counts);
  }

  finalizeJob(
    counts,
    setJobStatus,
    emit,
    `Done: ${counts.completed} split, ${counts.failed} failed, ${counts.skipped} skipped`,
  );
};
