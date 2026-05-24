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

async function collectRelativeFiles(rootDir: string, currentDir = rootDir): Promise<string[]> {
  const entries = await readdir(currentDir, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectRelativeFiles(rootDir, entryPath)));
      continue;
    }
    if (entry.isFile()) files.push(path.relative(rootDir, entryPath));
  }

  return files;
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
      /\s*[[({][^\])}]*?(?:flac|mp3|m4a|24bit|16[./-]?44|vinyl|web|cd|discography|pmedia|h33t|japan|eu|uk)[^\])}]*?[\])}]/gi,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();
}

export function inferArtistNameFromFolder(folderName: string): Maybe<string> {
  const cleaned = stripReleaseTags(folderName);
  const patterns = [
    /^(.+?)\s+-\s+\d{4}\s+-\s+.+$/i,
    /^(.+?)\s+-\s+.+$/i,
    /^(.+?)\s+_\s+.+$/i,
    /^(.+?)\s+\/\s+.+$/i,
  ];

  for (const pattern of patterns) {
    const matched = cleaned.match(pattern);
    const artist = matched?.[1];
    if (artist) return sanitizeArtistName(artist);
  }

  return sanitizeArtistName(cleaned);
}

function inferArtistName(item: StagedMediaItem): ResultAsync<Maybe<string>, MovePlanError> {
  return ResultAsync.fromPromise(inferArtistNameFromMetadata(item), (cause) =>
    toCoreError(`Failed to infer artist for `, cause),
  ).map((artist) => (artist.isJust ? artist : inferArtistNameFromFolder(item.name)));
}

async function inferArtistNameFromMetadata(item: StagedMediaItem): Promise<Maybe<string>> {
  for (const file of item.musicFiles) {
    const filePath = path.join(item.path, file);
    const metadata = await parseFile(filePath).catch(() => undefined);
    const artist = metadata?.common.artist?.trim();
    if (artist) return sanitizeArtistName(artist);
  }

  return Maybe.nothing();
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
  ).andThen((entries) =>
    ResultAsync.fromSafePromise(
      entries
        .filter((entry) => entry.isDirectory())
        .reduce(
          async (itemsPromise, entry) => {
            const items = await itemsPromise;
            const dir = path.join(config.stagingDir, entry.name);
            const files = await collectRelativeFiles(dir);
            const mediaType = detectMediaType(entry.name, files, dir);
            if (mediaType.isNothing) return items;

            return [
              ...items,
              {
                id: crypto.randomUUID(),
                path: dir,
                name: entry.name,
                type: mediaType.value,
                files,
                musicFiles: files.filter(isMusicFile),
              } satisfies StagedMediaItem,
            ];
          },
          Promise.resolve([] as StagedMediaItem[]),
        ),
    ),
  );
}

function createIssue(code: string, message: string, itemId: string): DomainIssue {
  return { code, message, itemId, severity: "error" };
}

export function createMovePlanDraft(
  config: NasPathConfig,
  cueSplitEnabled = true,
): ResultAsync<MovePlan, MovePlanError> {
  return validateNasPathConfig(config)
    .mapErr((error): MovePlanError => error)
    .andThen(() => scanDownloadStagingArea(config))
    .andThen((items) =>
      ResultAsync.fromSafePromise(
        Promise.all(
          items.map(async (item): Promise<MovePlanItem> => {
            const artist =
              item.type === "music"
                ? await inferArtistName(item).unwrapOr(Maybe.nothing())
                : Maybe.nothing<string>();
            const itemId = crypto.randomUUID();
            const issues =
              item.type === "music" && artist.isNothing
                ? [
                    createIssue(
                      "ARTIST_REQUIRED",
                      "Artist name is required before confirmation.",
                      itemId,
                    ),
                  ]
                : [];
            const artistName = artist.isJust ? artist.value : undefined;
            const targetDir = targetDirectoryFor(item.type, config, artistName).unwrapOr(
              config.stagingDir,
            );

            return {
              id: itemId,
              status: issues.length > 0 ? "needs_correction" : "included",
              mediaType: item.type,
              sourcePath: item.path,
              targetPath: path.join(targetDir, item.name),
              artistName,
              albumName: item.name,
              included: issues.length === 0,
              issues,
            } satisfies MovePlanItem;
          }),
        ),
      ),
    )
    .map((items) => {
      const now = new Date().toISOString();
      return {
        id: crypto.randomUUID(),
        status: "draft",
        config,
        cueSplitEnabled,
        items,
        createdAt: now,
        updatedAt: now,
      } satisfies MovePlan;
    });
}
