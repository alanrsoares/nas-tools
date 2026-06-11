/**
 * Pure parsers for MPD protocol responses. No I/O, no state — fully testable.
 *
 * MPD uses a line-based key-value protocol. Each response is a sequence of
 * "key: value" lines terminated by "OK" (or "ACK …" on error).
 */
import path from "node:path";
import type { AlsaDevice, AudioFileType, BrowseEntry, PlayerState } from "../port.js";

// ── Key-value parser ─────────────────────────────────────────────────────────

export const parseMpdKv = (lines: string[]): Map<string, string> => {
  const map = new Map<string, string>();
  for (const line of lines) {
    const idx = line.indexOf(": ");
    if (idx !== -1) map.set(line.slice(0, idx), line.slice(idx + 2));
  }
  return map;
};

// ── Status ───────────────────────────────────────────────────────────────────

export type MpdStatus = {
  state: "play" | "pause" | "stop";
  elapsed: number | null;
  duration: number | null;
  audio: string | null; // "samplerate:bits:channels", e.g. "96000:24:2"
};

export const parseMpdStatus = (lines: string[]): MpdStatus => {
  const kv = parseMpdKv(lines);
  const raw = kv.get("state") ?? "stop";
  return {
    state: raw === "play" || raw === "pause" ? raw : "stop",
    elapsed: kv.has("elapsed") ? Number(kv.get("elapsed")) : null,
    duration: kv.has("duration") ? Number(kv.get("duration")) : null,
    audio: kv.get("audio") ?? null,
  };
};

// ── Current song ─────────────────────────────────────────────────────────────

export type MpdSong = { file: string };

export const parseMpdSong = (lines: string[]): MpdSong | null => {
  const file = parseMpdKv(lines).get("file");
  return file ? { file } : null;
};

// ── PlayerState composition ──────────────────────────────────────────────────

const parseAudio = (audio: string): Pick<PlayerState, "sampleRate" | "bitDepth" | "channels"> => {
  const [sr, bd, ch] = audio.split(":");
  return {
    sampleRate: sr ? Number(sr) : null,
    bitDepth: bd ? Number(bd) : null,
    channels: ch ? Number(ch) : null,
  };
};

export const toPlayerState = (
  status: MpdStatus,
  song: MpdSong | null,
  musicDir: string,
  device: string,
): PlayerState => ({
  status: status.state === "play" ? "playing" : status.state === "pause" ? "paused" : "idle",
  currentTrack: song ? path.join(musicDir, song.file) : null,
  device,
  positionMs: Math.round((status.elapsed ?? 0) * 1000),
  durationMs: status.duration != null ? Math.round(status.duration * 1000) : null,
  ...(status.audio
    ? parseAudio(status.audio)
    : { sampleRate: null, bitDepth: null, channels: null }),
});

// ── Browse ───────────────────────────────────────────────────────────────────

const AUDIO_EXT: Record<string, AudioFileType> = {
  ".flac": "flac",
  ".dsf": "dsd",
  ".dff": "dsd",
  ".m4a": "alac",
  ".alac": "alac",
};

const audioType = (name: string): AudioFileType | null =>
  AUDIO_EXT[path.extname(name).toLowerCase()] ?? null;

/** Parse MPD `lsinfo [path]` response into BrowseEntry[]. One level deep. */
export const parseLsinfo = (lines: string[], musicDir: string): BrowseEntry[] => {
  const entries: BrowseEntry[] = [];
  for (const line of lines) {
    if (line.startsWith("directory: ")) {
      const abs = path.join(musicDir, line.slice("directory: ".length));
      entries.push({ name: path.basename(abs), path: abs, type: "dir" });
    } else if (line.startsWith("file: ")) {
      const abs = path.join(musicDir, line.slice("file: ".length));
      const t = audioType(path.basename(abs));
      if (t) entries.push({ name: path.basename(abs), path: abs, type: t });
    }
  }
  return entries.sort((a, b) =>
    a.type !== b.type ? (a.type === "dir" ? -1 : 1) : a.name.localeCompare(b.name),
  );
};

/** Parse MPD `listall [path]` response into absolute file paths. */
export const parseListall = (lines: string[], musicDir: string): string[] =>
  lines
    .filter((line) => line.startsWith("file: "))
    .map((line) => path.join(musicDir, line.slice("file: ".length)))
    .filter((p) => audioType(path.basename(p)) !== null);

// ── ALSA cards ───────────────────────────────────────────────────────────────

// /proc/asound/cards format: " 1 [Warmer         ]: USB-Audio - FiiO Warmer"
const PROC_CARD_RE = /^\s*(\d+)\s+\[([^\]]+)\]/;

export const parseAlsaDevices = (raw: string): AlsaDevice[] =>
  raw.split("\n").flatMap((line) => {
    const m = line.match(PROC_CARD_RE);
    if (!m) return [];
    return [{ id: `hw:${m[1]},0`, name: m[2]?.trim() ?? `Card ${m[1]}` }];
  });
