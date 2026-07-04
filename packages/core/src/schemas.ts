import { z } from "zod";

export const mediaTypeSchema = z.union([
  z.literal("tv"),
  z.literal("audiobook"),
  z.literal("music"),
  z.literal("movie"),
  z.literal("unknown"),
]);

export type MediaType = z.infer<typeof mediaTypeSchema>;

export const movePlanItemStatusSchema = z.union([
  z.literal("included"),
  z.literal("excluded"),
  z.literal("needs_correction"),
  z.literal("invalid"),
]);

export type MovePlanItemStatus = z.infer<typeof movePlanItemStatusSchema>;

export const jobStatusSchema = z.union([
  z.literal("queued"),
  z.literal("running"),
  z.literal("canceling"),
  z.literal("canceled"),
  z.literal("completed"),
  z.literal("completed_with_failures"),
  z.literal("failed"),
  z.literal("interrupted"),
]);

export type JobStatus = z.infer<typeof jobStatusSchema>;

export const nasPathConfigSchema = z.object({
  stagingDir: z.string().min(1),
  musicDir: z.string().min(1),
  tvDir: z.string().min(1),
  movieDir: z.string().min(1),
  audiobookDir: z.string().min(1),
  backupDir: z.string().min(1),
});

export type NasPathConfig = z.infer<typeof nasPathConfigSchema>;

export const defaultNasPathConfig = {
  stagingDir: "/volmain/Download/Transmission/complete/",
  musicDir: "/volmain/Public/FLAC/",
  tvDir: "/volmain/Public/TV Series & Documentaries/",
  movieDir: "/volmain/Public/Movies/",
  audiobookDir: "/volmain/Public/Audiobooks/",
  backupDir: "/volmain/Download/Transmission/backup/",
} satisfies NasPathConfig;

export const fieldIssueSchema = z.object({
  path: z.array(z.string()),
  code: z.string(),
  message: z.string(),
});

export type FieldIssue = z.infer<typeof fieldIssueSchema>;

export const domainIssueSchema = z.object({
  code: z.string(),
  message: z.string(),
  itemId: z.string().optional(),
  severity: z.union([z.literal("info"), z.literal("warning"), z.literal("error")]),
});

export type DomainIssue = z.infer<typeof domainIssueSchema>;

export const stagedMediaItemSchema = z.object({
  id: z.string(),
  path: z.string(),
  name: z.string(),
  type: mediaTypeSchema,
  files: z.array(z.string()),
  musicFiles: z.array(z.string()),
});

export type StagedMediaItem = z.infer<typeof stagedMediaItemSchema>;

export const movePlanItemSchema = z.object({
  id: z.string(),
  status: movePlanItemStatusSchema,
  mediaType: mediaTypeSchema,
  sourcePath: z.string(),
  targetPath: z.string(),
  artistName: z.string().optional(),
  albumName: z.string(),
  isNewArtist: z.boolean().optional(),
  cueFiles: z.number().int().nonnegative().optional(),
  cueAudioPairs: z.number().int().nonnegative().optional(),
  included: z.boolean(),
  issues: z.array(domainIssueSchema),
});

export type MovePlanItem = z.infer<typeof movePlanItemSchema>;

export const movePlanSchema = z.object({
  id: z.string(),
  status: z.union([z.literal("draft"), z.literal("confirmed"), z.literal("superseded")]),
  config: nasPathConfigSchema,
  cueSplitEnabled: z.boolean(),
  items: z.array(movePlanItemSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type MovePlan = z.infer<typeof movePlanSchema>;
