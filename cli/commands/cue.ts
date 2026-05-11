import { constants, type Dirent } from "node:fs";
import { access, readdir } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { Command } from "commander";
import { ResultAsync } from "neverthrow";
import { Maybe } from "true-myth";
import { match } from "ts-pattern";
import { z } from "zod";

import { fail, formatError, parseWith, safeAsync } from "../lib/fp.js";
import {
  NAS_PATHS,
  pathExists,
  printReport,
  type Finding,
} from "../lib/report.js";
import { logError } from "../lib/utils.js";

const optionsSchema = z.object({
  includeFiles: z.boolean().optional().default(false),
  json: z.boolean().optional().default(false),
  limit: z.coerce.number().int().nonnegative().optional().default(25),
  maxDepth: z.coerce.number().int().positive().optional().default(4),
  root: z.string().optional().default(NAS_PATHS.flac),
});

type CommandOptions = z.infer<typeof optionsSchema>;

type CueStatus =
  | "ready"
  | "blocked_temp_split"
  | "orphan_cue"
  | "already_split_or_false_positive";

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

const requiredTools = ["flac", "cuebreakpoints", "shnsplit"] as const;
const optionalTools = ["cuetag", "metaflac"] as const;

const isAppleDoubleName = (name: string): boolean => name.startsWith("._");
const isCueName = (name: string): boolean =>
  !isAppleDoubleName(name) && /\.cue$/i.test(name);
const isSplitAudioName = (name: string): boolean =>
  !isAppleDoubleName(name) && /\.(flac|wav)$/i.test(name);
const baseName = (name: string): string =>
  name.replace(/\.(cue|flac|wav)$/i, "").toLowerCase();

const isTrackLikeAudioName = (name: string): boolean =>
  /^\d{1,3}(\.| - |-|_)/.test(name) && isSplitAudioName(name);

const hasMultiDiscSignal = (group: Pick<CueGroup, "pairs" | "cueFiles">) =>
  group.pairs.length > 1 ||
  group.cueFiles.some((name) => /\b(cd|disc|disk|act)\s*\d+\b/i.test(name));

const isVisibleDirectory = (entry: Dirent): boolean =>
  entry.isDirectory() && !entry.name.startsWith(".");

const isRequiredTool = (name: string): boolean =>
  requiredTools.includes(name as (typeof requiredTools)[number]);

const isRequiredMissing = (tool: ToolStatus): boolean =>
  tool.required && !tool.available;

const isCueTagMissing = (tool: ToolStatus): boolean =>
  tool.name === "cuetag" && !tool.available;

const isMetaFlacMissing = (tool: ToolStatus): boolean =>
  tool.name === "metaflac" && !tool.available;

const isReadyGroup = (group: CueGroup): boolean => group.status === "ready";

const isBlockedTempSplitGroup = (group: CueGroup): boolean =>
  group.status === "blocked_temp_split";

const isOrphanCueGroup = (group: CueGroup): boolean =>
  group.status === "orphan_cue";

const isAlreadySplitGroup = (group: CueGroup): boolean =>
  group.status === "already_split_or_false_positive";

const hasRisks = (group: CueGroup): boolean => group.risks.length > 0;

function matchingAudio(cueFile: string, audioFiles: string[]): Maybe<string> {
  return Maybe.of(
    audioFiles.find((audioFile) => baseName(audioFile) === baseName(cueFile)),
  );
}

async function commandAvailable(name: string): Promise<boolean> {
  const bunPath = globalThis.Bun?.which(name);
  if (bunPath) {
    return true;
  }

  const paths = process.env["PATH"]?.split(delimiter) ?? [];
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
    .with(
      { hasPair: true, hasTempSplit: true },
      () => "blocked_temp_split" as const,
    )
    .with({ hasPair: true, hasTempSplit: false }, () => "ready" as const)
    .with(
      { hasPair: false, hasTrackLikeAudio: true },
      () => "already_split_or_false_positive" as const,
    )
    .otherwise(() => "orphan_cue" as const);

  const action = match(status)
    .with("ready", () => "Run fix-unsplit-cue on this directory or parent.")
    .with(
      "blocked_temp_split",
      () => "Inspect __temp_split before retrying or cleaning.",
    )
    .with(
      "already_split_or_false_positive",
      () => "Leave alone unless tracks or tags look wrong.",
    )
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

function directoryScan(
  directory: string,
  entries: Dirent[],
): Maybe<DirectoryScan> {
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
        `${directory}/${entry.name}`,
        maxDepth,
        depth + 1,
      );

      return [...scans, ...childScans];
    },
    Promise.resolve([] as DirectoryScan[]),
  );

  return [...current, ...nested];
}

function groupCueDirectories(scans: DirectoryScan[]): CueGroup[] {
  return scans
    .map(classifyGroup)
    .sort((a, b) => a.directory.localeCompare(b.directory));
}

function buildFindings(
  tools: ToolStatus[],
  groups: CueGroup[],
  limit: number,
): Finding[] {
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

function run(
  options: CommandOptions,
): ResultAsync<void, ReturnType<typeof fail>> {
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
      const report = buildReport(
        options.root,
        tools,
        groups,
        options.limit,
        options.includeFiles,
      );

      printReport(report, options.json);
    })(),
  );
}

export default function cueCommand(program: Command): void {
  const cue = program.command("cue").description("CUE sheet workflows");

  cue
    .command("triage")
    .description("Classify CUE/audio directories before splitting")
    .option("--root <path>", "Music library root", NAS_PATHS.flac)
    .option("--max-depth <number>", "Maximum directory walk depth", "4")
    .option("--limit <number>", "Detailed groups to include; 0 means all", "25")
    .option("--include-files", "Include cue/audio file lists in groups", false)
    .option("--json", "Print JSON report", false)
    .action(async (options: Record<string, unknown>) => {
      const result = await parseWith(
        optionsSchema,
        options,
        "Invalid cue triage options",
      ).asyncAndThen(run);

      result.match(
        () => undefined,
        (error) => {
          logError(`CUE triage failed: ${formatError(error)}`);
          process.exit(1);
        },
      );
    });
}
