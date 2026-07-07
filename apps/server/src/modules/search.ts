import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { t } from "elysia";
import { publicSubrouter } from "../lib/subrouter.js";
import { getCategories, type ProwlarrCategory, prowlarrSearch } from "../prowlarr.js";
import { eventStream } from "../realtime.js";
import type { Deps } from "../types/deps.js";

function getTokens(str: string): string[] {
  return str
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter(Boolean);
}

function containsAllTokens(targetTokens: Set<string>, queryTokens: string[]): boolean {
  return queryTokens.every((token) => targetTokens.has(token));
}

interface LibAlbum {
  artist: string;
  album: string;
  path: string;
  artistTokens: string[];
  albumTokens: string[];
}

async function readArtistAlbums(
  artistPath: string,
  artistName: string,
  rangePrefix?: string,
): Promise<LibAlbum[]> {
  const albums: LibAlbum[] = [];
  try {
    const artistAlbums = await readdir(artistPath, { withFileTypes: true });
    for (const album of artistAlbums) {
      if (album.isDirectory()) {
        albums.push({
          artist: artistName,
          album: album.name,
          path: rangePrefix
            ? join(rangePrefix, artistName, album.name)
            : join(artistName, album.name),
          artistTokens: getTokens(artistName),
          albumTokens: getTokens(album.name),
        });
      }
    }
  } catch {
    // ignore
  }
  return albums;
}

async function getAlbumsInRange(musicDir: string, range: string): Promise<LibAlbum[]> {
  const albums: LibAlbum[] = [];
  const rangePath = join(musicDir, range);
  try {
    const artists = await readdir(rangePath, { withFileTypes: true });
    for (const artist of artists) {
      if (artist.isDirectory()) {
        const artistPath = join(rangePath, artist.name);
        const artistAlbums = await readArtistAlbums(artistPath, artist.name, range);
        albums.push(...artistAlbums);
      }
    }
  } catch {
    // ignore
  }
  return albums;
}

async function getAlbumsInRoot(musicDir: string, ranges: string[]): Promise<LibAlbum[]> {
  const albums: LibAlbum[] = [];
  try {
    const rootDirs = await readdir(musicDir, { withFileTypes: true });
    for (const rootDir of rootDirs) {
      if (!rootDir.isDirectory()) continue;
      if (ranges.includes(rootDir.name) || rootDir.name === "_duplicates") continue;

      const artistPath = join(musicDir, rootDir.name);
      const artistAlbums = await readArtistAlbums(artistPath, rootDir.name);
      albums.push(...artistAlbums);
    }
  } catch {
    // ignore
  }
  return albums;
}

async function getAllLibraryAlbums(musicDir: string): Promise<LibAlbum[]> {
  const ranges = ["A-D", "E-F", "G-I", "J-M", "N-Q", "R-T", "U-Z"];

  const rangeResults = await Promise.all(ranges.map((range) => getAlbumsInRange(musicDir, range)));
  const rootResults = await getAlbumsInRoot(musicDir, ranges);

  return [...rangeResults.flat(), ...rootResults];
}

function isMatch(titleTokens: Set<string>, lib: LibAlbum): boolean {
  if (lib.artistTokens.length === 0 || lib.albumTokens.length === 0) return false;

  const lowerArtist = lib.artist.toLowerCase();
  if (lowerArtist === "various artists" || lowerArtist === "unknown artist") {
    return containsAllTokens(titleTokens, lib.albumTokens);
  }

  return (
    containsAllTokens(titleTokens, lib.artistTokens) &&
    containsAllTokens(titleTokens, lib.albumTokens)
  );
}

function findMatchInLibrary(titleTokens: Set<string>, libAlbums: LibAlbum[]): LibAlbum | null {
  return libAlbums.find((lib) => isMatch(titleTokens, lib)) ?? null;
}

/** Top-level Torznab groups shown by default until the user customizes Settings. */
const DEFAULT_ACTIVE_GROUP_IDS = new Set([2000, 3000, 5000, 7000]);

function flattenIds(categories: ProwlarrCategory[]): number[] {
  return categories.flatMap((group) => [group.id, ...group.subCategories.map((sub) => sub.id)]);
}

function defaultActiveIds(categories: ProwlarrCategory[]): number[] {
  return flattenIds(categories.filter((group) => DEFAULT_ACTIVE_GROUP_IDS.has(group.id)));
}

export function searchModule(deps: Deps) {
  return publicSubrouter(deps)
    .get("/search/categories", async ({ set, repos }) => {
      try {
        const categories = await getCategories();
        return {
          ok: true,
          categories,
          activeIds:
            repos.downloadCategorySettings.getActiveCategoryIds() ?? defaultActiveIds(categories),
        };
      } catch (cause) {
        set.status = 502;
        const message = cause instanceof Error ? cause.message : String(cause);
        return { ok: false, issues: [{ path: [], code: "PROWLARR_ERROR", message }] };
      }
    })
    .put(
      "/search/categories/active",
      ({ body, repos }) => {
        repos.downloadCategorySettings.setActiveCategoryIds(body.activeIds);
        return { ok: true, activeIds: body.activeIds };
      },
      { body: t.Object({ activeIds: t.Array(t.Number()) }) },
    )
    .get("/search", ({ query, set, request }) => {
      const q = query.q as string | undefined;
      if (!q?.trim()) {
        set.status = 422;
        return {
          ok: false,
          issues: [{ path: ["q"], code: "REQUIRED", message: "Query is required" }],
        };
      }
      const categoriesRaw = query.categories as string | undefined;
      const categories = categoriesRaw
        ? categoriesRaw.split(",").map(Number).filter(Number.isFinite)
        : undefined;

      return eventStream(async (send, signal) => {
        send({ type: "status", message: `Searching Prowlarr indexers for "${q.trim()}"...` });
        try {
          const results = await prowlarrSearch(q.trim(), categories, signal);
          const musicDir = deps.config.get().musicDir;
          const libAlbums = await getAllLibraryAlbums(musicDir);

          const enrichedResults = results.map((res) => {
            const titleTokens = new Set(getTokens(res.title));
            const matched = findMatchInLibrary(titleTokens, libAlbums);
            return {
              ...res,
              libraryMatch: matched ? { exists: true, path: matched.path } : { exists: false },
            };
          });

          send({ type: "result", results: enrichedResults });
        } catch (cause) {
          const message = cause instanceof Error ? cause.message : String(cause);
          send({ type: "error", message });
        }
      }, request.signal);
    });
}
