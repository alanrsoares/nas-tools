import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import pc from "picocolors";

import { safeAsync } from "./fp.js";

export const NAS_PATHS = {
  appCentral: "/usr/local/AppCentral",
  docker: "/volume1/Docker",
  download: "/volume1/Download",
  flac: "/volume1/Public/FLAC",
  movies: "/volume1/Public/Movies",
  plexDb:
    "/volume1/Plex/Library/Plex Media Server/Plug-in Support/Databases/com.plexapp.plugins.library.db",
  public: "/volume1/Public",
  transmissionComplete: "/volume1/Download/Transmission/complete",
  transmissionIncomplete: "/volume1/Download/Transmission/incomplete",
  tv: "/volume1/Public/TV Series & Documentaries",
} as const;

export interface Finding {
  severity: "info" | "warn" | "error";
  path?: string;
  message: string;
}

export interface WalkEntry {
  path: string;
  name: string;
  isDirectory: boolean;
  size: number;
  mtimeMs: number;
}

export function printReport<T>(report: T, json: boolean): void {
  if (json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(pc.bold(String((report as { title?: string }).title ?? "Report")));
  const findings = (report as { findings?: Finding[] }).findings ?? [];

  if (findings.length === 0) {
    console.log(pc.green("No findings."));
    return;
  }

  for (const finding of findings) {
    const marker =
      finding.severity === "error"
        ? pc.red("error")
        : finding.severity === "warn"
          ? pc.yellow("warn")
          : pc.blue("info");
    console.log(`${marker}: ${finding.message}`);
    if (finding.path) {
      console.log(`  ${finding.path}`);
    }
  }
}

export async function pathExists(path: string): Promise<boolean> {
  return await safeAsync(() => stat(path), `stat ${path}`)
    .map(() => true)
    .unwrapOr(false);
}

export async function safeReadDir(path: string): Promise<string[]> {
  return await safeAsync(() => readdir(path), `read ${path}`).unwrapOr([]);
}

async function visitDir(
  dir: string,
  depth: number,
  maxDepth: number,
  includeHidden: boolean,
): Promise<WalkEntry[]> {
  if (depth > maxDepth) return [];
  const names = await safeReadDir(dir);
  const entries: WalkEntry[] = [];
  for (const name of names) {
    if (!includeHidden && name.startsWith(".")) continue;
    const entryPath = join(dir, name);
    const entryStat = await safeAsync(() => stat(entryPath), `stat ${entryPath}`).unwrapOr(
      undefined,
    );
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
      entries.push(...(await visitDir(entryPath, depth + 1, maxDepth, includeHidden)));
  }
  return entries;
}

export async function walk(
  root: string,
  options: { maxDepth?: number; includeHidden?: boolean } = {},
): Promise<WalkEntry[]> {
  return visitDir(root, 0, options.maxDepth ?? Infinity, options.includeHidden ?? false);
}

export const isAppleJunk = (name: string): boolean => name === ".DS_Store" || name.startsWith("._");

export const isMusicName = (name: string): boolean => /\.(flac|mp3|m4a|wav|ogg)$/i.test(name);

export const isCueName = (name: string): boolean => /\.cue$/i.test(name);
