/**
 * StateWatcher — drives MPD's idle protocol on a dedicated connection.
 *
 * One connection is reserved exclusively for:
 *   idle player  →  state changed  →  status + currentsong  →  idle player  →  …
 *
 * All mutations (play/pause/stop/…) go through a separate command connection
 * in the adapter. MPD fires a player event for each mutation, so the watcher
 * always sees the result.
 */
import { isErr } from "@onrails/result";
import type { MpdClient } from "./client.js";
import { parseMpdSong, parseMpdStatus, toPlayerState } from "./parse.js";
import type { PlayerState, StateListener } from "../port.js";

export type StateWatcher = {
  getState: () => PlayerState;
  subscribe: (fn: StateListener) => () => void;
  close: () => void;
};

const idleState = (device: string): PlayerState => ({
  status: "idle",
  currentTrack: null,
  device,
  positionMs: 0,
  durationMs: null,
  sampleRate: null,
  bitDepth: null,
  channels: null,
});

/** Fetch current MPD state on the watch connection (called after idle returns). */
const fetchState = (
  client: MpdClient,
  musicDir: string,
  device: string,
): Promise<PlayerState | null> =>
  client
    .cmd("status")
    .andThen((statusLines) =>
      client.cmd("currentsong").map((songLines) =>
        toPlayerState(parseMpdStatus(statusLines), parseMpdSong(songLines), musicDir, device),
      ),
    )
    .match(
      (s) => s,
      () => null,
    );

export const createStateWatcher = (
  /** Dedicated connection — only used for idle + status queries, never for mutations. */
  client: MpdClient,
  musicDir: string,
  device: string,
): StateWatcher => {
  let state: PlayerState = idleState(device);
  const listeners = new Set<StateListener>();

  const notify = () => {
    for (const fn of listeners) fn(state);
  };

  const runIdleLoop = async () => {
    const initial = await fetchState(client, musicDir, device);
    if (initial) {
      state = initial;
      notify();
    }

    for (;;) {
      const changed = await client.cmd("idle player");
      if (isErr(changed)) break; // connection dropped — loop ends
      const next = await fetchState(client, musicDir, device);
      if (next) {
        state = next;
        notify();
      }
    }
  };

  runIdleLoop().catch(() => { /* connection dropped; caller handles reconnect */ });

  return {
    getState: () => state,
    subscribe: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    close: () => client.close(),
  };
};
