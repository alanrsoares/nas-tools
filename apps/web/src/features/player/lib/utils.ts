import type { AudioFileType, BrowseEntry } from "../../../types";

// ── Types ─────────────────────────────────────────────────────────────────────

export type AlsaDevice = { id: string; name: string };
export type ApiOk<T> = { ok: true } & T;
export type ApiErr = { ok: false; message: string };
export type ApiResult<T> = ApiOk<T> | ApiErr;
export type TrackInfo = {
  artist: string | null;
  album: string | null;
  title: string;
};

// ── API ───────────────────────────────────────────────────────────────────────

const BASE = window.location.origin;

export async function apiFetch<T>(p: string, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`${BASE}/api${p}`, init);
    if (!res.ok && res.headers.get("content-type")?.includes("text/html")) {
      return { ok: false, message: `HTTP ${res.status}` };
    }
    return res.json() as Promise<ApiResult<T>>;
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Network request failed",
    };
  }
}

export const post = (p: string) => apiFetch(p, { method: "POST" });
export const postJson = (p: string, body: unknown) =>
  apiFetch(p, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

export const BASE_URL = BASE;

// ── Helpers ───────────────────────────────────────────────────────────────────

export const formatMs = (ms: number): string => {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const p = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${p(m % 60)}:${p(s % 60)}` : `${p(m)}:${p(s % 60)}`;
};

export const parseTrackInfo = (filePath: string, libraryRoot: string): TrackInfo => {
  const root = libraryRoot.endsWith("/") ? libraryRoot : `${libraryRoot}/`;
  const rel = filePath.startsWith(root) ? filePath.slice(root.length) : filePath;
  const parts = rel.split("/").filter(Boolean);
  const n = parts.length;
  const filename = parts[n - 1] ?? "";
  const title = filename
    .replace(/\.[^.]+$/, "")
    .replace(/^\d+[\s._-]+/, "")
    .trim();
  const album = n >= 2 ? (parts[n - 2] ?? null) : null;
  const artist = n >= 3 ? (parts[n - 3] ?? null) : null;
  return { artist, album, title };
};

export const isAudio = (type: BrowseEntry["type"]): type is AudioFileType =>
  type === "flac" || type === "alac" || type === "dsd";
