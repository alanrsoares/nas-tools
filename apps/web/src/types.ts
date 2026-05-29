import type React from "react";

export type Section =
  | "overview"
  | "staging"
  | "dedupe"
  | "cue"
  | "jobs"
  | "downloads"
  | "settings"
  | "player";

export type JobStatus =
  | "queued"
  | "running"
  | "completed"
  | "completed_with_failures"
  | "failed"
  | "canceled"
  | "interrupted";

export type JobCounts = {
  total: number;
  completed: number;
  failed: number;
  skipped: number;
};

export type Issue = {
  code: string;
  message: string;
};

export type NavItem = {
  id: Section;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
};

export type JobRecord = {
  id: string;
  type: string;
  status: JobStatus;
  planId: string | null;
  counts: JobCounts;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type JobEventRecord = {
  id: string;
  jobId: string;
  seq: number;
  type: string;
  level: string;
  message: string;
  data: string | null;
  createdAt: string;
};

export const TERMINAL_STATUSES = new Set<JobStatus>([
  "completed",
  "completed_with_failures",
  "failed",
  "canceled",
  "interrupted",
]);

export type StagingPreviewItem = { name: string; hasCue: boolean };

export type ActiveDownload = {
  id: number;
  name: string;
  progress: number;
  totalSize: number;
  rateDownload: number;
  status: number;
};

export type OrphanedTorrent = {
  id: number;
  name: string;
};

export type PlayerStatus = "idle" | "playing" | "paused";

export type PlayerState = {
  status: PlayerStatus;
  currentTrack: string | null;
  device: string;
  positionMs: number;
  durationMs: number | null;
  sampleRate: number | null;
  bitDepth: number | null;
  channels: number | null;
};

export type AudioFileType = "flac" | "alac" | "dsd";

export type BrowseEntry = {
  name: string;
  path: string;
  type: "dir" | AudioFileType;
};

export type BrowseResult = {
  path: string;
  entries: BrowseEntry[];
};
