import { constants, type Dirent } from "node:fs";
import { access, readdir, rmdir } from "node:fs/promises";
import { delimiter, join } from "node:path";
import type { Command } from "commander";
import { ResultAsync } from "neverthrow";
import { Maybe } from "true-myth";
import { match } from "ts-pattern";
import { z } from "zod";

import { type fail, formatError, parseWith, safeAsync } from "../lib/fp.js";
import { type Finding, NAS_PATHS, pathExists, printReport } from "../lib/report.js";
import { logError } from "../lib/utils.js";

const optionsSchema = z.object({
  includeFiles: z.boolean().optional().default(false),
  json: z.boolean().optional().default(false),
  limit: z.coerce.number().int().nonnegative().optional().default(25),
  maxDepth: z.coerce.number().int().positive().optional().default(4),
  root: z.string().optional().default(NAS_PATHS.flac),
});

const cleanOptionsSchema = optionsSchema.extend({
  dryRun: z.boolean().optional().default(true),
  yes: z.boolean().optional().default(false),
});

type CommandOptions = z.infer<typeof optionsSchema>;
type CleanOptions = z.infer<typeof cleanOptionsSchema>;

type CueStatus = "ready" | "blocked_temp_split" | "orphan_cue" | "already_split_or_false_positive";

type TempSplitStatus =
  | "empty_stale"
  | "has_split_tracks"
  | "has_cue_or_original"
  | "suspicious_mixed";

interface ToolStatus {
  name: string;
  available: boolean;
  required: boolean;
}

interface CuePair {
  cue: string;
  audio: string;
}

interface CueGroup {
  directory: string;
  status: CueStatus;
  cueFiles: string[];
  audioFiles: string[];
  pairs: CuePair[];
  risks: string[];
  action: string;
}

interface DirectoryScan {
  directory: string;
  cueFiles: string[];
  audioFiles: string[];
  hasTempSplit: boolean;
}

type ReportedCueGroup = Omit<CueGroup, "cueFiles" | "audioFiles"> &
  Partial<Pick<CueGroup, "cueFiles" | "audioFiles">>;

interface TempSplitGroup {
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

type ReportedTempSplitGroup = Omit<TempSplitGroup, "cueFiles" | "audioFiles" | "otherFiles"> &
  Partial<Pick<TempSplitGroup, "cueFiles" | "audioFiles" | "otherFiles">>;

interface CueTriageReport {
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

interface TempSplitTriageReport {
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

interface TempSplitCleanResult {
  directory: string;
  tempDirectory: string;
  status: "would_delete" | "deleted" | "skipped" | "failed";
  message: string;
}

interface TempSplitCleanReport {
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

const requiredTools = ["flac", "cuebreakpoints", "shnsplit"] as const;
const optionalTools = ["cuetag", "metaflac"] as const;

const isAppleDoubleName = (name: string): boolean => name.startsWith("._");
const isCueName = (name: string): boolean => !isAppleDoubleName(name) && /\.cue$/i.test(name);
const isSplitAudioName = (name: string): boolean =>
  !isAppleDoubleName(name) && /\.(flac|wav|wv)$/i.test(name);
const baseName = (name: string): string => name.replace(/\.(cue|flac|wav|wv)$/i, "").toLowerCase();

const isTrackLikeAudioName = (name: string): boolean =>
  /^\d{1,3}(\.| - |-|_| )/.test(name) && isSplitAudioName(name);

const hasMultiDiscSignal = (group: Pick<CueGroup, "pairs" | "cueFiles">) =>
  group.pairs.length > 1 ||
  group.cueFiles.some((name) => /\b(cd|disc|disk|act)\s*\d+\b/i.test(name));

const isVisibleDirectory = (entry: Dirent): boolean =>
  entry.isDirectory() && !entry.name.startsWith(".");

const isRequiredTool = (name: string): boolean =>
  requiredTools.includes(name as (typeof requiredTools)[number]);

const isRequiredMissing = (tool: ToolStatus): boolean => tool.required && !tool.available;

const isCueTagMissing = (tool: ToolStatus): boolean => tool.name === "cuetag" && !tool.available;

const isMetaFlacMissing = (tool: ToolStatus): boolean =>
  tool.name === "metaflac" && !tool.available;

const isReadyGroup = (group: CueGroup): boolean => group.status === "ready";

const isBlockedTempSplitGroup = (group: CueGroup): boolean => group.status === "blocked_temp_split";

const isOrphanCueGroup = (group: CueGroup): boolean => group.status === "orphan_cue";

const isAlreadySplitGroup = (group: CueGroup): boolean =>
  group.status === "already_split_or_false_positive";

const hasRisks = (group: CueGroup): boolean => group.risks.length > 0;

const isEmptyStaleTempSplit = (group: TempSplitGroup): boolean => group.status === "empty_stale";

const hasSplitTracksTempSplit = (group: TempSplitGroup): boolean =>
  group.status === "has_split_tracks";

const hasCueOrOriginalTempSplit = (group: TempSplitGroup): boolean =>
  group.status === "has_cue_or_original";

const isSuspiciousMixedTempSplit = (group: TempSplitGroup): boolean =>
  group.status === "suspicious_mixed";

const isSafeCleanupCandidate = (group: TempSplitGroup): boolean => group.safeCleanupCandidate;

function matchingAudio(cueFile: string, audioFiles: string[]): Maybe<string> {
  return Maybe.of(audioFiles.find((audioFile) => baseName(audioFile) === baseName(cueFile)));
}

async function commandAvailable(name: string): Promise<boolean> {
  const bunPath = globalThis.Bun?.which(name);
  if (bunPath) {
    return true;
  }

  const paths = process.env.PATH?.split(delimiter) ?? [];
  for (const path of paths) {
    const candidate = join(path, name);
    const canExecute = await safeAsync(
      () => access(candidate, constants.X_OK),
      `access ${candidate}`,
    )
      .map(() => true)
      .unwrapOr(false);
    if (canExecute) {
      return true;
    }
  }

  return false;
}

async function getToolStatus(name: string): Promise<ToolStatus> {
  return {
    name,
    available: await commandAvailable(name),
    required: isRequiredTool(name),
  };
}

async function checkTools(): Promise<ToolStatus[]> {
  const tools = [...requiredTools, ...optionalTools];

  return await Promise.all(tools.map(getToolStatus));
}

function classifyGroup(input: {
  directory: string;
  cueFiles: string[];
  audioFiles: string[];
  hasTempSplit: boolean;
}): CueGroup {
  const pairs = input.cueFiles.flatMap((cue) => cuePair(cue, input.audioFiles));
  const risks = hasMultiDiscSignal({ cueFiles: input.cueFiles, pairs })
    ? ["multi-disc naming; process one logical disc at a time"]
    : [];

  const status: CueStatus = match({
    hasPair: pairs.length > 0,
    hasTempSplit: input.hasTempSplit,
    hasTrackLikeAudio: input.audioFiles.some(isTrackLikeAudioName),
  })
    .with({ hasPair: true, hasTempSplit: true }, () => "blocked_temp_split" as const)
    .with({ hasPair: true, hasTempSplit: false }, () => "ready" as const)
    .with(
      { hasPair: false, hasTrackLikeAudio: true },
      () => "already_split_or_false_positive" as const,
    )
    .otherwise(() => "orphan_cue" as const);

  const action = match(status)
    .with("ready", () => "Run fix-unsplit-cue on this directory or parent.")
    .with("blocked_temp_split", () => "Inspect __temp_split before retrying or cleaning.")
    .with("already_split_or_false_positive", () => "Leave alone unless tracks or tags look wrong.")
    .with("orphan_cue", () => "Find matching FLAC/WAV or remove stale CUE.")
    .exhaustive();

  return {
    directory: input.directory,
    status,
    cueFiles: input.cueFiles,
    audioFiles: input.audioFiles,
    pairs,
    risks,
    action,
  };
}

function cuePair(cue: string, audioFiles: string[]): CuePair[] {
  return matchingAudio(cue, audioFiles).mapOr([], (audio) => [{ cue, audio }]);
}

function directoryScan(directory: string, entries: Dirent[]): Maybe<DirectoryScan> {
  const cueFiles = entries
    .filter((entry) => entry.isFile() && isCueName(entry.name))
    .map((entry) => entry.name)
    .sort();
  if (cueFiles.length === 0) {
    return Maybe.nothing<DirectoryScan>();
  }

  const audioFiles = entries
    .filter((entry) => entry.isFile() && isSplitAudioName(entry.name))
    .map((entry) => entry.name)
    .sort();
  const hasTempSplit = entries.some(
    (entry) => entry.isDirectory() && entry.name === "__temp_split",
  );

  return Maybe.just({
    directory,
    cueFiles,
    audioFiles,
    hasTempSplit,
  });
}

async function readDirents(directory: string): Promise<Dirent[]> {
  return await safeAsync(
    () => readdir(directory, { withFileTypes: true }),
    `read ${directory}`,
  ).unwrapOr([]);
}

function childDirectoryPath(parent: string, entry: Dirent): string {
  return join(parent, entry.name);
}

async function scanCueDirectories(
  directory: string,
  maxDepth: number,
  depth = 0,
): Promise<DirectoryScan[]> {
  const entries = await readDirents(directory);
  const current = directoryScan(directory, entries).mapOr([], (scan) => [scan]);
  if (depth >= maxDepth) {
    return current;
  }

  const childDirectories = entries
    .filter(isVisibleDirectory)
    .filter((entry) => entry.name !== "__temp_split");
  const nested = await childDirectories.reduce(
    async (scansPromise, entry) => {
      const scans = await scansPromise;
      const childScans = await scanCueDirectories(
        childDirectoryPath(directory, entry),
        maxDepth,
        depth + 1,
      );

      return [...scans, ...childScans];
    },
    Promise.resolve([] as DirectoryScan[]),
  );

  return [...current, ...nested];
}

function tempSplitEntry(entries: Dirent[]): Maybe<Dirent> {
  return Maybe.of(entries.find((entry) => entry.isDirectory() && entry.name === "__temp_split"));
}

function visibleEntryNames(entries: Dirent[], predicate: (entry: Dirent) => boolean): string[] {
  return entries
    .filter((entry) => !isAppleDoubleName(entry.name))
    .filter(predicate)
    .map((entry) => entry.name)
    .sort();
}

function classifyTempSplit(input: {
  directory: string;
  tempDirectory: string;
  entries: Dirent[];
}): TempSplitGroup {
  const cueFiles = visibleEntryNames(
    input.entries,
    (entry) => entry.isFile() && isCueName(entry.name),
  );
  const audioFiles = visibleEntryNames(
    input.entries,
    (entry) => entry.isFile() && isSplitAudioName(entry.name),
  );
  const otherFiles = visibleEntryNames(
    input.entries,
    (entry) => entry.isFile() && !isCueName(entry.name) && !isSplitAudioName(entry.name),
  );
  const directoryCount = input.entries.filter(isVisibleDirectory).length;
  const fileCount = cueFiles.length + audioFiles.length + otherFiles.length;
  const hasOnlyTrackLikeAudio =
    audioFiles.length > 0 &&
    cueFiles.length === 0 &&
    otherFiles.length === 0 &&
    directoryCount === 0 &&
    audioFiles.every(isTrackLikeAudioName);

  const status: TempSplitStatus = match({
    cueCount: cueFiles.length,
    directoryCount,
    fileCount,
    hasOnlyTrackLikeAudio,
    otherCount: otherFiles.length,
  })
    .with({ fileCount: 0, directoryCount: 0 }, () => "empty_stale" as const)
    .with(
      { cueCount: 0, otherCount: 0, hasOnlyTrackLikeAudio: true },
      () => "has_split_tracks" as const,
    )
    .with({ directoryCount: 0, otherCount: 0 }, () => "has_cue_or_original" as const)
    .otherwise(() => "suspicious_mixed" as const);
  const safeCleanupCandidate = status === "empty_stale";

  return {
    directory: input.directory,
    tempDirectory: input.tempDirectory,
    status,
    safeCleanupCandidate,
    fileCount,
    directoryCount,
    cueFiles,
    audioFiles,
    otherFiles,
    action: tempSplitAction(status),
  };
}

function tempSplitAction(status: TempSplitStatus): string {
  return match(status)
    .with("empty_stale", () => "Safe cleanup candidate after dry-run review.")
    .with("has_split_tracks", () => "Inspect or recover split tracks before cleanup.")
    .with("has_cue_or_original", () => "Inspect original/CUE leftovers before retrying.")
    .with("suspicious_mixed", () => "Manual review required; do not auto-clean.")
    .exhaustive();
}

async function tempSplitGroup(directory: string, tempEntry: Dirent): Promise<TempSplitGroup> {
  const tempDirectory = childDirectoryPath(directory, tempEntry);
  const entries = await readDirents(tempDirectory);

  return classifyTempSplit({ directory, tempDirectory, entries });
}

async function scanTempSplitDirectories(
  directory: string,
  maxDepth: number,
  depth = 0,
): Promise<TempSplitGroup[]> {
  const entries = await readDirents(directory);
  const current = await tempSplitEntry(entries).mapOr(
    Promise.resolve([] as TempSplitGroup[]),
    async (entry) => [await tempSplitGroup(directory, entry)],
  );
  if (depth >= maxDepth) {
    return current;
  }

  const childDirectories = entries
    .filter(isVisibleDirectory)
    .filter((entry) => entry.name !== "__temp_split");
  const nested = await childDirectories.reduce(
    async (groupsPromise, entry) => {
      const groups = await groupsPromise;
      const childGroups = await scanTempSplitDirectories(
        childDirectoryPath(directory, entry),
        maxDepth,
        depth + 1,
      );

      return [...groups, ...childGroups];
    },
    Promise.resolve([] as TempSplitGroup[]),
  );

  return [...current, ...nested].sort((a, b) => a.directory.localeCompare(b.directory));
}

function groupCueDirectories(scans: DirectoryScan[]): CueGroup[] {
  return scans.map(classifyGroup).sort((a, b) => a.directory.localeCompare(b.directory));
}

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

function emptyReport(root: string): CueTriageReport {
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

function buildReport(
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

function reportGroup(group: CueGroup, includeFiles: boolean): ReportedCueGroup {
  if (includeFiles) {
    return group;
  }

  const { cueFiles: _cueFiles, audioFiles: _audioFiles, ...summary } = group;
  return summary;
}

function emptyTempSplitReport(root: string): TempSplitTriageReport {
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

function buildTempSplitReport(
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

function emptyTempSplitCleanReport(root: string, dryRun: boolean): TempSplitCleanReport {
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

function canDeleteTempSplits(options: CleanOptions): boolean {
  return !options.dryRun && options.yes;
}

function tempSplitCleanCandidate(group: TempSplitGroup): boolean {
  return group.status === "empty_stale" && group.safeCleanupCandidate;
}

function cleanFindingSeverity(result: TempSplitCleanResult): Finding["severity"] {
  return match(result.status)
    .with("failed", () => "error" as const)
    .with("skipped", () => "warn" as const)
    .otherwise(() => "info" as const);
}

function cleanResultFinding(result: TempSplitCleanResult): Finding {
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
  const entries = await readDirents(group.tempDirectory);

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
  options: CleanOptions,
): Promise<TempSplitCleanResult> {
  if (!canDeleteTempSplits(options)) {
    return cleanResultForDryRun(group);
  }

  return await removeEmptyTempSplit(group);
}

async function cleanTempSplitCandidates(
  groups: TempSplitGroup[],
  options: CleanOptions,
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

function buildTempSplitCleanReport(input: {
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

function runCueTriage(options: CommandOptions): ResultAsync<void, ReturnType<typeof fail>> {
  return ResultAsync.fromSafePromise(
    (async () => {
      if (!(await pathExists(options.root))) {
        printReport(emptyReport(options.root), options.json);
        return;
      }

      const [tools, scans] = await Promise.all([
        checkTools(),
        scanCueDirectories(options.root, options.maxDepth),
      ]);
      const groups = groupCueDirectories(scans);
      const report = buildReport(options.root, tools, groups, options.limit, options.includeFiles);

      printReport(report, options.json);
    })(),
  );
}

function runTempSplitTriage(options: CommandOptions): ResultAsync<void, ReturnType<typeof fail>> {
  return ResultAsync.fromSafePromise(
    (async () => {
      if (!(await pathExists(options.root))) {
        printReport(emptyTempSplitReport(options.root), options.json);
        return;
      }

      const groups = await scanTempSplitDirectories(options.root, options.maxDepth);
      const report = buildTempSplitReport(
        options.root,
        groups,
        options.limit,
        options.includeFiles,
      );

      printReport(report, options.json);
    })(),
  );
}

function runTempSplitClean(options: CleanOptions): ResultAsync<void, ReturnType<typeof fail>> {
  return ResultAsync.fromSafePromise(
    (async () => {
      if (!(await pathExists(options.root))) {
        printReport(emptyTempSplitCleanReport(options.root, options.dryRun), options.json);
        return;
      }

      const groups = await scanTempSplitDirectories(options.root, options.maxDepth);
      const candidates = groups.filter(tempSplitCleanCandidate);
      const results = await cleanTempSplitCandidates(groups, options);
      const report = buildTempSplitCleanReport({
        root: options.root,
        dryRun: options.dryRun,
        scanned: groups.length,
        candidates: candidates.length,
        results,
        limit: options.limit,
      });

      printReport(report, options.json);

      if (report.stats.failed > 0) {
        process.exitCode = 1;
      }
    })(),
  );
}

async function handleCueTriage(options: Record<string, unknown>): Promise<void> {
  const result = await parseWith(optionsSchema, options, "Invalid cue triage options").asyncAndThen(
    runCueTriage,
  );

  result.match(
    () => undefined,
    (error) => {
      logError(`CUE triage failed: ${formatError(error)}`);
      process.exit(1);
    },
  );
}

async function handleTempSplitTriage(options: Record<string, unknown>): Promise<void> {
  const result = await parseWith(
    optionsSchema,
    options,
    "Invalid cue temp-split triage options",
  ).asyncAndThen(runTempSplitTriage);

  result.match(
    () => undefined,
    (error) => {
      logError(`CUE temp-split triage failed: ${formatError(error)}`);
      process.exit(1);
    },
  );
}

async function handleTempSplitClean(options: Record<string, unknown>): Promise<void> {
  const result = await parseWith(
    cleanOptionsSchema,
    options,
    "Invalid cue temp-split clean options",
  ).asyncAndThen(runTempSplitClean);

  result.match(
    () => undefined,
    (error) => {
      logError(`CUE temp-split clean failed: ${formatError(error)}`);
      process.exit(1);
    },
  );
}

export default function cueCommand(program: Command): void {
  const cue = program.command("cue").description("CUE sheet workflows");
  const tempSplit = cue.command("temp-split").description("Inspect __temp_split leftovers");

  cue
    .command("triage")
    .description("Classify CUE/audio directories before splitting")
    .option("--root <path>", "Music library root", NAS_PATHS.flac)
    .option("--max-depth <number>", "Maximum directory walk depth", "4")
    .option("--limit <number>", "Detailed groups to include; 0 means all", "25")
    .option("--include-files", "Include cue/audio file lists in groups", false)
    .option("--json", "Print JSON report", false)
    .action(handleCueTriage);

  tempSplit
    .command("triage")
    .description("Classify __temp_split directories before cleanup")
    .option("--root <path>", "Music library root", NAS_PATHS.flac)
    .option("--max-depth <number>", "Maximum directory walk depth", "4")
    .option("--limit <number>", "Detailed groups to include; 0 means all", "25")
    .option("--include-files", "Include temp file lists in groups", false)
    .option("--json", "Print JSON report", false)
    .action(handleTempSplitTriage);

  tempSplit
    .command("clean")
    .description("Remove empty __temp_split directories")
    .option("--root <path>", "Music library root", NAS_PATHS.flac)
    .option("--max-depth <number>", "Maximum directory walk depth", "4")
    .option("--limit <number>", "Detailed results to include; 0 means all", "25")
    .option("--dry-run", "Preview deletions", true)
    .option("--no-dry-run", "Allow deletion when combined with --yes")
    .option("--yes", "Confirm deletion when combined with --no-dry-run", false)
    .option("--json", "Print JSON report", false)
    .action(handleTempSplitClean);
}
