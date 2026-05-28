import type React from "react";

export type Section = "overview" | "staging" | "dedupe" | "cue" | "jobs" | "downloads" | "settings";

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
