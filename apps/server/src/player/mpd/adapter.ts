/**
 * MPD adapter — implements PlayerPort by composing an MpdClient with a StateWatcher.
 *
 * This is a pure function: given the two connections + config, returns a PlayerPort.
 * No classes, no global state. The adapter is testable by injecting a mock MpdClient.
 */
import { readFile } from "node:fs/promises";
import { ResultAsync } from "@onrails/result";
import type { BrowseResult, PlayerError, PlayerPort } from "../port.js";
import type { MpdClient } from "./client.js";
import { parseAlsaDevices, parseListall, parseLsinfo } from "./parse.js";
import type { StateWatcher } from "./watcher.js";

export type MpdAdapterDeps = {
  /** Command connection — all mutations: play, pause, stop, add, clear. */
  cmdClient: MpdClient;
  /** Watch connection — idle loop only (see watcher.ts). */
  watcher: StateWatcher;
  musicDir: string;
  device: string;
};

/** Convert absolute path to MPD-relative path. */
const toMpdPath = (absPath: string, musicDir: string): string => {
  const root = musicDir.endsWith("/") ? musicDir : `${musicDir}/`;
  return absPath.startsWith(root) ? absPath.slice(root.length) : absPath;
};

const toPlayerError = (e: unknown): PlayerError => ({
  message: e instanceof Error ? e.message : ((e as { message?: string }).message ?? String(e)),
});

export const makeMpdAdapter = ({ cmdClient, watcher, musicDir }: MpdAdapterDeps): PlayerPort => ({
  getState: watcher.getState,
  subscribe: watcher.subscribe,

  play: (filePath, _device) => {
    const relPath = toMpdPath(filePath, musicDir);
    return cmdClient
      .cmd("clear")
      .andThen(() => cmdClient.cmd(`add ${relPath}`))
      .andThen(() => cmdClient.cmd("play 0"))
      .map(() => undefined)
      .mapErr(toPlayerError);
  },

  pause: () =>
    cmdClient
      .cmd("pause 1")
      .map(() => undefined)
      .mapErr(toPlayerError),

  resume: () =>
    cmdClient
      .cmd("pause 0")
      .map(() => undefined)
      .mapErr(toPlayerError),

  stop: () =>
    cmdClient
      .cmd("stop")
      .andThen(() => cmdClient.cmd("clear"))
      .map(() => undefined)
      .mapErr(toPlayerError),

  browse: (dirPath) => {
    const relPath = dirPath ? toMpdPath(dirPath, musicDir) : "";
    const mpdCmd = relPath ? `lsinfo ${relPath}` : "lsinfo";
    const resolvedAbs = dirPath ?? musicDir;
    return cmdClient
      .cmd(mpdCmd)
      .map(
        (lines): BrowseResult => ({
          path: resolvedAbs,
          entries: parseLsinfo(lines, musicDir),
        }),
      )
      .mapErr(toPlayerError);
  },

  listTracks: (dirPath) => {
    const relPath = toMpdPath(dirPath, musicDir);
    return cmdClient
      .cmd(`listall ${relPath}`)
      .map((lines) => parseListall(lines, musicDir))
      .mapErr(toPlayerError);
  },

  listDevices: () =>
    ResultAsync.fromPromise(
      readFile("/proc/asound/cards", "utf8").then(parseAlsaDevices),
      toPlayerError,
    ),
});
