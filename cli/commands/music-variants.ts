import path from "node:path";
import { identifyAlbumCandidates, type WalkEntry, walk } from "@nas-tools/core";
import type { Command } from "commander";
import { parseFile } from "music-metadata";
import { ResultAsync } from "neverthrow";
import pc from "picocolors";
import { z } from "zod";

import { type fail, formatError, parseWith } from "../lib/fp.js";
import { planAlbumVariant, type VariantPlan } from "../lib/music-variants.js";
import { NAS_PATHS } from "../lib/report.js";
import { logError } from "../lib/utils.js";

const optionsSchema = z.object({
  root: z.string().optional().default(NAS_PATHS.flac),
  all: z.boolean().optional().default(false),
  json: z.boolean().optional().default(false),
});

type CommandOptions = z.infer<typeof optionsSchema>;

type AlbumMetadata = {
  path: string;
  album: string;
  releaseCountry?: string | undefined;
  date?: string | undefined;
  originalDate?: string | undefined;
  catalogNumber?: string | undefined;
  barcode?: string | undefined;
  releaseType?: string[] | undefined;
  musicBrainzAlbumId?: string | undefined;
  musicBrainzReleaseGroupId?: string | undefined;
  fileCount: number;
};

type VariantsReport = {
  root: string;
  scannedAlbums: number;
  proposals: VariantPlan[];
  alreadyTagged: VariantPlan[];
};

async function collectVariantPlans(
  albumRoots: string[],
  entries: WalkEntry[],
): Promise<VariantPlan[]> {
  const plans: VariantPlan[] = [];
  const batchSize = 10;
  for (let i = 0; i < albumRoots.length; i += batchSize) {
    const batch = albumRoots.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map((albumRoot) => readAlbumMetadata(albumRoot, entries)),
    );
    for (const metadata of batchResults) {
      if (!metadata) continue;
      plans.push(planAlbumVariant(metadata));
    }
  }
  return plans;
}

function run(options: CommandOptions): ResultAsync<void, ReturnType<typeof fail>> {
  return walk(options.root, { maxDepth: 4 })
    .mapErr((error) => ({ type: "fail", message: error.message }) as const)
    .andThen((entries) =>
      ResultAsync.fromPromise(
        (async () => {
          const candidates = identifyAlbumCandidates(entries, options.root);
          const albumRoots = [...new Set(candidates.map((album) => album.path))];

          if (!options.json) {
            console.log(pc.cyan(`Scanning ${albumRoots.length} album roots for variant hints...`));
          }

          const plans = await collectVariantPlans(albumRoots, entries);
          const proposals = plans.filter((plan) => plan.status === "propose");
          const alreadyTagged = plans.filter((plan) => plan.status === "already-tagged");
          const report: VariantsReport = {
            root: options.root,
            scannedAlbums: albumRoots.length,
            proposals,
            alreadyTagged,
          };

          if (options.json) {
            console.log(JSON.stringify(report, null, 2));
            return;
          }

          printReport(report, options.all);
        })(),
        (cause) => ({ type: "fail", message: String(cause) }) as const,
      ),
    );
}

async function readAlbumMetadata(
  albumRoot: string,
  entries: WalkEntry[],
): Promise<AlbumMetadata | undefined> {
  const musicFiles = entries
    .filter((entry) => {
      if (entry.isDirectory) return false;
      const relative = path.relative(albumRoot, entry.path);
      return (
        relative !== "" &&
        !relative.startsWith("..") &&
        !path.isAbsolute(relative) &&
        isMusicFile(entry.name)
      );
    })
    .map((entry) => entry.path)
    .sort();

  if (musicFiles.length === 0) return undefined;

  for (const filePath of musicFiles) {
    try {
      const metadata = await parseFile(filePath);
      const album = metadata.common.album?.trim();
      if (!album) continue;

      return {
        path: albumRoot,
        album,
        releaseCountry: metadata.common.releasecountry,
        date: metadata.common.releasedate || metadata.common.date,
        originalDate: metadata.common.originaldate,
        catalogNumber: metadata.common.catalognumber?.[0],
        barcode: metadata.common.barcode,
        releaseType: metadata.common.releasetype,
        musicBrainzAlbumId: metadata.common.musicbrainz_albumid,
        musicBrainzReleaseGroupId: metadata.common.musicbrainz_releasegroupid,
        fileCount: musicFiles.length,
      };
    } catch (_error) {
      // Try next file in album root.
    }
  }

  return undefined;
}

function isMusicFile(name: string): boolean {
  return /\.(flac|mp3|m4a|wav|ogg|wv)$/i.test(name);
}

function printReport(report: VariantsReport, includeAlreadyTagged: boolean): void {
  console.log(pc.bold("Music variant plan"));
  console.log(`Root: ${report.root}`);
  console.log(`Albums scanned: ${report.scannedAlbums}`);
  console.log(`Proposals: ${report.proposals.length}`);
  console.log(`Already tagged: ${report.alreadyTagged.length}`);

  for (const proposal of report.proposals) {
    console.log(pc.yellow(`\n${proposal.path}`));
    console.log(`  ${pc.dim("current:")}  ${proposal.currentAlbum}`);
    console.log(`  ${pc.green("proposed:")} ${proposal.proposedAlbum}`);
    console.log(`  ${pc.dim("why:")}      ${proposal.reasons.join("; ")}`);
  }

  if (includeAlreadyTagged) {
    for (const plan of report.alreadyTagged) {
      console.log(pc.cyan(`\n${plan.path}`));
      console.log(`  ${pc.dim("already:")} ${plan.currentAlbum}`);
      console.log(`  ${pc.dim("why:")}     ${plan.reasons.join("; ")}`);
    }
  }

  if (report.proposals.length > 0) {
    console.log(pc.bold("\nNo tags changed. This command only plans variant album titles."));
  }
}

export default function musicVariantsCommand(program: Command): void {
  program
    .command("music-variants")
    .description("Plan Plex-friendly album variant titles from FLAC metadata")
    .option("--root <path>", "Music library root", NAS_PATHS.flac)
    .option("--all", "Show already-tagged variants too", false)
    .option("--json", "Print JSON report", false)
    .action(async (options: Record<string, unknown>) => {
      const result = await parseWith(
        optionsSchema,
        options,
        "Invalid music-variants options",
      ).asyncAndThen(run);

      result.match(
        () => undefined,
        (error) => {
          logError(`Music variants failed: ${formatError(error)}`);
          process.exit(1);
        },
      );
    });
}
