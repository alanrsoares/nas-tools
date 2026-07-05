import { join, normalize } from "node:path";
import { ResultAsync } from "@onrails/result";
import type { Command } from "commander";
import { z } from "zod";

import { env } from "../lib/env.js";
import { type AppError, fail, formatError, runParsedCommand } from "../lib/fp.js";
import {
  type Finding,
  isAppleJunk,
  isMusicName,
  isUnsafeFile,
  NAS_PATHS,
  pathExists,
  printReport,
  walk,
} from "../lib/report.js";
import { logError } from "../lib/utils.js";

const optionsSchema = z.object({
  completeDir: z.string().optional().default(NAS_PATHS.transmissionComplete),
  incompleteDir: z.string().optional().default(NAS_PATHS.transmissionIncomplete),
  json: z.boolean().optional().default(false),
  staleDays: z.coerce.number().int().positive().optional().default(14),
});

type CommandOptions = z.infer<typeof optionsSchema>;

const cleanTransmissionOptionsSchema = z.object({
  completeDir: z.string().optional().default(NAS_PATHS.transmissionComplete),
  dryRun: z.boolean().optional().default(true),
  json: z.boolean().optional().default(false),
  password: z.string().optional().default(env.TRANSMISSION_RPC_PASSWORD),
  rpcUrl: z.string().url().optional().default("http://127.0.0.1:29091/transmission/rpc"),
  username: z.string().optional().default(env.TRANSMISSION_RPC_USERNAME),
  yes: z.boolean().optional().default(false),
});

type CleanTransmissionOptions = z.infer<typeof cleanTransmissionOptionsSchema>;

interface DownloadsReport {
  title: string;
  completeDir: string;
  incompleteDir: string;
  stats: {
    completeFolders: number;
    incompleteFolders: number;
    musicFiles: number;
    staleIncomplete: number;
    junkFiles: number;
    unsafeFiles: number;
    packCandidates: number;
  };
  findings: Finding[];
}

export interface TransmissionFile {
  name: string;
  length?: number;
}

export interface TransmissionTorrent {
  id: number;
  name: string;
  hashString?: string;
  percentDone: number;
  isFinished?: boolean;
  doneDate?: number;
  status?: number;
  downloadDir: string;
  totalSize?: number;
  files: TransmissionFile[];
}

interface TransmissionRpcResponse<T> {
  result: string;
  arguments: T;
}

export interface CleanTransmissionCandidate {
  id: number;
  name: string;
  hashString?: string;
  downloadDir: string;
  missingFiles: number;
  totalSize: number;
}

interface CleanTransmissionReport {
  title: string;
  rpcUrl: string;
  completeDir: string;
  dryRun: boolean;
  stats: {
    totalTorrents: number;
    candidates: number;
    removed: number;
    kept: number;
  };
  candidates: CleanTransmissionCandidate[];
  findings: Finding[];
}

const addTorrentOptionsSchema = z.object({
  rpcUrl: z.string().url().optional().default("http://127.0.0.1:29091/transmission/rpc"),
  username: z.string().optional().default(env.TRANSMISSION_RPC_USERNAME),
  password: z.string().optional().default(env.TRANSMISSION_RPC_PASSWORD),
  torrent: z.string(),
  paused: z.boolean().optional().default(false),
});

type AddTorrentOptions = z.infer<typeof addTorrentOptionsSchema>;

function runAddTorrent(options: AddTorrentOptions): ResultAsync<void, AppError> {
  return ResultAsync.fromPromise(
    (async () => {
      const isMagnet = options.torrent.startsWith("magnet:");
      const args: Record<string, unknown> = {
        paused: options.paused,
      };

      if (isMagnet) {
        args.filename = options.torrent;
      } else {
        // Assume it's a file path or URL
        args.filename = options.torrent;
      }

      const response = await transmissionRpc<{
        "torrent-added"?: { id: number; name: string };
        "torrent-duplicate"?: { id: number; name: string };
      }>(options, "torrent-add", args);

      if (response.arguments["torrent-added"]) {
        console.log(
          `✅ Added torrent: ${response.arguments["torrent-added"].name} (ID: ${response.arguments["torrent-added"].id})`,
        );
      } else if (response.arguments["torrent-duplicate"]) {
        console.log(
          `ℹ️ Torrent already exists: ${response.arguments["torrent-duplicate"].name} (ID: ${response.arguments["torrent-duplicate"].id})`,
        );
      }
    })(),
    (cause) => {
      const msg = cause instanceof Error ? cause.message : String(cause);
      return fail(`Transmission add failed: ${msg}`, cause);
    },
  );
}

const dayMs = 24 * 60 * 60 * 1000;
const transmissionContainerCompleteDir = "/downloads/complete";

export function mapTransmissionPath(
  downloadDir: string,
  relativeName: string,
  options: { completeDir: string },
): string {
  const base = downloadDir.startsWith(transmissionContainerCompleteDir)
    ? `${options.completeDir}${downloadDir.slice(transmissionContainerCompleteDir.length)}`
    : downloadDir;

  return normalize(join(base, relativeName));
}

export async function findMovedCompletedTorrents(
  torrents: TransmissionTorrent[],
  options: {
    completeDir: string;
    pathExistsFn?: (path: string) => Promise<boolean>;
  },
): Promise<CleanTransmissionCandidate[]> {
  const exists = options.pathExistsFn ?? pathExists;
  const candidates: CleanTransmissionCandidate[] = [];

  for (const torrent of torrents) {
    const isComplete = torrent.percentDone === 1 || torrent.isFinished === true;
    if (!isComplete || torrent.files.length === 0) {
      continue;
    }

    const paths = torrent.files.map((file) =>
      mapTransmissionPath(torrent.downloadDir, file.name, {
        completeDir: options.completeDir,
      }),
    );
    const existing = await Promise.all(paths.map((path) => exists(path)));

    if (existing.every((value) => !value)) {
      const candidate: CleanTransmissionCandidate = {
        id: torrent.id,
        name: torrent.name,
        downloadDir: torrent.downloadDir,
        missingFiles: paths.length,
        totalSize: torrent.totalSize ?? 0,
      };
      if (torrent.hashString) {
        candidate.hashString = torrent.hashString;
      }
      candidates.push(candidate);
    }
  }

  return candidates;
}

function buildTransmissionHeaders(
  options: Pick<CleanTransmissionOptions, "password" | "username">,
  sessionId?: string,
): Record<string, string> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (options.username || options.password) {
    headers.authorization = `Basic ${Buffer.from(`${options.username}:${options.password}`).toString("base64")}`;
  }
  if (sessionId) headers["x-transmission-session-id"] = sessionId;
  return headers;
}

async function assertTransmissionResponse<T>(
  response: Response,
  method: string,
  password: string | undefined,
): Promise<TransmissionRpcResponse<T>> {
  if (!response.ok) {
    const body = await response.text();
    if (response.status === 401 || response.status === 403) {
      const authHint = password
        ? "check TRANSMISSION_RPC_USERNAME/TRANSMISSION_RPC_PASSWORD"
        : "missing TRANSMISSION_RPC_PASSWORD";
      throw new Error(
        `Transmission RPC ${method} auth failed: HTTP ${response.status}; ${authHint}`,
      );
    }
    throw new Error(`Transmission RPC ${method} failed: HTTP ${response.status} - ${body}`);
  }
  const data = (await response.json()) as TransmissionRpcResponse<T>;
  if (data.result !== "success")
    throw new Error(`Transmission RPC ${method} failed: ${data.result}`);
  return data;
}

async function transmissionRpc<T>(
  options: Pick<CleanTransmissionOptions, "password" | "rpcUrl" | "username">,
  method: string,
  args: Record<string, unknown> = {},
  sessionId?: string,
): Promise<TransmissionRpcResponse<T>> {
  const headers = buildTransmissionHeaders(options, sessionId);
  const response = await fetch(options.rpcUrl, {
    body: JSON.stringify({ method, arguments: args }),
    headers,
    method: "POST",
  });

  if (response.status === 409 && !sessionId) {
    const nextSessionId = response.headers.get("x-transmission-session-id");
    if (!nextSessionId) throw new Error("Transmission RPC requested session id but sent none");
    return await transmissionRpc<T>(options, method, args, nextSessionId);
  }

  return assertTransmissionResponse<T>(response, method, options.password);
}

function runTriage(options: CommandOptions): ResultAsync<void, ReturnType<typeof fail>> {
  return ResultAsync.fromSafePromise(
    (async () => {
      const findings: Finding[] = [];

      if (!(await pathExists(options.completeDir))) {
        findings.push({
          severity: "error",
          message: "Complete downloads directory missing.",
          path: options.completeDir,
        });
      }

      if (!(await pathExists(options.incompleteDir))) {
        findings.push({
          severity: "warn",
          message: "Incomplete downloads directory missing.",
          path: options.incompleteDir,
        });
      }

      const completeEntries = await walk(options.completeDir, { maxDepth: 3 });
      const incompleteEntries = await walk(options.incompleteDir, {
        maxDepth: 2,
      });
      const now = Date.now();
      const staleCutoff = now - options.staleDays * dayMs;

      const completeFolders = completeEntries.filter((entry) => entry.isDirectory);
      const incompleteFolders = incompleteEntries.filter((entry) => entry.isDirectory);
      const musicFiles = completeEntries.filter(
        (entry) => !entry.isDirectory && isMusicName(entry.name),
      );
      const junkFiles = [...completeEntries, ...incompleteEntries].filter((entry) =>
        isAppleJunk(entry.name),
      );
      const unsafeFiles = [...completeEntries, ...incompleteEntries].filter(
        (entry) => !entry.isDirectory && isUnsafeFile(entry.name),
      );
      const staleIncomplete = incompleteFolders.filter((entry) => entry.mtimeMs < staleCutoff);

      for (const entry of junkFiles.slice(0, 50)) {
        findings.push({
          severity: "info",
          message: "Apple metadata junk file found.",
          path: entry.path,
        });
      }

      for (const entry of unsafeFiles.slice(0, 50)) {
        findings.push({
          severity: "warn",
          message: "Unsafe executable or script file found in downloads.",
          path: entry.path,
        });
      }

      for (const entry of staleIncomplete.slice(0, 50)) {
        findings.push({
          severity: "warn",
          message: `Incomplete download older than ${options.staleDays} days.`,
          path: entry.path,
        });
      }

      const packCandidates = completeFolders.filter((folder) => {
        const childMusicCount = musicFiles.filter((file) =>
          file.path.startsWith(`${folder.path}/`),
        ).length;
        return childMusicCount >= 20;
      });

      for (const folder of packCandidates.slice(0, 50)) {
        findings.push({
          severity: "info",
          message: "Large music pack candidate; may need album-level import.",
          path: folder.path,
        });
      }

      printReport(
        {
          title: "Downloads triage",
          completeDir: options.completeDir,
          incompleteDir: options.incompleteDir,
          stats: {
            completeFolders: completeFolders.length,
            incompleteFolders: incompleteFolders.length,
            musicFiles: musicFiles.length,
            staleIncomplete: staleIncomplete.length,
            junkFiles: junkFiles.length,
            unsafeFiles: unsafeFiles.length,
            packCandidates: packCandidates.length,
          },
          findings,
        } satisfies DownloadsReport,
        options.json,
      );
    })(),
  );
}

function runCleanTransmission(
  options: CleanTransmissionOptions,
): ResultAsync<void, ReturnType<typeof fail>> {
  return ResultAsync.fromPromise(
    (async () => {
      const fields = [
        "id",
        "name",
        "hashString",
        "percentDone",
        "isFinished",
        "doneDate",
        "status",
        "downloadDir",
        "totalSize",
        "files",
      ];

      const torrents = (
        await transmissionRpc<{ torrents: TransmissionTorrent[] }>(options, "torrent-get", {
          fields,
        })
      ).arguments.torrents;

      const candidates = await findMovedCompletedTorrents(torrents, {
        completeDir: options.completeDir,
      });
      const findings: Finding[] = [];

      for (const candidate of candidates) {
        findings.push({
          severity: "info",
          message: options.dryRun
            ? "Would remove completed torrent record; downloaded files are already missing from complete directory."
            : "Removed completed torrent record; local data deletion was disabled.",
          path: `${candidate.id}: ${candidate.name}`,
        });
      }

      if (!options.dryRun && !options.yes) {
        findings.push({
          severity: "warn",
          message: "Removal requested without --yes; no torrent records were removed.",
        });
      }

      let removed = 0;
      if (!options.dryRun && options.yes && candidates.length > 0) {
        await transmissionRpc<Record<string, never>>(options, "torrent-remove", {
          ids: candidates.map((candidate) => candidate.id),
          "delete-local-data": false,
        });
        removed = candidates.length;
      }

      printReport(
        {
          title: "Transmission completed torrent cleanup",
          rpcUrl: options.rpcUrl,
          completeDir: options.completeDir,
          dryRun: options.dryRun,
          stats: {
            totalTorrents: torrents.length,
            candidates: candidates.length,
            removed,
            kept: torrents.length - candidates.length,
          },
          candidates,
          findings,
        } satisfies CleanTransmissionReport,
        options.json,
      );
    })(),
    (cause) => {
      const msg = cause instanceof Error ? cause.message : String(cause);
      return fail(`Transmission cleanup failed: ${msg}`, cause);
    },
  );
}

export default function downloadsCommand(program: Command): void {
  const downloads = program.command("downloads").description("Inspect NAS download workflows");

  downloads
    .command("triage")
    .description("Report stale, junk, and music-pack download candidates")
    .option(
      "--complete-dir <path>",
      "Completed downloads directory",
      NAS_PATHS.transmissionComplete,
    )
    .option(
      "--incomplete-dir <path>",
      "Incomplete downloads directory",
      NAS_PATHS.transmissionIncomplete,
    )
    .option("--stale-days <days>", "Incomplete age threshold", "14")
    .option("--json", "Print JSON report", false)
    .action(async (options: Record<string, unknown>) => {
      await runParsedCommand(
        optionsSchema,
        options,
        "Invalid downloads triage options",
        runTriage,
        (error) => {
          logError(`Downloads triage failed: ${formatError(error)}`);
          process.exit(1);
        },
      );
    });

  downloads
    .command("clean-transmission")
    .description("Remove completed Transmission torrent records whose files were already moved")
    .option(
      "--complete-dir <path>",
      "Host completed downloads directory",
      NAS_PATHS.transmissionComplete,
    )
    .option(
      "--rpc-url <url>",
      "Transmission RPC endpoint",
      "http://127.0.0.1:29091/transmission/rpc",
    )
    .option("--username <name>", "Transmission RPC username", env.TRANSMISSION_RPC_USERNAME)
    .option(
      "--password <password>",
      "Transmission RPC password; defaults to TRANSMISSION_RPC_PASSWORD",
      env.TRANSMISSION_RPC_PASSWORD,
    )
    .option("--dry-run", "Preview removals without changing Transmission", true)
    .option("--no-dry-run", "Remove matching torrent records")
    .option("--yes", "Confirm removal when --no-dry-run is set", false)
    .option("--json", "Print JSON report", false)
    .action(async (options: Record<string, unknown>) => {
      await runParsedCommand(
        cleanTransmissionOptionsSchema,
        options,
        "Invalid Transmission cleanup options",
        runCleanTransmission,
        (error) => {
          logError(formatError(error));
          process.exit(1);
        },
      );
    });

  downloads
    .command("add")
    .description("Add a torrent to Transmission (Magnet or URL)")
    .argument("<torrent>", "Magnet link or torrent file URL")
    .option(
      "--rpc-url <url>",
      "Transmission RPC endpoint",
      "http://127.0.0.1:29091/transmission/rpc",
    )
    .option("--username <name>", "Transmission RPC username", env.TRANSMISSION_RPC_USERNAME)
    .option(
      "--password <password>",
      "Transmission RPC password; defaults to TRANSMISSION_RPC_PASSWORD",
      env.TRANSMISSION_RPC_PASSWORD,
    )
    .option("--paused", "Add torrent in paused state", false)
    .action(async (torrent: string, options: Record<string, unknown>) => {
      await runParsedCommand(
        addTorrentOptionsSchema,
        { ...options, torrent },
        "Invalid add-torrent options",
        runAddTorrent,
        (error) => {
          logError(formatError(error));
          process.exit(1);
        },
      );
    });
}
