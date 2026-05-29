import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { Result } from "@onrails/result";
import { err, ok, ResultAsync } from "@onrails/result";
import { env } from "./env.js";
import { playerLogger as log } from "./logger.js";

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

const AUDIO_EXT: Record<string, AudioFileType> = {
  ".flac": "flac",
  ".dsf": "dsd",
  ".dff": "dsd",
  ".m4a": "alac",
  ".alac": "alac",
};

const audioType = (name: string): AudioFileType | null =>
  AUDIO_EXT[path.extname(name).toLowerCase()] ?? null;
export type AlsaDevice = { id: string; name: string };
export type PlayerError = { message: string };

// /proc/asound/cards format: " 1 [Warmer         ]: USB-Audio - FiiO Warmer"
const PROC_CARD_RE = /^\s*(\d+)\s+\[([^\]]+)\]/;

export const parseAlsaDevices = (raw: string): AlsaDevice[] =>
  raw.split("\n").flatMap((line) => {
    const m = line.match(PROC_CARD_RE);
    if (!m) return [];
    return [{ id: `hw:${m[1]},0`, name: m[2]?.trim() ?? `Card ${m[1]}` }];
  });

type StateListener = (state: PlayerState) => void;

// FiiO Warmer (full-speed USB) tops out at 96 kHz / 24-bit
const MAX_SAMPLE_RATE = 96000;

const buildFfmpegCmd = (filePath: string, device: string): string[] => {
  const ext = path.extname(filePath).toLowerCase();
  const isDsd = ext === ".dsf" || ext === ".dff";
  // DSD decodes to 705600+ Hz; cap at device max. Same cap for hi-res PCM above 96 kHz.
  const resample = isDsd ? ["-ar", String(MAX_SAMPLE_RATE)] : [];
  return ["ffmpeg", "-hide_banner", "-i", filePath, ...resample, "-f", "alsa", device];
};

const isVisible = (name: string) =>
  !name.startsWith(".") && !name.startsWith("#") && !name.startsWith("_");

async function collectAudio(dir: string, results: string[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  const sorted = entries
    .filter((e) => isVisible(e.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const e of sorted) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) await collectAudio(p, results);
    else if (e.isFile() && audioType(e.name)) results.push(p);
  }
}

const toPlayerError = (e: unknown): PlayerError => ({
  message: e instanceof Error ? e.message : String(e),
});

const wrap = <T>(fn: () => Promise<T>): ResultAsync<T, PlayerError> =>
  ResultAsync.fromPromise(fn(), toPlayerError);

const idle = (): PlayerState => ({
  status: "idle",
  currentTrack: null,
  device: env.ALSA_DEVICE,
  positionMs: 0,
  durationMs: null,
  sampleRate: null,
  bitDepth: null,
  channels: null,
});

const parseAudioInfo = (
  line: string,
): Partial<Pick<PlayerState, "sampleRate" | "bitDepth" | "channels">> => {
  const m = line.match(/Audio:[^,]+,\s*(\d+)\s*Hz,\s*(\S+),\s*(\S+)/);
  if (!m) return {};
  const sampleRate = Number(m[1]);
  const ch = m[2];
  const fmt = m[3];
  const channels = ch === "stereo" ? 2 : ch === "mono" ? 1 : null;
  const bits: Record<string, number> = {
    s16: 16,
    s24: 24,
    s32: 32,
    u8: 8,
    s16le: 16,
    s24le: 24,
    s32le: 32,
    fltp: 32,
    flt: 32,
  };
  return { sampleRate, bitDepth: bits[fmt ?? ""] ?? null, channels };
};

const parseDuration = (line: string): number | null => {
  const m = line.match(/Duration:\s*(\d+):(\d+):(\d+)\.(\d+)/);
  if (!m) return null;
  return (Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])) * 1000 + Number(m[4]) * 10;
};

class PlayerService {
  private state: PlayerState = idle();
  private proc: ReturnType<typeof Bun.spawn> | null = null;
  private playStartMs = 0;
  private pauseStartMs = 0;
  private totalPausedMs = 0;
  private listeners = new Set<StateListener>();

  getState = (): PlayerState => ({
    ...this.state,
    positionMs: this.position(),
  });

  subscribe = (fn: StateListener): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  private notify = () => {
    for (const fn of this.listeners) fn(this.getState());
  };

  private position = (): number => {
    if (this.state.status === "idle") return 0;
    if (this.state.status === "paused")
      return this.pauseStartMs - this.playStartMs - this.totalPausedMs;
    return Date.now() - this.playStartMs - this.totalPausedMs;
  };

  play = (filePath: string, device?: string): ResultAsync<void, PlayerError> =>
    this.stop().andThen(() =>
      wrap(async () => {
        const resolvedDevice = device ?? env.ALSA_DEVICE;
        const cmd = buildFfmpegCmd(filePath, resolvedDevice);
        log.info({ cmd, device: resolvedDevice }, "play");
        this.proc = Bun.spawn(cmd, { stderr: "pipe" });
        this.state = {
          ...idle(),
          status: "playing",
          currentTrack: filePath,
          device: resolvedDevice,
        };
        this.playStartMs = Date.now();
        this.totalPausedMs = 0;
        this.notify();
        this.drainStderr(this.proc);
        this.proc.exited.then((exitCode) => {
          log.info({ exitCode, track: filePath }, "ffmpeg exited");
          if (this.state.status !== "idle") {
            this.state = idle();
            this.proc = null;
            this.notify();
          }
        });
      }),
    );

  pause = (): Result<void, PlayerError> => {
    if (!this.proc || this.state.status !== "playing") return err({ message: "not playing" });
    log.info({ track: this.state.currentTrack }, "pause");
    process.kill(this.proc.pid, "SIGSTOP");
    this.pauseStartMs = Date.now();
    this.state = { ...this.state, status: "paused" };
    this.notify();
    return ok(undefined);
  };

  resume = (): Result<void, PlayerError> => {
    if (!this.proc || this.state.status !== "paused") return err({ message: "not paused" });
    log.info({ track: this.state.currentTrack }, "resume");
    this.totalPausedMs += Date.now() - this.pauseStartMs;
    process.kill(this.proc.pid, "SIGCONT");
    this.state = { ...this.state, status: "playing" };
    this.notify();
    return ok(undefined);
  };

  stop = (): ResultAsync<void, PlayerError> => {
    if (!this.proc) return ResultAsync.ok(undefined);
    log.info({ track: this.state.currentTrack }, "stop");
    const proc = this.proc;
    this.proc = null;
    return wrap(async () => {
      if (this.state.status === "paused") process.kill(proc.pid, "SIGCONT");
      proc.kill("SIGTERM");
      await proc.exited;
      this.state = idle();
      this.notify();
    });
  };

  browse = (dirPath?: string): ResultAsync<BrowseResult, PlayerError> =>
    wrap(async () => {
      const resolved = path.resolve(dirPath ?? env.MUSIC_LIBRARY_PATH);
      const libraryRoot = path.resolve(env.MUSIC_LIBRARY_PATH);
      if (!resolved.startsWith(libraryRoot))
        throw new Error(`Path outside music library: ${resolved}`);

      const raw = await readdir(resolved, { withFileTypes: true });
      const entries: BrowseEntry[] = raw
        .filter((e) => isVisible(e.name))
        .reduce<BrowseEntry[]>((acc, e) => {
          const p = path.join(resolved, e.name);
          if (e.isDirectory()) acc.push({ name: e.name, path: p, type: "dir" });
          else {
            const t = audioType(e.name);
            if (e.isFile() && t) acc.push({ name: e.name, path: p, type: t });
          }
          return acc;
        }, [])
        .sort((a, b) =>
          a.type !== b.type ? (a.type === "dir" ? -1 : 1) : a.name.localeCompare(b.name),
        );

      return { path: resolved, entries };
    });

  listFlacs = (dirPath: string): ResultAsync<string[], PlayerError> =>
    wrap(async () => {
      const resolved = path.resolve(dirPath);
      const libraryRoot = path.resolve(env.MUSIC_LIBRARY_PATH);
      if (!resolved.startsWith(libraryRoot))
        throw new Error(`Path outside music library: ${resolved}`);
      const results: string[] = [];
      await collectAudio(resolved, results);
      return results;
    });

  listAlsaDevices = (): ResultAsync<AlsaDevice[], PlayerError> =>
    wrap(async () => {
      const raw = await readFile("/proc/asound/cards", "utf8");
      return parseAlsaDevices(raw);
    });

  private logFfmpegLine = (line: string): void => {
    if (line.includes("Error") || line.includes("error") || line.includes("failed")) {
      log.error({ line }, "ffmpeg");
      return;
    }
    log.trace({ line }, "ffmpeg");
  };

  private applyDurationFromLine = (line: string): void => {
    const durationMs = parseDuration(line);
    if (durationMs === null || this.state.durationMs) return;
    this.state = { ...this.state, durationMs };
    this.notify();
  };

  private applyAudioInfoFromLine = (line: string): void => {
    const info = parseAudioInfo(line);
    if (!info.sampleRate && !info.bitDepth && !info.channels) return;
    this.state = { ...this.state, ...info };
    this.notify();
  };

  private handleFfmpegLine = (line: string): void => {
    this.logFfmpegLine(line);
    this.applyDurationFromLine(line);
    this.applyAudioInfoFromLine(line);
  };

  private drainStderr = async (proc: ReturnType<typeof Bun.spawn>): Promise<void> => {
    const stderr = proc.stderr;
    if (!stderr || typeof stderr === "number") return;
    const reader = (stderr as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder();
    let buf = "";
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        lines.forEach(this.handleFfmpegLine);
      }
    } catch {
      /* proc killed */
    }
  };
}

export const player = new PlayerService();
