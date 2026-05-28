import type { Dirent } from "node:fs";
import { fromNullable, getOrElse, type Maybe, map as mapMaybe, none, some } from "@onrails/maybe";
import { match } from "@onrails/pattern";
import {
  baseName,
  isCueName,
  isSplitAudioName,
  isTrackLikeAudioName,
  isVisibleDirectory,
} from "./names.js";
import type {
  CueGroup,
  CuePair,
  CueStatus,
  DirectoryScan,
  TempSplitGroup,
  TempSplitStatus,
} from "./types.js";

function matchingAudio(cueFile: string, audioFiles: string[]): Maybe<string> {
  return fromNullable(audioFiles.find((audioFile) => baseName(audioFile) === baseName(cueFile)));
}

function cuePair(cue: string, audioFiles: string[]): CuePair[] {
  return getOrElse(
    mapMaybe(matchingAudio(cue, audioFiles), (audio) => [{ cue, audio }]),
    [],
  );
}

export function classifyGroup(input: {
  directory: string;
  cueFiles: string[];
  audioFiles: string[];
  hasTempSplit: boolean;
}): CueGroup {
  const pairs = input.cueFiles.flatMap((cue) => cuePair(cue, input.audioFiles));
  const risks =
    pairs.length > 1 || input.cueFiles.some((name) => /\b(cd|disc|disk|act)\s*\d+\b/i.test(name))
      ? ["multi-disc naming; process one logical disc at a time"]
      : [];

  const hasPair = pairs.length > 0;
  const hasTrackLikeAudio = input.audioFiles.some(isTrackLikeAudioName);
  const status: CueStatus = hasPair
    ? input.hasTempSplit
      ? "blocked_temp_split"
      : "ready"
    : hasTrackLikeAudio
      ? "already_split_or_false_positive"
      : "orphan_cue";

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

export function directoryScan(directory: string, entries: Dirent[]): Maybe<DirectoryScan> {
  const cueFiles = entries
    .filter((entry) => entry.isFile() && isCueName(entry.name))
    .map((entry) => entry.name)
    .sort();
  if (cueFiles.length === 0) {
    return none<DirectoryScan>();
  }

  const audioFiles = entries
    .filter((entry) => entry.isFile() && isSplitAudioName(entry.name))
    .map((entry) => entry.name)
    .sort();
  const hasTempSplit = entries.some(
    (entry) => entry.isDirectory() && entry.name === "__temp_split",
  );

  return some({
    directory,
    cueFiles,
    audioFiles,
    hasTempSplit,
  });
}

function visibleEntryNames(entries: Dirent[], predicate: (entry: Dirent) => boolean): string[] {
  return entries
    .filter((entry) => !entry.name.startsWith("._"))
    .filter(predicate)
    .map((entry) => entry.name)
    .sort();
}

function tempSplitAction(status: TempSplitStatus): string {
  return match(status)
    .with("empty_stale", () => "Safe cleanup candidate after dry-run review.")
    .with("has_split_tracks", () => "Inspect or recover split tracks before cleanup.")
    .with("has_cue_or_original", () => "Inspect original/CUE leftovers before retrying.")
    .with("suspicious_mixed", () => "Manual review required; do not auto-clean.")
    .exhaustive();
}

export function classifyTempSplit(input: {
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

  const status: TempSplitStatus =
    fileCount === 0 && directoryCount === 0
      ? "empty_stale"
      : cueFiles.length === 0 && otherFiles.length === 0 && hasOnlyTrackLikeAudio
        ? "has_split_tracks"
        : directoryCount === 0 && otherFiles.length === 0
          ? "has_cue_or_original"
          : "suspicious_mixed";
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
