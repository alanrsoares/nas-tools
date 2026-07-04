import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { isNone, isSome, type Maybe, none } from "@onrails/maybe";
import { match as matchUnion } from "@onrails/pattern";
import { err, ok, type Result, ResultAsync, unwrapOr } from "@onrails/result";

import { inferArtistNameForStagedItem } from "./artist.js";
import type { MovePlanError, ValidationError } from "./errors.js";
import { safeAsync, toCoreError } from "./errors.js";
import { alphabeticalRanges } from "./library-layout.js";
import { detectMediaType, isCueFile, isMusicFile } from "./media-files.js";
import type {
  DomainIssue,
  FieldIssue,
  MediaType,
  MovePlan,
  MovePlanItem,
  NasPathConfig,
  StagedMediaItem,
} from "./schemas.js";

function collectRelativeFiles(
  rootDir: string,
  currentDir = rootDir,
): ResultAsync<string[], MovePlanError> {
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
  return matchUnion(mediaType)
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
    .with("unknown", () =>
      err<string, MovePlanError>(toCoreError("No target directory for unsupported media")),
    )
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
    const tasks = entries
      .filter((entry) => (entry.isDirectory() || entry.isFile()) && !entry.name.startsWith("."))
      .map((entry) => {
        const entryPath = path.join(config.stagingDir, entry.name);
        const filesTask: ResultAsync<string[], MovePlanError> = entry.isDirectory()
          ? collectRelativeFiles(entryPath)
          : ResultAsync.fromSafePromise(Promise.resolve([entry.name]));

        return filesTask.map((files): StagedMediaItem => {
          const mediaType = detectMediaType(entry.name, files, entryPath);
          return {
            id: crypto.randomUUID(),
            path: entryPath,
            name: entry.name,
            type: isSome(mediaType) ? mediaType.value : "unknown",
            files,
            musicFiles: files.filter(isMusicFile),
          };
        });
      });

    return ResultAsync.combine(tasks);
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

  if (item.type === "unknown") {
    return {
      id: itemId,
      status: "excluded",
      mediaType: item.type,
      sourcePath: item.path,
      targetPath: item.path,
      albumName: item.name,
      cueFiles: 0,
      cueAudioPairs: 0,
      included: false,
      issues: [
        createIssue(
          "UNSUPPORTED_MEDIA_TYPE",
          "No supported media detected (music, movie, TV, audiobook).",
          itemId,
        ),
      ],
    };
  }

  const artistName = isSome(artist) ? artist.value : undefined;
  const issues =
    item.type === "music" && isNone(artist)
      ? [createIssue("ARTIST_REQUIRED", "Artist name is required before confirmation.", itemId)]
      : [];
  const targetDir = unwrapOr(targetDirectoryFor(item.type, config, artistName), config.stagingDir);
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
          ? inferArtistNameForStagedItem(item).orElse(() => ok(none<string>()))
          : ResultAsync.fromSafePromise(Promise.resolve(none<string>()));
        return artistTask.map((artist) => toMovePlanItem(item, artist, config));
      });

      return ResultAsync.combine(itemTasks).map((items) => {
        const now = new Date().toISOString();
        return {
          id: crypto.randomUUID(),
          status: "draft" as const,
          config,
          cueSplitEnabled,
          items: [...items],
          createdAt: now,
          updatedAt: now,
        } satisfies MovePlan;
      });
    });
}
