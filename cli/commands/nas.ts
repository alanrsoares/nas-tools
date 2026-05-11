import { rm } from "node:fs/promises";
import { Command } from "commander";
import { ResultAsync } from "neverthrow";
import { z } from "zod";

import { fail, formatError, parseWith, safeAsync } from "../lib/fp.js";
import {
  isAppleJunk,
  NAS_PATHS,
  pathExists,
  printReport,
  walk,
  type Finding,
} from "../lib/report.js";
import { logError, logInfo, logSuccess } from "../lib/utils.js";

const cleanOptionsSchema = z.object({
  dryRun: z.boolean().optional().default(true),
  json: z.boolean().optional().default(false),
  root: z.string().optional().default("/volume1"),
  yes: z.boolean().optional().default(false),
});

type CleanOptions = z.infer<typeof cleanOptionsSchema>;

interface CleanReport {
  title: string;
  root: string;
  dryRun: boolean;
  stats: {
    candidates: number;
    deleted: number;
  };
  findings: Finding[];
}

const allowedRoots = [
  "/volume1/Download",
  "/volume1/Public",
  "/volume1/home",
  "/volume1/Web",
  "/volume1",
] as const;

function isAllowedRoot(root: string): boolean {
  return allowedRoots.some(
    (allowed) => root === allowed || root.startsWith(`${allowed}/`),
  );
}

function runClean(
  options: CleanOptions,
): ResultAsync<void, ReturnType<typeof fail>> {
  return ResultAsync.fromSafePromise(
    (async () => {
      const findings: Finding[] = [];
      let deleted = 0;

      if (!isAllowedRoot(options.root)) {
        findings.push({
          severity: "error",
          message: "Refusing cleanup outside approved /volume1 roots.",
          path: options.root,
        });
        printReport(
          {
            title: "NAS clean",
            root: options.root,
            dryRun: true,
            stats: { candidates: 0, deleted: 0 },
            findings,
          } satisfies CleanReport,
          options.json,
        );
        return;
      }

      if (!(await pathExists(options.root))) {
        findings.push({
          severity: "error",
          message: "Cleanup root missing.",
          path: options.root,
        });
      }

      const entries = await walk(options.root, {
        includeHidden: true,
        maxDepth: options.root === "/volume1" ? 4 : 6,
      });
      const candidates = entries.filter(
        (entry) =>
          !entry.isDirectory &&
          (isAppleJunk(entry.name) ||
            (entry.name.endsWith(".part") &&
              entry.path.includes("/#Recycle/"))),
      );

      for (const candidate of candidates.slice(0, 100)) {
        findings.push({
          severity: "info",
          message: options.dryRun
            ? "Would delete cleanup candidate."
            : "Cleanup candidate.",
          path: candidate.path,
        });
      }

      const shouldDelete = !options.dryRun && options.yes;
      if (!options.dryRun && !options.yes) {
        findings.push({
          severity: "warn",
          message: "Deletion requested without --yes; no files deleted.",
        });
      }

      if (shouldDelete) {
        for (const candidate of candidates) {
          await safeAsync(
            () => rm(candidate.path, { force: true }),
            `delete ${candidate.path}`,
          ).map(() => {
            deleted++;
          });
        }
      }

      printReport(
        {
          title: "NAS clean",
          root: options.root,
          dryRun: !shouldDelete,
          stats: {
            candidates: candidates.length,
            deleted,
          },
          findings,
        } satisfies CleanReport,
        options.json,
      );

      if (shouldDelete) {
        logSuccess(`Deleted ${deleted} cleanup candidates.`);
      } else if (candidates.length > 0 && !options.json) {
        logInfo("Dry-run only. Use --no-dry-run --yes to delete.");
      }
    })(),
  );
}

export default function nasCommand(program: Command): void {
  const nas = program.command("nas").description("NAS housekeeping tools");

  nas
    .command("clean")
    .description("Find or delete safe cleanup candidates")
    .option("--root <path>", "Cleanup root", NAS_PATHS.download)
    .option("--dry-run", "Preview changes", true)
    .option("--no-dry-run", "Allow deletion when combined with --yes")
    .option("-y, --yes", "Confirm deletion", false)
    .option("--json", "Print JSON report", false)
    .action(async (options: Record<string, unknown>) => {
      const result = await parseWith(
        cleanOptionsSchema,
        options,
        "Invalid nas clean options",
      ).asyncAndThen(runClean);

      result.match(
        () => undefined,
        (error) => {
          logError(`NAS clean failed: ${formatError(error)}`);
          process.exit(1);
        },
      );
    });
}
