import { match } from "@onrails/pattern";
import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { BrowseResult, PlayerState } from "../../types";
import type { AlsaDevice } from "./lib/utils";
import { apiFetch, isAudio, post, postJson } from "./lib/utils";
import { usePlaylist } from "./usePlaylist.js";

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

type PlayerProviderProps = {
  children: ReactNode;
};

export function PlayerProvider({ children }: PlayerProviderProps) {
  const [playerState, setPlayerState] = useState<PlayerState>(DEFAULT_STATE);
  const [browse, setBrowse] = useState<BrowseResult | null>(null);
  const [browseError, setBrowseError] = useState<string | null>(null);
  const [devices, setDevices] = useState<AlsaDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState(DEFAULT_STATE.device);
  const [filter, setFilter] = useState("");
  const libraryRootRef = useRef<string | null>(null);
  const selectedDeviceRef = useRef(selectedDevice);

  useEffect(() => {
    selectedDeviceRef.current = selectedDevice;
  }, [selectedDevice]);

  const onPlayTrack = useCallback(
    (path: string) =>
      postJson("/player/play", { path, device: selectedDeviceRef.current }),
    [],
  );

  const { playlist, playlistIdx, play, next, prev, enqueue, clear } = usePlaylist({
    playerStatus: playerState.status,
    onPlayTrack,
  });

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

  const handlePlay = useCallback(
    async (filePath: string) => {
      const tracks = browse?.entries
        .filter((entry) => isAudio(entry.type))
        .map((entry) => entry.path) ?? [filePath];
      const idx = tracks.indexOf(filePath);
      await play(tracks, Math.max(0, idx));
    },
    [browse, play],
  );

  const handlePlayAll = useCallback(
    async (dirPath: string) => {
      const data = await apiFetch<{ files: string[] }>(
        `/player/list?path=${encodeURIComponent(dirPath)}`,
      );
      if (data.ok) await play(data.files, 0);
    },
    [play],
  );

  const handleAddToQueue = useCallback(
    (filePath: string) => enqueue([filePath]),
    [enqueue],
  );

  const handleAddDirToQueue = useCallback(
    async (dirPath: string) => {
      const data = await apiFetch<{ files: string[] }>(
        `/player/list?path=${encodeURIComponent(dirPath)}`,
      );
      if (data.ok) enqueue(data.files);
    },
    [enqueue],
  );

  const handlePrev = useCallback(
    async () =>
      prev({
        positionMs: playerState.positionMs,
        currentTrack: playerState.currentTrack,
      }),
    [prev, playerState.positionMs, playerState.currentTrack],
  );

  const handleNext = useCallback(async () => next(), [next]);
  const handlePause = useCallback(async () => post("/player/pause"), []);
  const handleResume = useCallback(async () => post("/player/resume"), []);
  const handleStop = useCallback(async () => {
    await post("/player/stop");
    clear();
  }, [clear]);

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
