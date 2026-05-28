import { and, eq, gt } from "drizzle-orm";
import type { Db } from "../client.js";
import { jobEvents } from "../schema.js";

export type JobEventLevel = "info" | "warning" | "error";

export type AppendJobEventInput = {
  jobId: string;
  seq: number;
  type: string;
  level: JobEventLevel;
  message: string;
  data?: unknown;
};

export type JobEventsRepo = {
  append: (input: AppendJobEventInput) => void;
  listAfter: (jobId: string, afterSeq?: number) => (typeof jobEvents.$inferSelect)[];
};

export const createJobEventsRepo = (db: Db): JobEventsRepo => ({
  append({ jobId, seq, type, level, message, data }) {
    db.insert(jobEvents)
      .values({
        id: crypto.randomUUID(),
        jobId,
        seq,
        type,
        level,
        message,
        data: data != null ? JSON.stringify(data) : null,
        createdAt: new Date().toISOString(),
      })
      .run();
  },

  listAfter(jobId, afterSeq = -1) {
    return db
      .select()
      .from(jobEvents)
      .where(and(eq(jobEvents.jobId, jobId), gt(jobEvents.seq, afterSeq)))
      .orderBy(jobEvents.seq)
      .all();
  },
});
