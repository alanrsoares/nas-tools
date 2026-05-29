import { match } from "@onrails/pattern";
import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { BrowseResult, PlayerState } from "../../types";
import type { AlsaDevice } from "./lib/utils";
import { apiFetch, isAudio, post, postJson } from "./lib/utils";

const BASE = window.location.origin;

const DEFAULT_STATE: PlayerState = {
  status: "idle",
  currentTrack: null,
  device: "hw:1,0",
  positionMs: 0,
  durationMs: null,
  sampleRate: null,
  bitDepth: null,
  channels: null,
};

type PlayerStoreState = {
  playerState: PlayerState;
  browse: BrowseResult | null;
  browseError: string | null;
  devices: AlsaDevice[];
  selectedDevice: string;
  playlist: string[];
  playlistIdx: number;
  filter: string;
  libraryRoot: string | null;
};

type PlayerStoreActions = {
  setSelectedDevice: (device: string) => void;
  setFilter: (filter: string) => void;
  navigateTo: (dirPath?: string) => Promise<void>;
  handlePlay: (filePath: string) => Promise<void>;
  handlePlayAll: (dirPath: string) => Promise<void>;
  handleAddToQueue: (filePath: string) => void;
  handleAddDirToQueue: (dirPath: string) => Promise<void>;
  handlePrev: () => Promise<void>;
  handleNext: () => Promise<void>;
  handlePause: () => Promise<void>;
  handleResume: () => Promise<void>;
  handleStop: () => Promise<void>;
};

type PlayerContextValue = readonly [PlayerStoreState, PlayerStoreActions];
type KeyboardActions = Pick<
  PlayerStoreActions,
  "handlePause" | "handleResume" | "handleStop" | "handleNext" | "handlePrev"
>;

const PlayerContext = createContext<PlayerContextValue | null>(null);

const isTypingTarget = (target: EventTarget | null) =>
  target instanceof HTMLInputElement ||
  target instanceof HTMLTextAreaElement ||
  target instanceof HTMLSelectElement;

const runSpaceShortcut = (status: PlayerState["status"], actions: KeyboardActions) =>
  match(status)
    .with("idle", () => {})
    .with("playing", actions.handlePause)
    .with("paused", actions.handleResume)
    .exhaustive();

const runKeyboardShortcut = (
  event: KeyboardEvent,
  status: PlayerState["status"],
  actions: KeyboardActions,
) => {
  if (isTypingTarget(event.target)) return;

  if (event.code === "Space") {
    event.preventDefault();
    runSpaceShortcut(status, actions);
    return;
  }
  if (event.code === "Escape") actions.handleStop();
  if (event.code === "ArrowRight" && !event.ctrlKey) {
    event.preventDefault();
    actions.handleNext();
  }
  if (event.code === "ArrowLeft" && !event.ctrlKey) {
    event.preventDefault();
    actions.handlePrev();
  }
};

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [playerState, setPlayerState] = useState<PlayerState>(DEFAULT_STATE);
  const [browse, setBrowse] = useState<BrowseResult | null>(null);
  const [browseError, setBrowseError] = useState<string | null>(null);
  const [devices, setDevices] = useState<AlsaDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState(DEFAULT_STATE.device);
  const [playlist, setPlaylist] = useState<string[]>([]);
  const [playlistIdx, setPlaylistIdx] = useState(-1);
  const [filter, setFilter] = useState("");
  const libraryRootRef = useRef<string | null>(null);

  const playlistRef = useRef(playlist);
  const playlistIdxRef = useRef(playlistIdx);
  const selectedDeviceRef = useRef(selectedDevice);
  const playerStatusRef = useRef<PlayerState["status"]>("idle");
  const autoAdvanceRef = useRef<() => void>(() => {});

  const navigateTo = useCallback(async (dirPath?: string) => {
    setBrowseError(null);
    setFilter("");
    const params = dirPath ? `?path=${encodeURIComponent(dirPath)}` : "";
    const data = await apiFetch<BrowseResult>(`/player/browse${params}`);
    if (data.ok) {
      setBrowse(data);
      if (!libraryRootRef.current && !dirPath) libraryRootRef.current = data.path;
      return;
    }
    setBrowseError(data.message);
  }, []);

  const playTracks = useCallback(async (tracks: string[], startIdx: number) => {
    const track = tracks[startIdx];
    if (!track) return;
    setPlaylist(tracks);
    setPlaylistIdx(startIdx);
    playlistRef.current = tracks;
    playlistIdxRef.current = startIdx;
    await postJson("/player/play", {
      path: track,
      device: selectedDeviceRef.current,
    });
  }, []);

  const handlePlay = useCallback(
    async (filePath: string) => {
      const tracks = browse?.entries
        .filter((entry) => isAudio(entry.type))
        .map((entry) => entry.path) ?? [filePath];
      const idx = tracks.indexOf(filePath);
      await playTracks(tracks, Math.max(0, idx));
    },
    [browse, playTracks],
  );

  const handlePlayAll = useCallback(
    async (dirPath: string) => {
      const data = await apiFetch<{ files: string[] }>(
        `/player/list?path=${encodeURIComponent(dirPath)}`,
      );
      if (data.ok) await playTracks(data.files, 0);
    },
    [playTracks],
  );

  const handleAddToQueue = useCallback((filePath: string) => {
    setPlaylist((prev) => [...prev, filePath]);
  }, []);

  const handleAddDirToQueue = useCallback(async (dirPath: string) => {
    const data = await apiFetch<{ files: string[] }>(
      `/player/list?path=${encodeURIComponent(dirPath)}`,
    );
    if (data.ok) setPlaylist((prev) => [...prev, ...data.files]);
  }, []);

  const handlePrev = useCallback(async () => {
    if (playerState.positionMs > 3000 || playlistIdx <= 0) {
      if (playerState.currentTrack) {
        await postJson("/player/play", {
          path: playerState.currentTrack,
          device: selectedDevice,
        });
      }
      return;
    }
    const idx = playlistIdx - 1;
    const track = playlist[idx];
    if (!track) return;
    setPlaylistIdx(idx);
    await postJson("/player/play", { path: track, device: selectedDevice });
  }, [playerState.currentTrack, playerState.positionMs, playlist, playlistIdx, selectedDevice]);

  const handleNext = useCallback(async () => {
    const idx = playlistIdxRef.current + 1;
    const track = playlistRef.current[idx];
    if (!track) return;
    setPlaylistIdx(idx);
    await postJson("/player/play", {
      path: track,
      device: selectedDeviceRef.current,
    });
  }, []);

  const handlePause = useCallback(async () => {
    await post("/player/pause");
  }, []);

  const handleResume = useCallback(async () => {
    await post("/player/resume");
  }, []);

  const handleStop = useCallback(async () => {
    await post("/player/stop");
    setPlaylist([]);
    setPlaylistIdx(-1);
  }, []);

  useEffect(() => {
    playlistRef.current = playlist;
  }, [playlist]);

  useEffect(() => {
    playlistIdxRef.current = playlistIdx;
  }, [playlistIdx]);

  useEffect(() => {
    selectedDeviceRef.current = selectedDevice;
  }, [selectedDevice]);

  useEffect(() => {
    const es = new EventSource(`${BASE}/api/player/status`);
    es.onmessage = (event) => {
      try {
        setPlayerState(JSON.parse(event.data));
      } catch {
        // Ignore malformed status frames.
      }
    };
    return () => es.close();
  }, []);

  useEffect(() => {
    if (playerState.device) setSelectedDevice(playerState.device);
  }, [playerState.device]);

  useEffect(() => {
    autoAdvanceRef.current = () => {
      const nextIdx = playlistIdxRef.current + 1;
      const track = playlistRef.current[nextIdx];
      if (track) {
        setPlaylistIdx(nextIdx);
        playlistIdxRef.current = nextIdx;
        postJson("/player/play", {
          path: track,
          device: selectedDeviceRef.current,
        });
        return;
      }
      setPlaylistIdx(-1);
    };
  }, []);

  useEffect(() => {
    const prev = playerStatusRef.current;
    playerStatusRef.current = playerState.status;
    if (prev === "playing" && playerState.status === "idle") autoAdvanceRef.current();
  }, [playerState.status]);

  useEffect(() => {
    navigateTo(undefined);
    apiFetch<{ devices: AlsaDevice[] }>("/player/devices").then((result) => {
      if (result.ok) setDevices(result.devices);
    });
  }, [navigateTo]);

  useEffect(() => {
    const actions = {
      handlePause,
      handleResume,
      handleStop,
      handleNext,
      handlePrev,
    };
    const onKey = (event: KeyboardEvent) => runKeyboardShortcut(event, playerState.status, actions);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playerState.status, handlePause, handleResume, handleStop, handleNext, handlePrev]);

  return (
    <PlayerContext.Provider
      value={
        [
          {
            playerState,
            browse,
            browseError,
            devices,
            selectedDevice,
            playlist,
            playlistIdx,
            filter,
            libraryRoot: libraryRootRef.current,
          },
          {
            setSelectedDevice,
            setFilter,
            navigateTo,
            handlePlay,
            handlePlayAll,
            handleAddToQueue,
            handleAddDirToQueue,
            handlePrev,
            handleNext,
            handlePause,
            handleResume,
            handleStop,
          },
        ] as const
      }
    >
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const context = useContext(PlayerContext);
  if (!context) throw new Error("usePlayer must be used within PlayerProvider");
  return context;
}
