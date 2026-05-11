import { Command } from "commander";
import { ResultAsync } from "neverthrow";
import { z } from "zod";

import { fail, formatError, parseWith } from "../lib/fp.js";
import {
  isAppleJunk,
  isMusicName,
  NAS_PATHS,
  pathExists,
  printReport,
  walk,
  type Finding,
} from "../lib/report.js";
import { logError } from "../lib/utils.js";

const optionsSchema = z.object({
  completeDir: z.string().optional().default(NAS_PATHS.transmissionComplete),
  incompleteDir: z
    .string()
    .optional()
    .default(NAS_PATHS.transmissionIncomplete),
  json: z.boolean().optional().default(false),
  staleDays: z.coerce.number().int().positive().optional().default(14),
});

type CommandOptions = z.infer<typeof optionsSchema>;

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
    packCandidates: number;
  };
  findings: Finding[];
}

const dayMs = 24 * 60 * 60 * 1000;

function runTriage(
  options: CommandOptions,
): ResultAsync<void, ReturnType<typeof fail>> {
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

      const completeFolders = completeEntries.filter(
        (entry) => entry.isDirectory,
      );
      const incompleteFolders = incompleteEntries.filter(
        (entry) => entry.isDirectory,
      );
      const musicFiles = completeEntries.filter(
        (entry) => !entry.isDirectory && isMusicName(entry.name),
      );
      const junkFiles = [...completeEntries, ...incompleteEntries].filter(
        (entry) => isAppleJunk(entry.name),
      );
      const staleIncomplete = incompleteFolders.filter(
        (entry) => entry.mtimeMs < staleCutoff,
      );

      for (const entry of junkFiles.slice(0, 50)) {
        findings.push({
          severity: "info",
          message: "Apple metadata junk file found.",
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
            packCandidates: packCandidates.length,
          },
          findings,
        } satisfies DownloadsReport,
        options.json,
      );
    })(),
  );
}

export default function downloadsCommand(program: Command): void {
  const downloads = program
    .command("downloads")
    .description("Inspect NAS download workflows");

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
      const result = await parseWith(
        optionsSchema,
        options,
        "Invalid downloads triage options",
      ).asyncAndThen(runTriage);

      result.match(
        () => undefined,
        (error) => {
          logError(`Downloads triage failed: ${formatError(error)}`);
          process.exit(1);
        },
      );
    });
}
