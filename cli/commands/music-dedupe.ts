import { mkdir, rename } from "node:fs/promises";
import path from "node:path";
import {
  type AlbumFolder,
  findDuplicates,
  getAlbumInfo,
  identifyAlbumCandidates,
  identifyDedupeMoves,
  scoreAlbum,
  walk,
} from "@nas-tools/core";
import type { Command } from "commander";
import { ok, ResultAsync } from "neverthrow";
import pc from "picocolors";
import { z } from "zod";

import { type fail, formatError, parseWith } from "../lib/fp.js";
import { NAS_PATHS } from "../lib/report.js";
import { logError } from "../lib/utils.js";

const optionsSchema = z.object({
  root: z.string().optional().default(NAS_PATHS.flac),
  apply: z.boolean().optional().default(false),
  json: z.boolean().optional().default(false),
});

type CommandOptions = z.infer<typeof optionsSchema>;

function run(options: CommandOptions): ResultAsync<void, ReturnType<typeof fail>> {
  const trashRoot = path.join(options.root, "_duplicates");

  console.log(pc.cyan(`Scanning ${options.root}...`));

  return walk(options.root, { maxDepth: 4 })
    .mapErr((error) => ({ type: "fail", message: error.message }) as const)
    .andThen((entries) => {
      // 1. Identify candidates cheaply using folder names and track counts
      const candidates = identifyAlbumCandidates(entries);
      console.log(
        pc.cyan(`Found ${candidates.length} albums. Identifying potential duplicates...`),
      );

      const initialGroups = findDuplicates(candidates);
      const suspectFolders = [...new Set([...initialGroups.values()].flat().map((a) => a.path))];

      if (suspectFolders.length === 0) {
        return ok([] as AlbumFolder[]);
      }

      console.log(
        pc.yellow(`Suspect duplicates in ${suspectFolders.length} folders. Verifying durations...`),
      );

      // 2. Perform expensive fingerprinting ONLY on suspect folders
      return ResultAsync.fromPromise(
        (async () => {
          const verifiedAlbums: AlbumFolder[] = [];
          const batchSize = 10;

          for (let i = 0; i < suspectFolders.length; i += batchSize) {
            const batch = suspectFolders.slice(i, i + batchSize);
            const tasks = batch.map((folder) =>
              getAlbumInfo(folder)
                .map((maybeAlbum) => {
                  if (maybeAlbum.isJust) {
                    const album = maybeAlbum.value;
                    album.totalSize = entries
                      .filter((e) => path.dirname(e.path) === folder && !e.isDirectory)
                      .reduce((sum, e) => sum + e.size, 0);
                    verifiedAlbums.push(album);
                    console.log(
                      pc.dim(
                        `  Analyzed: ${album.release.artist} - ${album.release.album} [FP: ${album.release.fingerprint}]`,
                      ),
                    );
                  }
                  return undefined;
                })
                .orElse((error) => {
                  logError(`Skipping album at ${folder}: ${error.message}`);
                  return ok(undefined);
                }),
            );
            await ResultAsync.combine(tasks);
            process.stdout.write(
              pc.dim(
                `  Verified ${Math.min(i + batchSize, suspectFolders.length)}/${suspectFolders.length}...\r`,
              ),
            );
          }
          console.log(pc.cyan(`\nVerification complete.`));
          return verifiedAlbums;
        })(),
        (e) => ({ type: "fail", message: String(e) }) as const,
      );
    })
    .andThen((albums) => {
      const groups = findDuplicates(albums);

      if (groups.size === 0) {
        console.log(pc.green("No duplicates found after duration verification."));
        return ok(undefined);
      }

      for (const group of groups.values()) {
        group.sort((a, b) => scoreAlbum(b) - scoreAlbum(a));
        const winner = group[0];
        if (!winner) continue;

        const losers = group.slice(1);

        console.log(pc.yellow(`\nRelease: ${winner.release.artist} - ${winner.release.album}`));
        console.log(
          pc.green(
            `  [KEEP] ${winner.path} (${winner.trackCount} tracks, ${winner.bitsPerSample}bit/${winner.sampleRate}Hz)`,
          ),
        );
        for (const loser of losers) {
          console.log(
            pc.red(
              `  [MOVE] ${loser.path} (${loser.trackCount} tracks, ${loser.bitsPerSample}bit/${loser.sampleRate}Hz)`,
            ),
          );
        }
      }

      const toMove = identifyDedupeMoves(groups, options.root, trashRoot);

      if (toMove.length === 0) {
        console.log(pc.green("\nNo folders to move."));
        return ok(undefined);
      }

      if (!options.apply) {
        console.log(pc.bold(`\nDry run: ${toMove.length} folders would be moved to ${trashRoot}`));
        console.log(pc.cyan("Use --apply to perform the move."));
        return ok(undefined);
      }

      console.log(pc.bold(`\nMoving ${toMove.length} folders...`));

      const moveTasks = toMove.map((task) =>
        ResultAsync.fromPromise(
          (async () => {
            await mkdir(path.dirname(task.to), { recursive: true });
            await rename(task.from, task.to);
            console.log(pc.green(`  Moved: ${path.basename(task.from)}`));
          })(),
          (e) => ({ type: "fail", message: `Failed to move ${task.from}: ${e}` }) as const,
        ),
      );

      return ResultAsync.combine(moveTasks).map(() => {
        console.log(pc.bold("\nDeduplication complete."));
        return undefined;
      });
    });
}

export default function musicDedupeCommand(program: Command): void {
  program
    .command("music-dedupe")
    .description("Find and deduplicate music releases keeping best quality")
    .option("--root <path>", "Music library root", NAS_PATHS.flac)
    .option("--apply", "Actually move folders to _duplicates", false)
    .option("--json", "Print JSON report", false)
    .action(async (options: Record<string, unknown>) => {
      const result = await parseWith(
        optionsSchema,
        options,
        "Invalid music-dedupe options",
      ).asyncAndThen(run);

      result.match(
        () => undefined,
        (error) => {
          logError(`Music dedupe failed: ${formatError(error)}`);
          process.exit(1);
        },
      );
    });
}
