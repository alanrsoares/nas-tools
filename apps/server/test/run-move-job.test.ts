import { describe, expect, it } from "bun:test";
import type { MovePlan, MovePlanItem } from "@nas-tools/core";
import type { ItemOutcome, JobItemRunner } from "../src/lib/job-item-runner.js";
import type { JobCounts, JobStatusUpdater } from "../src/lib/job-types.js";
import { runMoveJob } from "../src/lib/run-move-job.js";

const makeItem = (id: string, albumName = `Album ${id}`): MovePlanItem => ({
  id,
  status: "pending",
  mediaType: "music",
  sourcePath: `/staging/${albumName}`,
  targetPath: `/library/A/${albumName}`,
  albumName,
  included: true,
  issues: [],
});

const makePlan = (items: MovePlanItem[]): MovePlan => ({
  id: "plan-1",
  status: "confirmed",
  cueSplitEnabled: false,
  config: {
    stagingDir: "/staging",
    musicDir: "/library",
    backupDir: "/backup",
  },
  items,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

const makeRunner = (outcome: ItemOutcome): JobItemRunner => ({
  run: async () => outcome,
  runForced: async () => outcome,
});

type CapturedEvent = { type: string; data?: unknown };

const runJob = async (
  items: MovePlanItem[],
  outcome: ItemOutcome,
  signal = new AbortController().signal,
) => {
  const events: CapturedEvent[] = [];
  const statuses: Array<{ status: string; counts: JobCounts }> = [];

  const emit = (type: string, _level: unknown, _msg: string, data?: unknown) => {
    events.push({ type, data });
  };

  const setJobStatus: JobStatusUpdater = (status, counts) => {
    statuses.push({ status, counts });
  };

  const counts: JobCounts = { total: items.length, completed: 0, failed: 0, skipped: 0 };

  await runMoveJob({
    items,
    plan: makePlan(items),
    signal,
    runner: makeRunner(outcome),
    emit,
    setJobStatus,
    counts,
    afterComplete: async () => {},
  });

  return { events, statuses, counts };
};

describe("runMoveJob", () => {
  it("increments completed and emits item_completed when runner succeeds", async () => {
    const items = [makeItem("1"), makeItem("2")];
    const { counts, events } = await runJob(items, { status: "completed" });

    expect(counts.completed).toBe(2);
    expect(counts.failed).toBe(0);
    expect(events.filter((e) => e.type === "item_completed")).toHaveLength(2);
  });

  it("increments failed and emits item_conflict with file list on conflict", async () => {
    const items = [makeItem("1")];
    const conflictingFiles = ["track01.flac", "track02.flac"];
    const { counts, events } = await runJob(items, { status: "conflict", conflictingFiles });

    expect(counts.failed).toBe(1);
    expect(counts.completed).toBe(0);

    const conflictEvent = events.find((e) => e.type === "item_conflict");
    expect(conflictEvent).toBeDefined();
    expect((conflictEvent?.data as { conflictingFiles: string[] }).conflictingFiles).toEqual(
      conflictingFiles,
    );
  });

  it("increments failed and emits item_failed on runner error", async () => {
    const items = [makeItem("1")];
    const { counts, events } = await runJob(items, {
      status: "failed",
      cause: new Error("disk full"),
    });

    expect(counts.failed).toBe(1);
    const failedEvent = events.find((e) => e.type === "item_failed");
    expect(failedEvent).toBeDefined();
  });

  it("stops processing and emits job_canceled when signal is aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    const items = [makeItem("1"), makeItem("2"), makeItem("3")];
    const { counts, events } = await runJob(items, { status: "completed" }, controller.signal);

    expect(counts.completed).toBe(0);
    expect(events.some((e) => e.type === "job_canceled")).toBe(true);
  });
});
