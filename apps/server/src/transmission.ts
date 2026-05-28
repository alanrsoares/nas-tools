import { access } from "node:fs/promises";
import { join, normalize } from "node:path";
import { env } from "./env.js";

const RPC_URL = env.TRANSMISSION_RPC_URL;
const RPC_USERNAME = env.TRANSMISSION_RPC_USERNAME;
const RPC_PASSWORD = env.TRANSMISSION_RPC_PASSWORD;

const CONTAINER_COMPLETE_DIR = "/downloads/complete";

interface TransmissionFile {
  name: string;
}

interface TransmissionTorrent {
  id: number;
  name: string;
  percentDone: number;
  isFinished?: boolean;
  downloadDir: string;
  totalSize?: number;
  files: TransmissionFile[];
  status?: number;
  rateDownload?: number;
}

export interface ActiveTorrent {
  id: number;
  name: string;
  progress: number;
  totalSize: number;
  rateDownload: number;
  status: number;
}

export type TorrentRef = Pick<ActiveTorrent, "id" | "name">;

export interface TorrentDashboard {
  downloading: ActiveTorrent[];
  seeding: number;
  orphaned: TorrentRef[];
  total: number;
}

interface RpcResponse<T> {
  result: string;
  arguments: T;
}

export interface CleanResult {
  totalTorrents: number;
  removed: number;
  candidates: TorrentRef[];
}

type TorrentAddEntry = TorrentRef;

type TorrentAddRpcResult = {
  "torrent-added"?: TorrentAddEntry;
  "torrent-duplicate"?: TorrentAddEntry;
};

async function pathExists(p: string): Promise<boolean> {
  return access(p)
    .then(() => true)
    .catch(() => false);
}

function mapPath(downloadDir: string, fileName: string, completeDir: string): string {
  const base = downloadDir.startsWith(CONTAINER_COMPLETE_DIR)
    ? `${completeDir}${downloadDir.slice(CONTAINER_COMPLETE_DIR.length)}`
    : downloadDir;
  return normalize(join(base, fileName));
}

async function rpc<T>(
  method: string,
  args: Record<string, unknown> = {},
  sessionId?: string,
): Promise<RpcResponse<T>> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (RPC_USERNAME || RPC_PASSWORD) {
    headers.authorization = `Basic ${Buffer.from(`${RPC_USERNAME}:${RPC_PASSWORD}`).toString("base64")}`;
  }
  if (sessionId) headers["x-transmission-session-id"] = sessionId;

  const res = await fetch(RPC_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ method, arguments: args }),
  });

  if (res.status === 409 && !sessionId) {
    const next = res.headers.get("x-transmission-session-id");
    if (!next) throw new Error("Transmission RPC: 409 but no session-id header");
    return rpc<T>(method, args, next);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Transmission RPC ${method}: HTTP ${res.status} — ${body}`);
  }

  const data = (await res.json()) as RpcResponse<T>;
  if (data.result !== "success") throw new Error(`Transmission RPC ${method}: ${data.result}`);
  return data;
}

export interface AddResult {
  id: number;
  name: string;
  duplicate: boolean;
}

export async function addTorrent(url: string): Promise<AddResult> {
  const res = await rpc<TorrentAddRpcResult>("torrent-add", { filename: url, paused: false });

  const added = res.arguments["torrent-added"];
  const dup = res.arguments["torrent-duplicate"];
  if (added) return { id: added.id, name: added.name, duplicate: false };
  if (dup) return { id: dup.id, name: dup.name, duplicate: true };
  throw new Error("torrent-add returned neither torrent-added nor torrent-duplicate");
}

export async function getTorrentDashboard(completeDir: string): Promise<TorrentDashboard> {
  const {
    arguments: { torrents },
  } = await rpc<{ torrents: TransmissionTorrent[] }>("torrent-get", {
    fields: [
      "id",
      "name",
      "percentDone",
      "isFinished",
      "downloadDir",
      "totalSize",
      "files",
      "status",
      "rateDownload",
    ],
  });

  const downloading: ActiveTorrent[] = torrents
    .filter((t) => t.percentDone < 1 && !t.isFinished)
    .map((t) => ({
      id: t.id,
      name: t.name,
      progress: t.percentDone,
      totalSize: t.totalSize ?? 0,
      rateDownload: t.rateDownload ?? 0,
      status: t.status ?? 0,
    }));

  const seeding = torrents.filter((t) => t.status === 6).length;
  const completed = torrents.filter((t) => t.percentDone === 1 || t.isFinished === true);

  const orphaned: TorrentRef[] = [];
  for (const torrent of completed) {
    if (torrent.files.length === 0) continue;
    const paths = torrent.files.map((f) => mapPath(torrent.downloadDir, f.name, completeDir));
    const existing = await Promise.all(paths.map(pathExists));
    if (existing.every((e) => !e)) orphaned.push({ id: torrent.id, name: torrent.name });
  }

  return { downloading, seeding, orphaned, total: torrents.length };
}

export async function cleanCompletedTorrents(completeDir: string): Promise<CleanResult> {
  const {
    arguments: { torrents },
  } = await rpc<{ torrents: TransmissionTorrent[] }>("torrent-get", {
    fields: ["id", "name", "percentDone", "isFinished", "downloadDir", "totalSize", "files"],
  });

  const candidates: TorrentRef[] = [];

  for (const torrent of torrents) {
    const done = torrent.percentDone === 1 || torrent.isFinished === true;
    if (!done || torrent.files.length === 0) continue;

    const paths = torrent.files.map((f) => mapPath(torrent.downloadDir, f.name, completeDir));
    const existing = await Promise.all(paths.map(pathExists));
    if (existing.every((e) => !e)) {
      candidates.push({ id: torrent.id, name: torrent.name });
    }
  }

  if (candidates.length > 0) {
    await rpc("torrent-remove", {
      ids: candidates.map((c) => c.id),
      "delete-local-data": false,
    });
  }

  return {
    totalTorrents: torrents.length,
    removed: candidates.length,
    candidates,
  };
}

export type TorrentAction = "pause" | "resume" | "remove";

export async function torrentAction(id: number, action: TorrentAction): Promise<void> {
  if (action === "pause") {
    await rpc("torrent-stop", { ids: [id] });
  } else if (action === "resume") {
    await rpc("torrent-start", { ids: [id] });
  } else {
    await rpc("torrent-remove", { ids: [id], "delete-local-data": false });
  }
}
