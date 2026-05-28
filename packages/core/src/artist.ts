import path from "node:path";
import { compactMap, isSome, type Maybe, map as mapMaybe, none, some } from "@onrails/maybe";
import { ok, ResultAsync } from "@onrails/result";
import { flow } from "@onrails/result/pipe";
import { parseFile } from "music-metadata";

import { type CoreError, type MovePlanError, toCoreError } from "./errors.js";
import type { StagedMediaItem } from "./schemas.js";

const sanitizeArtistName = flow(
  (artistName: string) =>
    artistName
      // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional control char range sanitization
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .replace(/[\\/]+/g, " ")
      .replace(/[:*?"<>|]+/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/[. ]+$/g, ""),
  (sanitized: string) => (sanitized ? some(sanitized) : none<string>()),
);

export function stripReleaseTags(name: string): string {
  return name
    .replace(
      /\s*[[({][^\])}]*?(?:flac|mp3|m4a|24bit|16[./-]?44|vinyl|web|cd|discography|pmedia|h33t|japan|eu|uk|remaster|edition|anniversary|deluxe|boxset|hi-res|highres|24-96|24-192|24bit-96khz|24bit-192khz)[^\])}]*?[\])}]/gi,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();
}

export function parseReleaseFolderName(
  folderName: string,
): Maybe<{ artist: string; album: string }> {
  const cleaned = stripReleaseTags(folderName);
  const patterns = [
    /^(.+?)\s+-\s+\d{4}\s+-\s+(.+)$/i,
    /^(.+?)\s+-\s+(.+)$/i,
    /^(.+?)\s+_\s+(.+)$/i,
  ];

  for (const pattern of patterns) {
    const matched = cleaned.match(pattern);
    const artist = matched?.[1]?.trim();
    const album = matched?.[2]?.trim();
    if (!artist || !album || /^\d{4}$/.test(artist)) continue;

    return mapMaybe(sanitizeArtistName(artist), (sanitizedArtist) => ({
      artist: sanitizedArtist,
      album,
    }));
  }

  return none();
}

export function inferArtistNameFromFolder(folderName: string): Maybe<string> {
  const cleaned = stripReleaseTags(folderName);

  if (
    /^\d{4}\s*-\s*/.test(cleaned) ||
    /^(?:disc|cd|vol|volume|part|side|record|lp)\.?\s*\d+$/i.test(cleaned)
  ) {
    return none();
  }

  const patterns = [
    /^(.+?)\s+-\s+\d{4}\s+-\s+.+$/i,
    /^(.+?)\s+-\s+.+$/i,
    /^(.+?)\s+_\s+.+$/i,
    /^(.+?)\s+\/\s+.+$/i,
  ];

  for (const pattern of patterns) {
    const matched = cleaned.match(pattern);
    const artist = matched?.[1];
    if (artist && !/^\d{4}$/.test(artist.trim())) return sanitizeArtistName(artist);
  }

  return sanitizeArtistName(cleaned);
}

export function isUnknown(str?: string): boolean {
  if (!str) return true;
  const n = str.toLowerCase();
  return n === "unknown artist" || n === "unknown album" || n === "unknown" || n === "";
}

const artistFromMetadata = flow((metadata: Awaited<ReturnType<typeof parseFile>>) => {
  const artist = metadata.common.artist?.trim();
  return artist ? sanitizeArtistName(artist) : none<string>();
});

const firstInferredArtist = flow((metadatas: Awaited<ReturnType<typeof parseFile>>[]) => {
  const artist = compactMap(metadatas, artistFromMetadata)[0];
  return artist === undefined ? none<string>() : some(artist);
});

function inferArtistNameFromMetadata(item: StagedMediaItem): ResultAsync<Maybe<string>, CoreError> {
  const tasks = item.musicFiles.map((file) => {
    const filePath = path.join(item.path, file);
    return ResultAsync.fromPromise(parseFile(filePath), (cause) =>
      toCoreError(`Failed to parse metadata: ${filePath}`, cause),
    );
  });

  return ResultAsync.combine(tasks)
    .map(firstInferredArtist)
    .orElse(() => ok(none<string>()));
}

export function inferArtistNameForStagedItem(
  item: StagedMediaItem,
): ResultAsync<Maybe<string>, MovePlanError> {
  return inferArtistNameFromMetadata(item)
    .mapErr((error): MovePlanError => error)
    .map((artist) => (isSome(artist) ? artist : inferArtistNameFromFolder(item.name)));
}
