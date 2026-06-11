import { errAsync, type ResultAsync } from "@onrails/result";
import { makeMpdAdapter } from "./mpd/adapter.js";
import { connectMpd } from "./mpd/client.js";
import { createStateWatcher } from "./mpd/watcher.js";
import type { PlayerError, PlayerPort, PlayerState } from "./port.js";

export type {
  AlsaDevice,
  AudioFileType,
  BrowseEntry,
  BrowseResult,
  PlayerError,
  PlayerPort,
  PlayerState,
  PlayerStatus,
} from "./port.js";

const unavailable = (): ResultAsync<never, PlayerError> =>
  errAsync({ message: "player unavailable" });

const nullState: PlayerState = {
  status: "idle",
  currentTrack: null,
  device: "none",
  positionMs: 0,
  durationMs: null,
  sampleRate: null,
  bitDepth: null,
  channels: null,
};

/** No-op player used in tests and when MPD is unavailable. */
export const nullPlayer: PlayerPort = {
  getState: () => nullState,
  subscribe: () => () => {},
  play: unavailable,
  pause: unavailable,
  resume: unavailable,
  stop: unavailable,
  browse: unavailable,
  listTracks: unavailable,
  listDevices: unavailable,
};

export type MpdConfig = {
  host: string;
  port: number;
  musicDir: string;
  device: string;
};

/**
 * Open two MPD connections and return a PlayerPort.
 *
 * Two connections are required by the MPD protocol:
 *   - cmdClient   — request/response for all mutations
 *   - watchClient — dedicated to the idle loop (blocks between state changes)
 */
export const createMpdPlayer = (config: MpdConfig): ResultAsync<PlayerPort, PlayerError> => {
  const toPlayerError = (e: { message: string }): PlayerError => ({ message: e.message });

  return connectMpd(config.host, config.port)
    .mapErr(toPlayerError)
    .andThen((cmdClient) =>
      connectMpd(config.host, config.port)
        .mapErr(toPlayerError)
        .map((watchClient) => {
          const watcher = createStateWatcher(watchClient, config.musicDir, config.device);
          return makeMpdAdapter({
            cmdClient,
            watcher,
            musicDir: config.musicDir,
            device: config.device,
          });
        }),
    );
};
