import { eq } from "drizzle-orm";
import type { JobCounts, JobStatus } from "../../lib/job-types.js";
import { jobCountsSchema, jobStatusSchema } from "../../lib/schemas.js";
import type { Db } from "../client.js";
import { jobEvents, jobs } from "../schema.js";

export type JobRow = typeof jobs.$inferSelect;

export type ParsedJob = Omit<JobRow, "status" | "counts"> & {
  status: JobStatus;
  counts: JobCounts;
};

export type CreateJobInput = {
  id: string;
  type: string;
  status: JobStatus;
  planId: string | null;
  counts: JobCounts;
  createdAt: string;
  updatedAt: string;
};

export type JobsRepo = {
  list: () => ParsedJob[];
  load: (jobId: string) => ParsedJob | undefined;
  create: (input: CreateJobInput) => void;
  updateStatus: (
    jobId: string,
    status: JobStatus,
    counts: JobCounts,
    extra?: Partial<{ startedAt: string; completedAt: string }>,
  ) => void;
  markRunningInterrupted: (error: unknown) => void;
};

export const createJobsRepo = (db: Db): JobsRepo => ({
  list() {
    const rows = db.select().from(jobs).orderBy(jobs.createdAt).all().reverse();
    return rows.map((row) => ({
      ...row,
      status: jobStatusSchema.parse(row.status),
      counts: jobCountsSchema.parse(JSON.parse(row.counts)),
    }));
  },

  load(jobId) {
    const row = db.select().from(jobs).where(eq(jobs.id, jobId)).get();
    if (!row) return undefined;
    return {
      ...row,
      status: jobStatusSchema.parse(row.status),
      counts: jobCountsSchema.parse(JSON.parse(row.counts)),
    };
  },

  create(input) {
    db.insert(jobs)
      .values({
        id: input.id,
        type: input.type,
        status: input.status,
        planId: input.planId,
        counts: JSON.stringify(input.counts),
        createdAt: input.createdAt,
        updatedAt: input.updatedAt,
      })
      .run();
  },

  updateStatus(jobId, status, counts, extra = {}) {
    db.update(jobs)
      .set({
        status,
        counts: JSON.stringify(counts),
        updatedAt: new Date().toISOString(),
        ...extra,
      })
      .where(eq(jobs.id, jobId))
      .run();
  },

  markRunningInterrupted(error) {
    const message =
      error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error);
    const now = new Date().toISOString();

    const runningJobs = db
      .select({ id: jobs.id })
      .from(jobs)
      .where(eq(jobs.status, "running"))
      .all();

    for (const job of runningJobs) {
      const maxSeq =
        db
          .select({ seq: jobEvents.seq })
          .from(jobEvents)
          .where(eq(jobEvents.jobId, job.id))
          .orderBy(jobEvents.seq)
          .all()
          .at(-1)?.seq ?? -1;

      db.insert(jobEvents)
        .values({
          id: crypto.randomUUID(),
          jobId: job.id,
          seq: maxSeq + 1,
          type: "process_crashed",
          level: "error",
          message: `Server crashed: ${message.slice(0, 500)}`,
          data: null,
          createdAt: now,
        })
        .run();

      db.update(jobs)
        .set({ status: "interrupted", updatedAt: now })
        .where(eq(jobs.id, job.id))
        .run();
    }
  },
});
