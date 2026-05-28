import { z } from "zod";

export const jobCountsSchema = z.object({
  total: z.number(),
  completed: z.number(),
  failed: z.number(),
  skipped: z.number(),
});

export const jobEventDataSchema = z.object({ itemId: z.string().optional() });

export function parseEventItemId(data: string | null | undefined): string | undefined {
  try {
    return jobEventDataSchema.parse(JSON.parse(data ?? "{}")).itemId;
  } catch {
    return undefined;
  }
}

export const jobStatusSchema = z.enum([
  "queued",
  "running",
  "completed",
  "completed_with_failures",
  "failed",
  "canceled",
  "interrupted",
]);
