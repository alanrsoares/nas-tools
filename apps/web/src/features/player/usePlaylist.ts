import { useCallback, useEffect, useReducer, useRef } from "react";
import type { PlayerState } from "../../types";
import { EMPTY_PLAYLIST, playlistReducer } from "./playlistReducer.js";

type UsePlaylistOptions = {
  playerStatus: PlayerState["status"];
  onPlayTrack: (path: string) => Promise<void>;
};

export function usePlaylist({ playerStatus, onPlayTrack }: UsePlaylistOptions) {
  const [{ list, idx }, dispatch] = useReducer(playlistReducer, EMPTY_PLAYLIST);

  // Stable refs so callbacks below never go stale
  const listRef = useRef(list);
  const idxRef = useRef(idx);
  const onPlayRef = useRef(onPlayTrack);
  const statusRef = useRef(playerStatus);

  useEffect(() => {
    listRef.current = list;
  }, [list]);
  useEffect(() => {
    idxRef.current = idx;
  }, [idx]);
  useEffect(() => {
    onPlayRef.current = onPlayTrack;
  }, [onPlayTrack]);

  const play = useCallback(async (tracks: string[], startIdx: number) => {
    const track = tracks[startIdx];
    if (!track) return;
    dispatch({ type: "play", tracks, startIdx });
    listRef.current = tracks;
    idxRef.current = startIdx;
    await onPlayRef.current(track);
  }, []);

  const next = useCallback(async () => {
    const nextIdx = idxRef.current + 1;
    const track = listRef.current[nextIdx];
    if (!track) return;
    dispatch({ type: "next" });
    await onPlayRef.current(track);
  }, []);

  const prev = useCallback(async (opts: { positionMs: number; currentTrack: string | null }) => {
    const { positionMs, currentTrack } = opts;
    if (positionMs > 3000 || idxRef.current <= 0) {
      if (currentTrack) await onPlayRef.current(currentTrack);
      return;
    }
    const prevIdx = idxRef.current - 1;
    const track = listRef.current[prevIdx];
    if (!track) return;
    dispatch({ type: "prev", positionMs });
    await onPlayRef.current(track);
  }, []);

  const enqueue = useCallback((tracks: string[]) => {
    dispatch({ type: "enqueue", tracks });
  }, []);

  const clear = useCallback(() => {
    dispatch({ type: "clear" });
  }, []);

  // Auto-advance when playback ends
  useEffect(() => {
    const prev = statusRef.current;
    statusRef.current = playerStatus;
    if (prev !== "playing" || playerStatus !== "idle") return;

    const nextIdx = idxRef.current + 1;
    const track = listRef.current[nextIdx];
    dispatch({ type: "advance" });
    if (track) {
      idxRef.current = nextIdx;
      onPlayRef.current(track);
    }
  }, [playerStatus]);

  return { playlist: list, playlistIdx: idx, play, next, prev, enqueue, clear };
}
