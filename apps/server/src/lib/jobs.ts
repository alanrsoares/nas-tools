import { eq } from "drizzle-orm";
import { db, jobEvents, jobs } from "../db.js";
import { jobCountsSchema, jobStatusSchema } from "./schemas.js";

export function loadJob(jobId: string) {
  const row = db.select().from(jobs).where(eq(jobs.id, jobId)).get();
  if (!row) return undefined;
  return {
    ...row,
    status: jobStatusSchema.parse(row.status),
    counts: jobCountsSchema.parse(JSON.parse(row.counts)),
  };
}

export function markRunningJobsCrashed(error: unknown) {
  const message = error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error);
  const now = new Date().toISOString();

  const runningJobs = db.select({ id: jobs.id }).from(jobs).where(eq(jobs.status, "running")).all();

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

    db.update(jobs).set({ status: "interrupted", updatedAt: now }).where(eq(jobs.id, job.id)).run();
  }
}
