import type { Command } from "commander";
import { z } from "zod";

import { runCueTriage, runTempSplitClean, runTempSplitTriage } from "../lib/cue/triage.js";
import { formatError, runParsedCommand } from "../lib/fp.js";
import { NAS_PATHS } from "../lib/report.js";
import { logError } from "../lib/utils.js";

const optionsSchema = z.object({
  includeFiles: z.boolean().optional().default(false),
  json: z.boolean().optional().default(false),
  limit: z.coerce.number().int().nonnegative().optional().default(25),
  maxDepth: z.coerce.number().int().positive().optional().default(4),
  root: z.string().optional().default(NAS_PATHS.flac),
});

const cleanOptionsSchema = optionsSchema.extend({
  dryRun: z.boolean().optional().default(true),
  yes: z.boolean().optional().default(false),
});

export default function cueCommand(program: Command): void {
  const cue = program.command("cue").description("CUE sheet workflows");
  const tempSplit = cue.command("temp-split").description("Inspect __temp_split leftovers");

  cue
    .command("triage")
    .description("Classify CUE/audio directories before splitting")
    .option("--root <path>", "Music library root", NAS_PATHS.flac)
    .option("--max-depth <number>", "Maximum directory walk depth", "4")
    .option("--limit <number>", "Detailed groups to include; 0 means all", "25")
    .option("--include-files", "Include cue/audio file lists in groups", false)
    .option("--json", "Print JSON report", false)
    .action(async (options: Record<string, unknown>) => {
      await runParsedCommand(
        optionsSchema,
        options,
        "Invalid cue triage options",
        runCueTriage,
        (error) => {
          logError(`CUE triage failed: ${formatError(error)}`);
          process.exit(1);
        },
      );
    });

  tempSplit
    .command("triage")
    .description("Classify __temp_split directories before cleanup")
    .option("--root <path>", "Music library root", NAS_PATHS.flac)
    .option("--max-depth <number>", "Maximum directory walk depth", "4")
    .option("--limit <number>", "Detailed groups to include; 0 means all", "25")
    .option("--include-files", "Include temp file lists in groups", false)
    .option("--json", "Print JSON report", false)
    .action(async (options: Record<string, unknown>) => {
      await runParsedCommand(
        optionsSchema,
        options,
        "Invalid cue temp-split triage options",
        runTempSplitTriage,
        (error) => {
          logError(`CUE temp-split triage failed: ${formatError(error)}`);
          process.exit(1);
        },
      );
    });

  tempSplit
    .command("clean")
    .description("Remove empty __temp_split directories")
    .option("--root <path>", "Music library root", NAS_PATHS.flac)
    .option("--max-depth <number>", "Maximum directory walk depth", "4")
    .option("--limit <number>", "Detailed results to include; 0 means all", "25")
    .option("--dry-run", "Preview deletions", true)
    .option("--no-dry-run", "Allow deletion when combined with --yes")
    .option("--yes", "Confirm deletion when combined with --no-dry-run", false)
    .option("--json", "Print JSON report", false)
    .action(async (options: Record<string, unknown>) => {
      await runParsedCommand(
        cleanOptionsSchema,
        options,
        "Invalid cue temp-split clean options",
        runTempSplitClean,
        (error) => {
          logError(`CUE temp-split clean failed: ${formatError(error)}`);
          process.exit(1);
        },
      );
    });
}
