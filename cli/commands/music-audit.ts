import { dirname } from "node:path";
import type { Command } from "commander";
import { ResultAsync } from "neverthrow";
import { z } from "zod";

import { type fail, formatError, parseWith } from "../lib/fp.js";
import {
  type Finding,
  isAppleJunk,
  isCueName,
  isMusicName,
  NAS_PATHS,
  pathExists,
  printReport,
  safeReadDir,
  walk,
} from "../lib/report.js";
import { logError } from "../lib/utils.js";

const optionsSchema = z.object({
  json: z.boolean().optional().default(false),
  root: z.string().optional().default(NAS_PATHS.flac),
});

type CommandOptions = z.infer<typeof optionsSchema>;

interface MusicAuditReport {
  title: string;
  root: string;
  stats: {
    folders: number;
    musicFiles: number;
    cueFiles: number;
    cuePairs: number;
    appleJunk: number;
    emptyFolders: number;
    wrongBuckets: number;
  };
  findings: Finding[];
}

const bucketPatterns = [
  { name: "A-D", pattern: /^[A-D]/i },
  { name: "E-F", pattern: /^[E-F]/i },
  { name: "G-I", pattern: /^[G-I]/i },
  { name: "J-M", pattern: /^[J-M]/i },
  { name: "N-Q", pattern: /^[N-Q]/i },
  { name: "R-T", pattern: /^[R-T]/i },
  { name: "U-Z", pattern: /^[U-Z]/i },
] as const;

function expectedBucket(name: string): string | undefined {
  return bucketPatterns.find((bucket) => bucket.pattern.test(name))?.name;
}

function normalizeArtistFolder(name: string): string {
  return name.replace(/^the\s+/i, "").trim();
}

function run(options: CommandOptions): ResultAsync<void, ReturnType<typeof fail>> {
  return ResultAsync.fromSafePromise(
    (async () => {
      const findings: Finding[] = [];
      if (!(await pathExists(options.root))) {
        findings.push({
          severity: "error",
          message: "Music library root missing.",
          path: options.root,
        });
        printReport(
          {
            title: "Music audit",
            root: options.root,
            stats: {
              folders: 0,
              musicFiles: 0,
              cueFiles: 0,
              cuePairs: 0,
              appleJunk: 0,
              emptyFolders: 0,
              wrongBuckets: 0,
            },
            findings,
          } satisfies MusicAuditReport,
          options.json,
        );
        return;
      }

      const entries = await walk(options.root, { maxDepth: 4 });
      const folders = entries.filter((entry) => entry.isDirectory);
      const files = entries.filter((entry) => !entry.isDirectory);
      const musicFiles = files.filter((entry) => isMusicName(entry.name));
      const cueFiles = files.filter((entry) => isCueName(entry.name));
      const appleJunk = files.filter((entry) => isAppleJunk(entry.name));
      const emptyFolders = (
        await Promise.all(
          folders.map(async (folder) => ({
            folder,
            childCount: (await safeReadDir(folder.path)).length,
          })),
        )
      )
        .filter(({ childCount }) => childCount === 0)
        .map(({ folder }) => folder);

      for (const entry of appleJunk.slice(0, 50)) {
        findings.push({
          severity: "info",
          message: "Apple metadata junk file found.",
          path: entry.path,
        });
      }

      for (const folder of emptyFolders.slice(0, 50)) {
        findings.push({
          severity: "info",
          message: "Empty folder found.",
          path: folder.path,
        });
      }

      const cuePairDirs = new Set<string>();
      const cuePairs = cueFiles.filter((cue) => {
        const base = cue.name.replace(/\.cue$/i, "").toLowerCase();
        const siblingMusic = musicFiles.filter((file) => dirname(file.path) === dirname(cue.path));
        const hasPair = siblingMusic.some(
          (file) => file.name.toLowerCase().replace(/\.(flac|wav)$/i, "") === base,
        );
        if (hasPair) {
          cuePairDirs.add(dirname(cue.path));
        }
        return hasPair;
      });

      for (const path of [...cuePairDirs].slice(0, 50)) {
        findings.push({
          severity: "warn",
          message: "Unsplit CUE/audio pair candidate.",
          path,
        });
      }

      const rootPrefix = `${options.root}/`;
      const wrongBuckets = folders.filter((folder) => {
        const relative = folder.path.slice(rootPrefix.length);
        const [bucket, artist] = relative.split("/");
        if (!bucket || !artist || relative.split("/").length !== 2) {
          return false;
        }

        const expected = expectedBucket(normalizeArtistFolder(artist));
        return Boolean(expected && bucket !== expected);
      });

      for (const folder of wrongBuckets.slice(0, 50)) {
        findings.push({
          severity: "warn",
          message: "Artist folder appears under wrong alphabet bucket.",
          path: folder.path,
        });
      }

      printReport(
        {
          title: "Music audit",
          root: options.root,
          stats: {
            folders: folders.length,
            musicFiles: musicFiles.length,
            cueFiles: cueFiles.length,
            cuePairs: cuePairs.length,
            appleJunk: appleJunk.length,
            emptyFolders: emptyFolders.length,
            wrongBuckets: wrongBuckets.length,
          },
          findings,
        } satisfies MusicAuditReport,
        options.json,
      );
    })(),
  );
}

export default function musicAuditCommand(program: Command): void {
  program
    .command("music-audit")
    .description("Audit FLAC library structure and import hygiene")
    .option("--root <path>", "Music library root", NAS_PATHS.flac)
    .option("--json", "Print JSON report", false)
    .action(async (options: Record<string, unknown>) => {
      const result = await parseWith(
        optionsSchema,
        options,
        "Invalid music-audit options",
      ).asyncAndThen(run);

      result.match(
        () => undefined,
        (error) => {
          logError(`Music audit failed: ${formatError(error)}`);
          process.exit(1);
        },
      );
    });
}
