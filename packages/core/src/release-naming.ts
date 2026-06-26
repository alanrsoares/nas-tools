import { type Maybe, map as mapMaybe, none, some } from "@onrails/maybe";
import { flow } from "@onrails/result/pipe";

export const sanitizeArtistName = flow(
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

const RELEASE_FOLDER_PATTERNS = [
  /^(.+?)\s+-\s+\d{4}\s+-\s+(.+)$/i,
  /^(.+?)\s+-\s+(.+)$/i,
  /^(.+?)\s+_\s+(.+)$/i,
] as const;

export function parseReleaseFolderName(
  folderName: string,
): Maybe<{ artist: string; album: string }> {
  const cleaned = stripReleaseTags(folderName);

  for (const pattern of RELEASE_FOLDER_PATTERNS) {
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

const ARTIST_FOLDER_PATTERNS = [
  /^(.+?)\s+-\s+\d{4}\s+-\s+.+$/i,
  /^(.+?)\s+-\s+.+$/i,
  /^(.+?)\s+_\s+.+$/i,
  /^(.+?)\s+\/\s+.+$/i,
] as const;

export function inferArtistNameFromFolder(folderName: string): Maybe<string> {
  const cleaned = stripReleaseTags(folderName);

  if (
    /^\d{4}\s*-\s*/.test(cleaned) ||
    /^(?:disc|cd|vol|volume|part|side|record|lp)\.?\s*\d+$/i.test(cleaned)
  ) {
    return none();
  }

  for (const pattern of ARTIST_FOLDER_PATTERNS) {
    const matched = cleaned.match(pattern);
    const artist = matched?.[1];
    if (artist && !/^\d{4}$/.test(artist.trim())) return sanitizeArtistName(artist);
  }

  return sanitizeArtistName(cleaned);
}
