import { mkdir, rename } from "node:fs/promises";
import path from "node:path";
import type { Command } from "commander";
import {
  findDuplicates,
  getAlbumInfo,
  identifyDedupeMoves,
  scoreAlbum,
  walk,
  type AlbumFolder,
} from "@nas-tools/core";
import { ok, ResultAsync } from "neverthrow";
import pc from "picocolors";
import { z } from "zod";

import { type fail, formatError, parseWith } from "../lib/fp.js";
import {
  isMusicName,
  NAS_PATHS,
} from "../lib/report.js";
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
    .mapErr((error) => ({ type: "fail", message: error.message } as const))
    .andThen((entries) => {
      const folderPaths = [...new Set(
        entries
          .filter((e) => !e.isDirectory && isMusicName(e.name))
          .map((e) => path.dirname(e.path))
      )].filter((f) => !f.includes("_duplicates"));

      return ResultAsync.fromPromise((async () => {
        console.log(pc.cyan(`Indexing ${folderPaths.length} albums...`));

        const albums: AlbumFolder[] = [];
        const batchSize = 10;
        for (let i = 0; i < folderPaths.length; i += batchSize) {
          const batch = folderPaths.slice(i, i + batchSize);
          const batchTasks = batch.map((folder) =>
            getAlbumInfo(folder)
              .map((maybeAlbum) => {
                if (maybeAlbum.isNothing) return;
                const album = maybeAlbum.value;
                album.totalSize = entries
                  .filter((e) => path.dirname(e.path) === folder && !e.isDirectory)
                  .reduce((sum, e) => sum + e.size, 0);
                albums.push(album);
              })
              .orElse((error) => {
                logError(`Skipping album at ${folder}: ${error.message}`);
                return ok(undefined);
              }),
          );
          await ResultAsync.combine(batchTasks);
          if (i > 0 && i % 100 === 0) {
            process.stdout.write(pc.dim(`  Processed ${i}/${folderPaths.length}...\r`));
          }
        }
        console.log(pc.cyan(`\nAnalyzed ${albums.length} albums.`));
        return albums;
      })(), (e) => ({ type: "fail", message: String(e) } as const));
    })
    .andThen((albums) => {
      const groups = findDuplicates(albums);
      
      if (groups.size === 0) {
        console.log(pc.green("No duplicates found."));
        return ok(undefined);
      }

      for (const group of groups.values()) {
        group.sort((a, b) => scoreAlbum(b) - scoreAlbum(a));
        const winner = group[0];
        if (!winner) continue;

        const losers = group.slice(1);

        console.log(pc.yellow(`\nRelease: ${winner.release.artist} - ${winner.release.album}`));
        console.log(pc.green(`  [KEEP] ${winner.path} (${winner.trackCount} tracks, ${winner.bitsPerSample}bit/${winner.sampleRate}Hz)`));
        for (const loser of losers) {
          console.log(pc.red(`  [MOVE] ${loser.path} (${loser.trackCount} tracks, ${loser.bitsPerSample}bit/${loser.sampleRate}Hz)`));
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
          (e) => ({ type: "fail", message: `Failed to move ${task.from}: ${e}` } as const)
        )
      );

      return ResultAsync.combine(moveTasks).map(() => {
        console.log(pc.bold("\nDeduplication complete."));
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
