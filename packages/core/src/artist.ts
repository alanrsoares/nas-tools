import path from "node:path";
import { compactMap, isSome, type Maybe, none, some } from "@onrails/maybe";
import { ok, ResultAsync } from "@onrails/result";
import { flow } from "@onrails/result/pipe";
import { parseFile } from "music-metadata";

import { type CoreError, type MovePlanError, toCoreError } from "./errors.js";
import {
  inferArtistNameFromFolder,
  parseReleaseFolderName,
  sanitizeArtistName,
  stripReleaseTags,
} from "./release-naming.js";
import type { StagedMediaItem } from "./schemas.js";

export { inferArtistNameFromFolder, parseReleaseFolderName, stripReleaseTags };

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
