import type { Dirent } from "node:fs";

import type { CueGroup, TempSplitGroup, ToolStatus } from "./types.js";

export const requiredTools = ["flac", "cuebreakpoints", "shnsplit"] as const;
export const optionalTools = ["cuetag", "metaflac"] as const;

const isAppleDoubleName = (name: string): boolean => name.startsWith("._");

export const isCueName = (name: string): boolean =>
  !isAppleDoubleName(name) && /\.cue$/i.test(name);

export const isSplitAudioName = (name: string): boolean =>
  !isAppleDoubleName(name) && /\.(flac|wav|wv)$/i.test(name);

export const baseName = (name: string): string =>
  name.replace(/\.(cue|flac|wav|wv)$/i, "").toLowerCase();

export const isTrackLikeAudioName = (name: string): boolean =>
  /^\d{1,3}(\.| - |-|_| )/.test(name) && isSplitAudioName(name);

export const isVisibleDirectory = (entry: Dirent): boolean =>
  entry.isDirectory() && !entry.name.startsWith(".");

export const isRequiredTool = (name: string): boolean =>
  requiredTools.includes(name as (typeof requiredTools)[number]);

export const isRequiredMissing = (tool: ToolStatus): boolean => tool.required && !tool.available;

export const isCueTagMissing = (tool: ToolStatus): boolean =>
  tool.name === "cuetag" && !tool.available;

export const isMetaFlacMissing = (tool: ToolStatus): boolean =>
  tool.name === "metaflac" && !tool.available;

export const isReadyGroup = (group: CueGroup): boolean => group.status === "ready";

export const isBlockedTempSplitGroup = (group: CueGroup): boolean =>
  group.status === "blocked_temp_split";

export const isOrphanCueGroup = (group: CueGroup): boolean => group.status === "orphan_cue";

export const isAlreadySplitGroup = (group: CueGroup): boolean =>
  group.status === "already_split_or_false_positive";

export const hasRisks = (group: CueGroup): boolean => group.risks.length > 0;

export const isEmptyStaleTempSplit = (group: TempSplitGroup): boolean =>
  group.status === "empty_stale";

export const hasSplitTracksTempSplit = (group: TempSplitGroup): boolean =>
  group.status === "has_split_tracks";

export const hasCueOrOriginalTempSplit = (group: TempSplitGroup): boolean =>
  group.status === "has_cue_or_original";

export const isSuspiciousMixedTempSplit = (group: TempSplitGroup): boolean =>
  group.status === "suspicious_mixed";

export const isSafeCleanupCandidate = (group: TempSplitGroup): boolean =>
  group.safeCleanupCandidate;
