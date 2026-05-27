import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { parseFile } from "music-metadata";
import { err, ok, type Result, ResultAsync } from "neverthrow";
import { Maybe } from "true-myth";
import { match } from "ts-pattern";
import { z } from "zod";

export const mediaTypeSchema = z.union([
  z.literal("tv"),
  z.literal("audiobook"),
  z.literal("music"),
  z.literal("movie"),
]);

export type MediaType = z.infer<typeof mediaTypeSchema>;

export const movePlanItemStatusSchema = z.union([
  z.literal("included"),
  z.literal("excluded"),
  z.literal("needs_correction"),
  z.literal("invalid"),
]);

export type MovePlanItemStatus = z.infer<typeof movePlanItemStatusSchema>;

export const jobStatusSchema = z.union([
  z.literal("queued"),
  z.literal("running"),
  z.literal("canceling"),
  z.literal("canceled"),
  z.literal("completed"),
  z.literal("completed_with_failures"),
  z.literal("failed"),
  z.literal("interrupted"),
]);

export type JobStatus = z.infer<typeof jobStatusSchema>;

export interface ReleaseInfo {
  id: string; // Artist - Album or MBID
  artist: string;
  album: string;
  fingerprint?: string; // Track durations hash/string
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
  // Priority: Track count (completeness) > Bits per sample > Sample rate > Bitrate
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

async function resolveAlbumFolder(folderPath: string): Promise<Maybe<AlbumFolder>> {
  const musicFiles = await collectMusicFilePaths(folderPath);
  if (musicFiles.length === 0) return Maybe.nothing<AlbumFolder>();
  const { metadatas, first } = await parseAlbumTracks(folderPath, musicFiles);
  const lazyInfo = getAlbumInfoLazy(folderPath, musicFiles.length, 0);
  const durationFingerprint = metadatas.map((m) => Math.round(m.format.duration || 0)).join(",");
  return Maybe.just({
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

  let artist = parsedFolder.map((release) => release.artist).unwrapOr(undefined);
  if (isDisc && grandparentName && !isLibraryRootName(grandparentName)) {
    artist = grandparentName;
  } else if (!artist && !isRange && parentName && !isLibraryRootName(parentName)) {
    artist = parentName;
  }

  let album = isDisc
    ? `${parentName} (${folderName})`
    : parsedFolder.map((release) => release.album).unwrapOr(folderName);

  artist = artist?.trim() || "Unknown Artist";
  album = album?.trim() || "Unknown Album";

  // Disc number from path
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
      id: `${normalize(artist)}-${normalize(stripReleaseTags(album))}${
        discNo ? `-d${discNo}` : ""
      }`,
      artist,
      album,
      trackCount: musicFilesCount,
    },
  };
}

function parseReleaseFolderName(folderName: string): Maybe<{ artist: string; album: string }> {
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

    return sanitizeArtistName(artist).map((sanitizedArtist) => ({
      artist: sanitizedArtist,
      album,
    }));
  }

  return Maybe.nothing();
}

function isLibraryRootName(name: string): boolean {
  return name === "." || name === "FLAC" || alphabeticalRanges.some((range) => range.name === name);
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

    // Fingerprint-first grouping:
    // Albums are duplicates if they have the SAME tracks/durations AND same ARTIST.
    // This catches "Album" vs "Album (Remaster)" even if Release IDs differ.
    const groupId = album.release.fingerprint
      ? `${normalize(album.release.artist)}::${album.release.fingerprint}`
      : `${album.release.id}::${album.trackCount}t`;

    const group = groups.get(groupId) || [];
    group.push(album);
    groups.set(groupId, group);
  }

  // Filter groups that have more than one album
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
    // Sort by score descending
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

export const nasPathConfigSchema = z.object({
  stagingDir: z.string().min(1),
  musicDir: z.string().min(1),
  tvDir: z.string().min(1),
  movieDir: z.string().min(1),
  audiobookDir: z.string().min(1),
  backupDir: z.string().min(1),
});

export type NasPathConfig = z.infer<typeof nasPathConfigSchema>;

export const defaultNasPathConfig = {
  stagingDir: "/volmain/Download/Transmission/complete/",
  musicDir: "/volmain/Public/FLAC/",
  tvDir: "/volmain/Public/TV Series & Documentaries/",
  movieDir: "/volmain/Public/Movies/",
  audiobookDir: "/volmain/Public/Audiobooks/",
  backupDir: "/volmain/Download/Transmission/backup/",
} satisfies NasPathConfig;

export const fieldIssueSchema = z.object({
  path: z.array(z.string()),
  code: z.string(),
  message: z.string(),
});

export type FieldIssue = z.infer<typeof fieldIssueSchema>;

export const domainIssueSchema = z.object({
  code: z.string(),
  message: z.string(),
  itemId: z.string().optional(),
  severity: z.union([z.literal("info"), z.literal("warning"), z.literal("error")]),
});

export type DomainIssue = z.infer<typeof domainIssueSchema>;

export type CoreError = {
  type: "CORE_ERROR";
  message: string;
  cause?: unknown;
};

export type ValidationError = {
  type: "VALIDATION_ERROR";
  issues: FieldIssue[];
};

export type MovePlanError =
  | CoreError
  | ValidationError
  | { type: "STAGING_AREA_MISSING"; path: string }
  | { type: "SOURCE_MISSING"; itemId: string; path: string }
  | { type: "ARTIST_REQUIRED"; itemId: string };

export const stagedMediaItemSchema = z.object({
  id: z.string(),
  path: z.string(),
  name: z.string(),
  type: mediaTypeSchema,
  files: z.array(z.string()),
  musicFiles: z.array(z.string()),
});

export type StagedMediaItem = z.infer<typeof stagedMediaItemSchema>;

export const movePlanItemSchema = z.object({
  id: z.string(),
  status: movePlanItemStatusSchema,
  mediaType: mediaTypeSchema,
  sourcePath: z.string(),
  targetPath: z.string(),
  artistName: z.string().optional(),
  albumName: z.string(),
  isNewArtist: z.boolean().optional(),
  cueFiles: z.number().int().nonnegative().optional(),
  cueAudioPairs: z.number().int().nonnegative().optional(),
  included: z.boolean(),
  issues: z.array(domainIssueSchema),
});

export type MovePlanItem = z.infer<typeof movePlanItemSchema>;

export const movePlanSchema = z.object({
  id: z.string(),
  status: z.union([z.literal("draft"), z.literal("confirmed"), z.literal("superseded")]),
  config: nasPathConfigSchema,
  cueSplitEnabled: z.boolean(),
  items: z.array(movePlanItemSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type MovePlan = z.infer<typeof movePlanSchema>;

export interface WalkEntry {
  path: string;
  name: string;
  isDirectory: boolean;
  size: number;
  mtimeMs: number;
}

async function walkDir(
  dir: string,
  depth: number,
  maxDepth: number,
  includeHidden: boolean,
): Promise<WalkEntry[]> {
  if (depth > maxDepth) return [];
  const names = await readdir(dir).catch(() => [] as string[]);
  const entries: WalkEntry[] = [];
  for (const name of names) {
    if (!includeHidden && name.startsWith(".")) continue;
    const entryPath = path.join(dir, name);
    const entryStat = await stat(entryPath).catch(() => undefined);
    if (!entryStat) continue;
    const isDirectory = entryStat.isDirectory();
    entries.push({
      path: entryPath,
      name,
      isDirectory,
      size: entryStat.size,
      mtimeMs: entryStat.mtimeMs,
    });
    if (isDirectory)
      entries.push(...(await walkDir(entryPath, depth + 1, maxDepth, includeHidden)));
  }
  return entries;
}

export function walk(
  root: string,
  options: { maxDepth?: number; includeHidden?: boolean } = {},
): ResultAsync<WalkEntry[], CoreError> {
  return ResultAsync.fromPromise(
    walkDir(root, 0, options.maxDepth ?? Infinity, options.includeHidden ?? false),
    (cause) => toCoreError(`Failed to walk directory: ${root}`, cause),
  );
}

const fileExtensions = {
  cue: ".cue",
  flac: ".flac",
  mp3: ".mp3",
  m4a: ".m4a",
  wav: ".wav",
  ogg: ".ogg",
  wv: ".wv",
  m4b: ".m4b",
  mkv: ".mkv",
  mp4: ".mp4",
  avi: ".avi",
} as const;

const musicExtensions = [
  fileExtensions.flac,
  fileExtensions.mp3,
  fileExtensions.m4a,
  fileExtensions.wav,
  fileExtensions.ogg,
  fileExtensions.wv,
] as const;

const movieExtensions = [fileExtensions.mkv, fileExtensions.mp4, fileExtensions.avi] as const;
const tvPattern = /[sS]\d{1,2}[eE]\d{1,2}|[sS]\d{1,2}\s|[eE]\d{1,2}\s/i;

const alphabeticalRanges = [
  { name: "A-D", pattern: /^[A-D]/i },
  { name: "E-F", pattern: /^[E-F]/i },
  { name: "G-I", pattern: /^[G-I]/i },
  { name: "J-M", pattern: /^[J-M]/i },
  { name: "N-Q", pattern: /^[N-Q]/i },
  { name: "R-T", pattern: /^[R-T]/i },
  { name: "U-Z", pattern: /^[U-Z]/i },
] as const;

const toCoreError = (message: string, cause?: unknown): CoreError => ({
  type: "CORE_ERROR",
  message,
  cause,
});

const safeAsync = <T>(fn: () => Promise<T>, message: string) =>
  ResultAsync.fromPromise(fn(), (cause) => toCoreError(message, cause));

const fileNameEndsWith = (file: string, extensions: readonly string[]) =>
  extensions.some((ext) => file.toLowerCase().endsWith(ext));

const isMusicFile = (file: string) => fileNameEndsWith(file, musicExtensions);
const isMovieFile = (file: string) => fileNameEndsWith(file, movieExtensions);
const isCueFile = (file: string) => file.toLowerCase().endsWith(fileExtensions.cue);
const isTvFile = (file: string) => tvPattern.test(file);
const isAudiobookFile = (file: string, pathName?: string) =>
  file.toLowerCase().endsWith(fileExtensions.m4b) ||
  Boolean(pathName?.toLowerCase().includes("audiobook"));

function detectMediaType(dirName: string, files: string[], dirPath: string): Maybe<MediaType> {
  if (isTvFile(dirName) || files.some(isTvFile)) return Maybe.just("tv");
  if (isAudiobookFile(dirName, dirPath) || files.some((file) => isAudiobookFile(file))) {
    return Maybe.just("audiobook");
  }
  if (files.some((file) => isMusicFile(file) || isCueFile(file))) return Maybe.just("music");
  if (files.some(isMovieFile)) return Maybe.just("movie");
  return Maybe.nothing();
}

function collectRelativeFiles(
  rootDir: string,
  currentDir = rootDir,
): ResultAsync<string[], CoreError> {
  return safeAsync(
    () => readdir(currentDir, { withFileTypes: true }),
    `Failed to read directory: ${currentDir}`,
  ).andThen((entries) => {
    const tasks = entries.map((entry) => {
      const entryPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        return collectRelativeFiles(rootDir, entryPath);
      }
      if (entry.isFile()) {
        return ResultAsync.fromSafePromise(Promise.resolve([path.relative(rootDir, entryPath)]));
      }
      return ResultAsync.fromSafePromise(Promise.resolve([] as string[]));
    });

    return ResultAsync.combine(tasks).map((results) => results.flat());
  });
}

function sanitizeArtistName(artistName: string): Maybe<string> {
  const sanitized = artistName
    // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional control char range sanitization
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\\/]+/g, " ")
    .replace(/[:*?"<>|]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "");

  return sanitized ? Maybe.just(sanitized) : Maybe.nothing();
}

function stripReleaseTags(name: string): string {
  return name
    .replace(
      /\s*[[({][^\])}]*?(?:flac|mp3|m4a|24bit|16[./-]?44|vinyl|web|cd|discography|pmedia|h33t|japan|eu|uk|remaster|edition|anniversary|deluxe|boxset|hi-res|highres|24-96|24-192|24bit-96khz|24bit-192khz)[^\])}]*?[\])}]/gi,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();
}

export function inferArtistNameFromFolder(folderName: string): Maybe<string> {
  const cleaned = stripReleaseTags(folderName);

  // Skip if it looks like just a Year - Album or Disc folder
  if (
    /^\d{4}\s*-\s*/.test(cleaned) ||
    /^(?:disc|cd|vol|volume|part|side|record|lp)\.?\s*\d+$/i.test(cleaned)
  ) {
    return Maybe.nothing();
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

function inferArtistName(item: StagedMediaItem): ResultAsync<Maybe<string>, MovePlanError> {
  return inferArtistNameFromMetadata(item)
    .mapErr((error): MovePlanError => error)
    .map((artist) => (artist.isJust ? artist : inferArtistNameFromFolder(item.name)));
}

function isUnknown(str?: string): boolean {
  if (!str) return true;
  const n = str.toLowerCase();
  return n === "unknown artist" || n === "unknown album" || n === "unknown" || n === "";
}

function inferArtistNameFromMetadata(item: StagedMediaItem): ResultAsync<Maybe<string>, CoreError> {
  const tasks = item.musicFiles.map((file) => {
    const filePath = path.join(item.path, file);
    return ResultAsync.fromPromise(parseFile(filePath), (cause) =>
      toCoreError(`Failed to parse metadata: ${filePath}`, cause),
    );
  });

  return ResultAsync.combine(tasks)
    .map((metadatas) => {
      for (const metadata of metadatas) {
        const artist = metadata.common.artist?.trim();
        if (artist) {
          const sanitized = sanitizeArtistName(artist);
          if (sanitized.isJust) return sanitized;
        }
      }
      return Maybe.nothing<string>();
    })
    .orElse(() => ok(Maybe.nothing<string>())); // Ignore metadata errors, just return nothing
}

export function getMusicTargetDirectory(artistName: string, musicDir: string): string {
  const firstChar = artistName.charAt(0).toUpperCase();
  const range = alphabeticalRanges.find((candidate) => candidate.pattern.test(firstChar));
  return path.join(musicDir, range?.name ?? "", artistName);
}

function targetDirectoryFor(
  mediaType: MediaType,
  config: NasPathConfig,
  artistName?: string,
): Result<string, MovePlanError> {
  return match(mediaType)
    .with("music", () =>
      artistName
        ? ok<string, MovePlanError>(getMusicTargetDirectory(artistName, config.musicDir))
        : err({
            type: "ARTIST_REQUIRED",
            itemId: "unknown",
          } satisfies MovePlanError),
    )
    .with("tv", () => ok<string, MovePlanError>(config.tvDir))
    .with("movie", () => ok<string, MovePlanError>(config.movieDir))
    .with("audiobook", () => ok<string, MovePlanError>(config.audiobookDir))
    .exhaustive();
}

export function validateNasPathConfig(
  config: NasPathConfig,
): ResultAsync<NasPathConfig, ValidationError> {
  return ResultAsync.fromSafePromise(
    Promise.all(
      Object.entries(config).map(async ([key, value]) => {
        const dir = await stat(value)
          .then((entry) => entry.isDirectory())
          .catch(() => false);
        return dir
          ? undefined
          : ({
              path: [key],
              code: "PATH_MISSING",
              message: `${key} does not exist: ${value}`,
            } satisfies FieldIssue);
      }),
    ).then((issues) => issues.filter((issue): issue is FieldIssue => issue !== undefined)),
  ).andThen((issues) =>
    issues.length === 0
      ? ok(config)
      : err({ type: "VALIDATION_ERROR", issues } satisfies ValidationError),
  );
}

export function scanDownloadStagingArea(
  config: NasPathConfig,
): ResultAsync<StagedMediaItem[], MovePlanError> {
  return safeAsync(
    () => readdir(config.stagingDir, { withFileTypes: true }),
    `Failed to scan ${config.stagingDir}`,
  ).andThen((entries) => {
    const folders = entries.filter((entry) => entry.isDirectory());
    const tasks = folders.map((entry) => {
      const dir = path.join(config.stagingDir, entry.name);
      return collectRelativeFiles(dir)
        .mapErr((error): MovePlanError => error)
        .map((files): Maybe<StagedMediaItem> => {
          const mediaType = detectMediaType(entry.name, files, dir);
          if (mediaType.isNothing) return Maybe.nothing();

          return Maybe.just({
            id: crypto.randomUUID(),
            path: dir,
            name: entry.name,
            type: mediaType.value,
            files,
            musicFiles: files.filter(isMusicFile),
          });
        });
    });

    return ResultAsync.combine(tasks).map((results) =>
      results
        .filter((res): res is Maybe<StagedMediaItem> & { isJust: true } => res.isJust)
        .map((res) => res.value),
    );
  });
}

function countCueFiles(files: string[]): number {
  return files.filter(isCueFile).length;
}

function countCueAudioPairs(files: string[]): number {
  const audioByDirectory = new Map<string, Set<string>>();

  for (const file of files.filter(isMusicFile)) {
    const directory = path.dirname(file);
    const audioNames = audioByDirectory.get(directory) ?? new Set<string>();
    audioNames.add(
      path
        .basename(file)
        .replace(/\.(flac|mp3|m4a|wav|ogg|wv)$/i, "")
        .toLowerCase(),
    );
    audioByDirectory.set(directory, audioNames);
  }

  return files.filter(isCueFile).filter((file) => {
    const directory = path.dirname(file);
    const cueBaseName = path
      .basename(file)
      .replace(/\.cue$/i, "")
      .toLowerCase();
    return audioByDirectory.get(directory)?.has(cueBaseName) ?? false;
  }).length;
}

function createIssue(code: string, message: string, itemId: string): DomainIssue {
  return { code, message, itemId, severity: "error" };
}

function toMovePlanItem(
  item: StagedMediaItem,
  artist: Maybe<string>,
  config: NasPathConfig,
): MovePlanItem {
  const itemId = crypto.randomUUID();
  const artistName = artist.isJust ? artist.value : undefined;
  const issues =
    item.type === "music" && artist.isNothing
      ? [createIssue("ARTIST_REQUIRED", "Artist name is required before confirmation.", itemId)]
      : [];
  const targetDir = targetDirectoryFor(item.type, config, artistName).unwrapOr(config.stagingDir);
  return {
    id: itemId,
    status: issues.length > 0 ? "needs_correction" : "included",
    mediaType: item.type,
    sourcePath: item.path,
    targetPath: path.join(targetDir, item.name),
    artistName,
    cueFiles: item.type === "music" ? countCueFiles(item.files) : 0,
    cueAudioPairs: item.type === "music" ? countCueAudioPairs(item.files) : 0,
    albumName: item.name,
    included: issues.length === 0,
    issues,
  };
}

export function createMovePlanDraft(
  config: NasPathConfig,
  cueSplitEnabled = true,
): ResultAsync<MovePlan, MovePlanError> {
  return validateNasPathConfig(config)
    .mapErr((error): MovePlanError => error)
    .andThen(() => scanDownloadStagingArea(config))
    .andThen((items) => {
      const itemTasks = items.map((item) => {
        const artistTask: ResultAsync<Maybe<string>, MovePlanError> = item.type === "music"
          ? inferArtistName(item).orElse(() => ok(Maybe.nothing<string>()))
          : ResultAsync.fromSafePromise(Promise.resolve(Maybe.nothing<string>()));
        return artistTask.map((artist) => toMovePlanItem(item, artist, config));
      });

      return ResultAsync.combine(itemTasks).map((items) => [...items]);
    })
    .map((items) => {
      const now = new Date().toISOString();
      return {
        id: crypto.randomUUID(),
        status: "draft" as const,
        config,
        cueSplitEnabled,
        items,
        createdAt: now,
        updatedAt: now,
      } satisfies MovePlan;
    });
}
