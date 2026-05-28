import type { Finding } from "../report.js";

export type CueStatus =
  | "ready"
  | "blocked_temp_split"
  | "orphan_cue"
  | "already_split_or_false_positive";

export type TempSplitStatus =
  | "empty_stale"
  | "has_split_tracks"
  | "has_cue_or_original"
  | "suspicious_mixed";

export interface ToolStatus {
  name: string;
  available: boolean;
  required: boolean;
}

export interface CuePair {
  cue: string;
  audio: string;
}

export interface CueGroup {
  directory: string;
  status: CueStatus;
  cueFiles: string[];
  audioFiles: string[];
  pairs: CuePair[];
  risks: string[];
  action: string;
}

export interface DirectoryScan {
  directory: string;
  cueFiles: string[];
  audioFiles: string[];
  hasTempSplit: boolean;
}

export type ReportedCueGroup = Omit<CueGroup, "cueFiles" | "audioFiles"> &
  Partial<Pick<CueGroup, "cueFiles" | "audioFiles">>;

export interface TempSplitGroup {
  directory: string;
  tempDirectory: string;
  status: TempSplitStatus;
  safeCleanupCandidate: boolean;
  fileCount: number;
  directoryCount: number;
  cueFiles: string[];
  audioFiles: string[];
  otherFiles: string[];
  action: string;
}

export type ReportedTempSplitGroup = Omit<
  TempSplitGroup,
  "cueFiles" | "audioFiles" | "otherFiles"
> &
  Partial<Pick<TempSplitGroup, "cueFiles" | "audioFiles" | "otherFiles">>;

export interface CueTriageReport {
  title: string;
  root: string;
  tools: ToolStatus[];
  stats: {
    directories: number;
    ready: number;
    blockedTempSplit: number;
    orphanCue: number;
    alreadySplitOrFalsePositive: number;
    suspiciousMultiDisc: number;
    missingRequiredTools: number;
    reportedGroups: number;
  };
  groups: ReportedCueGroup[];
  findings: Finding[];
}

export interface TempSplitTriageReport {
  title: string;
  root: string;
  stats: {
    tempSplitDirs: number;
    emptyStale: number;
    hasSplitTracks: number;
    hasCueOrOriginal: number;
    suspiciousMixed: number;
    safeCleanupCandidates: number;
    reportedGroups: number;
  };
  groups: ReportedTempSplitGroup[];
  findings: Finding[];
}

export interface TempSplitCleanResult {
  directory: string;
  tempDirectory: string;
  status: "would_delete" | "deleted" | "skipped" | "failed";
  message: string;
}

export interface TempSplitCleanReport {
  title: string;
  root: string;
  dryRun: boolean;
  stats: {
    scanned: number;
    candidates: number;
    wouldDelete: number;
    deleted: number;
    skipped: number;
    failed: number;
    reportedResults: number;
  };
  results: TempSplitCleanResult[];
  findings: Finding[];
}

export interface CueCommandOptions {
  includeFiles: boolean;
  json: boolean;
  limit: number;
  maxDepth: number;
  root: string;
}

export interface CueCleanOptions extends CueCommandOptions {
  dryRun: boolean;
  yes: boolean;
}
