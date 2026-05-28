import { isAbsolute, join, relative } from "node:path";
import {
  type AlbumFolder,
  findDuplicates,
  getAlbumInfo,
  identifyAlbumCandidates,
  identifyDedupeMoves,
  scoreAlbum,
  type WalkEntry,
  walk,
} from "@nas-tools/core";
import { isSome } from "@onrails/maybe";
import { isErr, isOk } from "@onrails/result";

export type DedupeGroup = {
  id: string;
  release: AlbumFolder["release"];
  winner: AlbumFolder;
  losers: AlbumFolder[];
};

type SendFn = (data: unknown) => void;

function buildDedupeOutput(groups: Map<string, AlbumFolder[]>): DedupeGroup[] {
  const duplicates = [];
  for (const [id, group] of groups.entries()) {
    group.sort((a, b) => scoreAlbum(b) - scoreAlbum(a));
    const winner = group[0];
    if (!winner) continue;
    duplicates.push({ id, release: winner.release, winner, losers: group.slice(1) });
  }
  return duplicates;
}

async function resolveAlbumBatch(
  folders: string[],
  entries: WalkEntry[],
  send: SendFn,
): Promise<AlbumFolder[]> {
  const albums: AlbumFolder[] = [];
  let count = 0;
  const batchSize = 10;
  send({
    type: "analyzing",
    message: `Verifying metadata for ${folders.length} album roots...`,
    total: folders.length,
  });
  for (let i = 0; i < folders.length; i += batchSize) {
    const batch = folders.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (folder) => {
        const infoResult = await getAlbumInfo(folder);
        if (isOk(infoResult) && isSome(infoResult.value)) {
          const info = infoResult.value.value;
          info.totalSize = entries
            .filter((entry) => {
              if (entry.isDirectory) return false;
              const nestedPath = relative(folder, entry.path);
              return nestedPath !== "" && !nestedPath.startsWith("..") && !isAbsolute(nestedPath);
            })
            .reduce((sum, e) => sum + e.size, 0);
          albums.push(info);
        }
        count++;
      }),
    );
    send({ type: "progress", current: count, total: folders.length });
  }
  return albums;
}

export async function streamDedupeGroups(root: string, send: SendFn): Promise<void> {
  send({ type: "indexing", message: "Scanning music directory..." });
  const entriesResult = await walk(root, { maxDepth: 4 });
  if (isErr(entriesResult)) {
    send({
      type: "error",
      message: entriesResult.error.message,
    });
    send({ type: "result", duplicates: [], moves: [] });
    return;
  }
  const entries = entriesResult.value;

  send({ type: "analyzing", message: "Identifying album roots..." });
  const candidates = identifyAlbumCandidates(entries, root);
  const candidateFolders = [...new Set(candidates.map((album) => album.path))];

  if (candidateFolders.length === 0) {
    send({ type: "result", duplicates: [], moves: [] });
    return;
  }

  const albums = await resolveAlbumBatch(candidateFolders, entries, send);
  const groups = findDuplicates(albums);
  const moves = identifyDedupeMoves(groups, root, join(root, "_duplicates"));
  send({ type: "result", duplicates: buildDedupeOutput(groups), moves });
}
