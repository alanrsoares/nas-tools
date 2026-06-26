import { readdir } from "node:fs/promises";
import path from "node:path";
import { getOrElse, type Maybe, map as mapMaybe, none, some } from "@onrails/maybe";
import { ResultAsync } from "@onrails/result";
import { parseFile } from "music-metadata";

import { isUnknown } from "./artist.js";
import { parseReleaseFolderName, stripReleaseTags } from "./release-naming.js";
import { type CoreError, toCoreError } from "./errors.js";
import { alphabeticalRanges, isLibraryRootName } from "./library-layout.js";
import { isMusicFile } from "./media-files.js";
import type { WalkEntry } from "./walk.js";

export interface ReleaseInfo {
  id: string;
  artist: string;
  album: string;
  fingerprint?: string;
  trackCount: number;
}

export interface AlbumFolder {
  path: string;
  trackCount: number;
  totalSize: number;
  sampleRate: number;
  bitsPerSample: number;
  bitrate: number;
  release: ReleaseInfo;
}

export function normalize(str: string): string {
  return str
    .toLowerCase()
    .replace(/^the\s+/i, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

export function scoreAlbum(album: AlbumFolder): number {
  return (
    album.trackCount * 100000000 +
    album.bitsPerSample * 1000000 +
    (album.sampleRate / 100) * 10 +
    album.bitrate / 1000000
  );
}

async function parseAlbumTracks(folderPath: string, musicFiles: string[]) {
  const metadatas: Awaited<ReturnType<typeof parseFile>>[] = [];
  for (const filePath of musicFiles) {
    try {
      metadatas.push(await parseFile(filePath));
    } catch {
      // Skip individual failed tracks
    }
  }
  if (metadatas.length === 0 || !metadatas[0]) {
    throw new Error(`Failed to parse any metadata in: ${folderPath}`);
  }
  return { metadatas, first: metadatas[0] };
}

async function collectMusicFilePaths(folderPath: string): Promise<string[]> {
  const entries = await readdir(folderPath, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(folderPath, entry.name);
      if (entry.isDirectory()) return collectMusicFilePaths(entryPath);
      if (entry.isFile() && isMusicFile(entry.name)) return [entryPath];
      return [] as string[];
    }),
  );

  return nested.flat().sort();
}

async function resolveAlbumFolder(folderPath: string): Promise<Maybe<AlbumFolder>> {
  const musicFiles = await collectMusicFilePaths(folderPath);
  if (musicFiles.length === 0) return none<AlbumFolder>();
  const { metadatas, first } = await parseAlbumTracks(folderPath, musicFiles);
  const lazyInfo = getAlbumInfoLazy(folderPath, musicFiles.length, 0);
  const durationFingerprint = metadatas.map((m) => Math.round(m.format.duration || 0)).join(",");
  return some({
    path: folderPath,
    trackCount: musicFiles.length,
    totalSize: 0,
    sampleRate: Math.max(...metadatas.map((m) => m.format.sampleRate || 0)),
    bitsPerSample: Math.max(...metadatas.map((m) => m.format.bitsPerSample || 0)),
    bitrate: Math.max(...metadatas.map((m) => m.format.bitrate || 0)),
    release: {
      id: first.common.musicbrainz_albumid || lazyInfo.release.id,
      artist: (first.common.albumartist || first.common.artist)?.trim() || lazyInfo.release.artist,
      album: first.common.album?.trim() || lazyInfo.release.album,
      fingerprint: `${musicFiles.length}t-${durationFingerprint}`,
      trackCount: musicFiles.length,
    },
  });
}

export function getAlbumInfo(folderPath: string): ResultAsync<Maybe<AlbumFolder>, CoreError> {
  return ResultAsync.fromPromise(resolveAlbumFolder(folderPath), (cause) =>
    toCoreError(`Failed to parse metadata in: ${folderPath}`, cause),
  );
}

export function getAlbumInfoLazy(
  folderPath: string,
  musicFilesCount: number,
  totalSize: number,
): AlbumFolder {
  const folderName = path.basename(folderPath);
  const parentDir = path.dirname(folderPath);
  const parentName = path.basename(parentDir);
  const grandparentName = path.basename(path.dirname(parentDir));

  const isRange = alphabeticalRanges.some((r) => r.name === parentName);
  const isDisc = /^(?:disc|cd|vol|volume|part|side|record|lp)\.?\s*\d+$/i.test(folderName);
  const parsedFolder = parseReleaseFolderName(folderName);

  let artist = getOrElse(
    mapMaybe(parsedFolder, (release) => release.artist),
    undefined,
  );
  if (isDisc && grandparentName && !isLibraryRootName(grandparentName)) {
    artist = grandparentName;
  } else if (!artist && !isRange && parentName && !isLibraryRootName(parentName)) {
    artist = parentName;
  }

  let album = isDisc
    ? `${parentName} (${folderName})`
    : getOrElse(
        mapMaybe(parsedFolder, (release) => release.album),
        folderName,
      );

  artist = artist?.trim() || "Unknown Artist";
  album = album?.trim() || "Unknown Album";

  let discNo = "";
  const parts = folderPath.split(path.sep).reverse();
  for (const part of parts) {
    const m = part.match(/(?:disc|cd|vol|volume|part|side|record|lp)\.?\s*(\d+)/i);
    if (m?.[1]) {
      discNo = m[1];
      break;
    }
  }

  return {
    path: folderPath,
    trackCount: musicFilesCount,
    totalSize,
    sampleRate: 0,
    bitsPerSample: 0,
    bitrate: 0,
    release: {
      id: `${normalize(artist)}-${normalize(stripReleaseTags(album))}${discNo ? `-d${discNo}` : ""}`,
      artist,
      album,
      trackCount: musicFilesCount,
    },
  };
}

export function identifyAlbumCandidates(entries: WalkEntry[], root?: string): AlbumFolder[] {
  const folderStats = new Map<string, { count: number; size: number }>();
  for (const entry of entries) {
    if (!entry.isDirectory && isMusicFile(entry.name)) {
      const dir = root ? inferAlbumRoot(entry.path, root) : path.dirname(entry.path);
      const stats = folderStats.get(dir) || { count: 0, size: 0 };
      stats.count++;
      stats.size += entry.size;
      folderStats.set(dir, stats);
    }
  }

  const candidates: AlbumFolder[] = [];
  for (const [folderPath, stats] of folderStats.entries()) {
    if (folderPath.includes("_duplicates")) continue;
    candidates.push(getAlbumInfoLazy(folderPath, stats.count, stats.size));
  }

  return candidates;
}

function inferAlbumRoot(filePath: string, root: string): string {
  const fileDir = path.dirname(filePath);
  const relativeDir = path.relative(root, fileDir);
  if (relativeDir.startsWith("..") || path.isAbsolute(relativeDir)) return fileDir;

  const parts = relativeDir.split(path.sep).filter(Boolean);
  if (parts.length === 0) return fileDir;

  const hasRange = alphabeticalRanges.some((range) => range.name === parts[0]);
  if (hasRange) {
    if (parts.length >= 3) return path.join(root, parts[0] ?? "", parts[1] ?? "", parts[2] ?? "");
    return fileDir;
  }

  if (parts.length >= 2) return path.join(root, parts[0] ?? "", parts[1] ?? "");
  return fileDir;
}

export function findDuplicates(albums: AlbumFolder[]): Map<string, AlbumFolder[]> {
  const groups = new Map<string, AlbumFolder[]>();
  for (const album of albums) {
    if (isUnknown(album.release.artist) && isUnknown(album.release.album)) {
      continue;
    }

    const groupId = album.release.fingerprint
      ? `${normalize(album.release.artist)}::${album.release.fingerprint}`
      : `${album.release.id}::${album.trackCount}t`;

    const group = groups.get(groupId) || [];
    group.push(album);
    groups.set(groupId, group);
  }

  for (const [id, group] of groups.entries()) {
    if (group.length <= 1) {
      groups.delete(id);
    }
  }

  return groups;
}

export function identifyDedupeMoves(
  groups: Map<string, AlbumFolder[]>,
  root: string,
  trashRoot: string,
): { from: string; to: string; reason: string }[] {
  const toMove: { from: string; to: string; reason: string }[] = [];

  for (const group of groups.values()) {
    group.sort((a, b) => scoreAlbum(b) - scoreAlbum(a));

    const winner = group[0];
    if (!winner) continue;

    const losers = group.slice(1);

    for (const loser of losers) {
      const reason = `${loser.bitsPerSample}bit/${loser.sampleRate}Hz vs ${winner.bitsPerSample}bit/${winner.sampleRate}Hz`;
      const relativePath = path.relative(root, loser.path);
      toMove.push({
        from: loser.path,
        to: path.join(trashRoot, relativePath),
        reason,
      });
    }
  }

  return toMove;
}
