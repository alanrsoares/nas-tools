import { match } from "@onrails/pattern";

import type { Finding } from "../report.js";
import {
  hasCueOrOriginalTempSplit,
  hasRisks,
  hasSplitTracksTempSplit,
  isAlreadySplitGroup,
  isBlockedTempSplitGroup,
  isCueTagMissing,
  isEmptyStaleTempSplit,
  isMetaFlacMissing,
  isOrphanCueGroup,
  isReadyGroup,
  isRequiredMissing,
  isSafeCleanupCandidate,
  isSuspiciousMixedTempSplit,
} from "./names.js";
import type {
  CueGroup,
  CueTriageReport,
  ReportedCueGroup,
  ReportedTempSplitGroup,
  TempSplitGroup,
  TempSplitStatus,
  TempSplitTriageReport,
  ToolStatus,
} from "./types.js";

function buildFindings(tools: ToolStatus[], groups: CueGroup[], limit: number): Finding[] {
  const findings: Finding[] = [];

  for (const tool of tools.filter(isRequiredMissing)) {
    findings.push({
      severity: "error",
      message: `Required split tool missing: ${tool.name}.`,
    });
  }

  if (tools.some(isCueTagMissing) && tools.some(isMetaFlacMissing)) {
    findings.push({
      severity: "warn",
      message: "No CUE tagging helper found; split files may lack tags.",
    });
  }

  const reportedGroups = limit === 0 ? groups : groups.slice(0, limit);
  for (const group of reportedGroups) {
    const severity = match(group.status)
      .with("ready", () => "warn" as const)
      .with("blocked_temp_split", () => "error" as const)
      .with("orphan_cue", () => "warn" as const)
      .with("already_split_or_false_positive", () => "info" as const)
      .exhaustive();

    findings.push({
      severity,
      message: `${group.status}: ${group.action}`,
      path: group.directory,
    });
  }

  return findings;
}

function reportGroup(group: CueGroup, includeFiles: boolean): ReportedCueGroup {
  if (includeFiles) {
    return group;
  }

  const { cueFiles: _cueFiles, audioFiles: _audioFiles, ...summary } = group;
  return summary;
}

export function emptyReport(root: string): CueTriageReport {
  return {
    title: "CUE triage",
    root,
    tools: [],
    stats: {
      directories: 0,
      ready: 0,
      blockedTempSplit: 0,
      orphanCue: 0,
      alreadySplitOrFalsePositive: 0,
      suspiciousMultiDisc: 0,
      missingRequiredTools: 0,
      reportedGroups: 0,
    },
    groups: [],
    findings: [
      {
        severity: "error",
        message: "Music library root missing.",
        path: root,
      },
    ],
  };
}

export function buildReport(
  root: string,
  tools: ToolStatus[],
  groups: CueGroup[],
  limit: number,
  includeFiles: boolean,
): CueTriageReport {
  const reportedGroups = limit === 0 ? groups : groups.slice(0, limit);

  return {
    title: "CUE triage",
    root,
    tools,
    stats: {
      directories: groups.length,
      ready: groups.filter(isReadyGroup).length,
      blockedTempSplit: groups.filter(isBlockedTempSplitGroup).length,
      orphanCue: groups.filter(isOrphanCueGroup).length,
      alreadySplitOrFalsePositive: groups.filter(isAlreadySplitGroup).length,
      suspiciousMultiDisc: groups.filter(hasRisks).length,
      missingRequiredTools: tools.filter(isRequiredMissing).length,
      reportedGroups: reportedGroups.length,
    },
    groups: reportedGroups.map((group) => reportGroup(group, includeFiles)),
    findings: buildFindings(tools, groups, limit),
  };
}

function tempSplitSeverity(status: TempSplitStatus): Finding["severity"] {
  return match(status)
    .with("empty_stale", () => "info" as const)
    .with("has_split_tracks", () => "warn" as const)
    .with("has_cue_or_original", () => "warn" as const)
    .with("suspicious_mixed", () => "error" as const)
    .exhaustive();
}

function reportTempSplitGroup(
  group: TempSplitGroup,
  includeFiles: boolean,
): ReportedTempSplitGroup {
  if (includeFiles) {
    return group;
  }

  const {
    cueFiles: _cueFiles,
    audioFiles: _audioFiles,
    otherFiles: _otherFiles,
    ...summary
  } = group;
  return summary;
}

function buildTempSplitFindings(groups: TempSplitGroup[], limit: number): Finding[] {
  const reportedGroups = limit === 0 ? groups : groups.slice(0, limit);

  return reportedGroups.map((group) => ({
    severity: tempSplitSeverity(group.status),
    message: `${group.status}: ${group.action}`,
    path: group.tempDirectory,
  }));
}

export function emptyTempSplitReport(root: string): TempSplitTriageReport {
  return {
    title: "CUE temp-split triage",
    root,
    stats: {
      tempSplitDirs: 0,
      emptyStale: 0,
      hasSplitTracks: 0,
      hasCueOrOriginal: 0,
      suspiciousMixed: 0,
      safeCleanupCandidates: 0,
      reportedGroups: 0,
    },
    groups: [],
    findings: [
      {
        severity: "error",
        message: "Music library root missing.",
        path: root,
      },
    ],
  };
}

export function buildTempSplitReport(
  root: string,
  groups: TempSplitGroup[],
  limit: number,
  includeFiles: boolean,
): TempSplitTriageReport {
  const reportedGroups = limit === 0 ? groups : groups.slice(0, limit);

  return {
    title: "CUE temp-split triage",
    root,
    stats: {
      tempSplitDirs: groups.length,
      emptyStale: groups.filter(isEmptyStaleTempSplit).length,
      hasSplitTracks: groups.filter(hasSplitTracksTempSplit).length,
      hasCueOrOriginal: groups.filter(hasCueOrOriginalTempSplit).length,
      suspiciousMixed: groups.filter(isSuspiciousMixedTempSplit).length,
      safeCleanupCandidates: groups.filter(isSafeCleanupCandidate).length,
      reportedGroups: reportedGroups.length,
    },
    groups: reportedGroups.map((group) => reportTempSplitGroup(group, includeFiles)),
    findings: buildTempSplitFindings(groups, limit),
  };
}
