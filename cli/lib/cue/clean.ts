import { rmdir } from "node:fs/promises";
import { match } from "@onrails/pattern";

import { safeAsync } from "../fp.js";
import { classifyTempSplit } from "./classify.js";
import { scanTempSplitDirectories } from "./scan.js";
import type {
  CueCleanOptions,
  TempSplitCleanReport,
  TempSplitCleanResult,
  TempSplitGroup,
} from "./types.js";

export function emptyTempSplitCleanReport(root: string, dryRun: boolean): TempSplitCleanReport {
  return {
    title: "CUE temp-split clean",
    root,
    dryRun,
    stats: {
      scanned: 0,
      candidates: 0,
      wouldDelete: 0,
      deleted: 0,
      skipped: 0,
      failed: 0,
      reportedResults: 0,
    },
    results: [],
    findings: [
      {
        severity: "error",
        message: "Music library root missing.",
        path: root,
      },
    ],
  };
}

function canDeleteTempSplits(options: CueCleanOptions): boolean {
  return !options.dryRun && options.yes;
}

export function tempSplitCleanCandidate(group: TempSplitGroup): boolean {
  return group.status === "empty_stale" && group.safeCleanupCandidate;
}

function cleanFindingSeverity(result: TempSplitCleanResult) {
  return match(result.status)
    .with("failed", () => "error" as const)
    .with("skipped", () => "warn" as const)
    .with("would_delete", () => "info" as const)
    .with("deleted", () => "info" as const)
    .exhaustive();
}

function cleanResultFinding(result: TempSplitCleanResult) {
  return {
    severity: cleanFindingSeverity(result),
    message: `${result.status}: ${result.message}`,
    path: result.tempDirectory,
  };
}

function cleanResultForDryRun(group: TempSplitGroup): TempSplitCleanResult {
  return {
    directory: group.directory,
    tempDirectory: group.tempDirectory,
    status: "would_delete",
    message: "Dry-run: empty __temp_split would be removed.",
  };
}

function cleanResultForSkipped(group: TempSplitGroup): TempSplitCleanResult {
  return {
    directory: group.directory,
    tempDirectory: group.tempDirectory,
    status: "skipped",
    message: `Recheck changed status to ${group.status}; not deleting.`,
  };
}

async function classifyExistingTempSplit(group: TempSplitGroup): Promise<TempSplitGroup> {
  const { readdir } = await import("node:fs/promises");
  const entries = await safeAsync(
    () => readdir(group.tempDirectory, { withFileTypes: true }),
    `read ${group.tempDirectory}`,
  ).unwrapOr([]);

  return classifyTempSplit({
    directory: group.directory,
    tempDirectory: group.tempDirectory,
    entries,
  });
}

async function removeEmptyTempSplit(group: TempSplitGroup): Promise<TempSplitCleanResult> {
  const rechecked = await classifyExistingTempSplit(group);
  if (!tempSplitCleanCandidate(rechecked)) {
    return cleanResultForSkipped(rechecked);
  }

  return await safeAsync(() => rmdir(rechecked.tempDirectory), `remove ${rechecked.tempDirectory}`)
    .map(
      (): TempSplitCleanResult => ({
        directory: rechecked.directory,
        tempDirectory: rechecked.tempDirectory,
        status: "deleted",
        message: "Removed empty __temp_split.",
      }),
    )
    .unwrapOr({
      directory: rechecked.directory,
      tempDirectory: rechecked.tempDirectory,
      status: "failed",
      message: "Failed to remove empty __temp_split.",
    });
}

async function cleanTempSplitCandidate(
  group: TempSplitGroup,
  options: CueCleanOptions,
): Promise<TempSplitCleanResult> {
  if (!canDeleteTempSplits(options)) {
    return cleanResultForDryRun(group);
  }

  return await removeEmptyTempSplit(group);
}

async function cleanTempSplitCandidates(
  groups: TempSplitGroup[],
  options: CueCleanOptions,
): Promise<TempSplitCleanResult[]> {
  const candidates = groups.filter(tempSplitCleanCandidate);

  return await candidates.reduce(
    async (resultsPromise, group) => {
      const results = await resultsPromise;
      const result = await cleanTempSplitCandidate(group, options);

      return [...results, result];
    },
    Promise.resolve([] as TempSplitCleanResult[]),
  );
}

function countCleanStatus(
  results: TempSplitCleanResult[],
  status: TempSplitCleanResult["status"],
): number {
  return results.filter((result) => result.status === status).length;
}

export function buildTempSplitCleanReport(input: {
  root: string;
  dryRun: boolean;
  scanned: number;
  candidates: number;
  results: TempSplitCleanResult[];
  limit: number;
}): TempSplitCleanReport {
  const reportedResults = input.limit === 0 ? input.results : input.results.slice(0, input.limit);

  return {
    title: "CUE temp-split clean",
    root: input.root,
    dryRun: input.dryRun,
    stats: {
      scanned: input.scanned,
      candidates: input.candidates,
      wouldDelete: countCleanStatus(input.results, "would_delete"),
      deleted: countCleanStatus(input.results, "deleted"),
      skipped: countCleanStatus(input.results, "skipped"),
      failed: countCleanStatus(input.results, "failed"),
      reportedResults: reportedResults.length,
    },
    results: reportedResults,
    findings: reportedResults.map(cleanResultFinding),
  };
}

export async function cleanTempSplitAtRoot(
  options: CueCleanOptions,
): Promise<TempSplitCleanReport> {
  const groups = await scanTempSplitDirectories(options.root, options.maxDepth);
  const candidates = groups.filter(tempSplitCleanCandidate);
  const results = await cleanTempSplitCandidates(groups, options);

  return buildTempSplitCleanReport({
    root: options.root,
    dryRun: options.dryRun,
    scanned: groups.length,
    candidates: candidates.length,
    results,
    limit: options.limit,
  });
}
