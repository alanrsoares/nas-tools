import type { ResultAsync } from "@onrails/result";

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

export type BrowseResult = { path: string; entries: BrowseEntry[] };
export type AlsaDevice = { id: string; name: string };
export type PlayerError = { message: string };
export type StateListener = (state: PlayerState) => void;

export type PlayerPort = {
  getState: () => PlayerState;
  subscribe: (fn: StateListener) => () => void;
  play: (filePath: string, device?: string) => ResultAsync<void, PlayerError>;
  pause: () => ResultAsync<void, PlayerError>;
  resume: () => ResultAsync<void, PlayerError>;
  stop: () => ResultAsync<void, PlayerError>;
  browse: (dirPath?: string) => ResultAsync<BrowseResult, PlayerError>;
  listTracks: (dirPath: string) => ResultAsync<string[], PlayerError>;
  listDevices: () => ResultAsync<AlsaDevice[], PlayerError>;
};
