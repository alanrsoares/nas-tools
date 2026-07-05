import { ResultAsync } from "@onrails/result";
import type { Command } from "commander";
import got from "got";
import { z } from "zod";

import { env } from "../lib/env.js";
import { type AppError, fail, formatError, runParsedCommand } from "../lib/fp.js";
import { type Finding, printReport } from "../lib/report.js";
import { logError } from "../lib/utils.js";

const searchOptionsSchema = z.object({
  apiKey: z.string().optional().default(env.PROWLARR_API_KEY),
  baseUrl: z.string().url().optional().default(env.PROWLARR_URL),
  categories: z.array(z.coerce.number()).optional(),
  set: z.string().optional().default("music"),
  json: z.boolean().optional().default(false),
  query: z.string(),
});

type SearchOptions = z.infer<typeof searchOptionsSchema>;

export interface ProwlarrSearchResult {
  title: string;
  size: number;
  indexer: string;
  seeders: number;
  leechers: number;
  downloadUrl?: string;
  infoUrl?: string;
  publishDate?: string;
}

interface ProwlarrSearchReport {
  title: string;
  query: string;
  baseUrl: string;
  stats: {
    results: number;
    totalSeeders: number;
  };
  results: ProwlarrSearchResult[];
  findings: Finding[];
}

export function getDefaultCategorySet(setName: string): string {
  switch (setName) {
    case "MUSIC":
      return env.PROWLARR_CATEGORY_SET_MUSIC;
    case "MOVIES":
      return env.PROWLARR_CATEGORY_SET_MOVIES;
    case "TV":
      return env.PROWLARR_CATEGORY_SET_TV;
    case "AUDIOBOOK":
      return env.PROWLARR_CATEGORY_SET_AUDIOBOOK;
    case "EBOOK":
      return env.PROWLARR_CATEGORY_SET_EBOOK;
    default:
      throw new Error(
        `Unknown category set: ${setName}. Define PROWLARR_CATEGORY_SET_${setName} in environment to use it.`,
      );
  }
}

function runSearch(options: SearchOptions): ResultAsync<void, AppError> {
  return ResultAsync.fromPromise(
    (async () => {
      const findings: Finding[] = [];
      const results: ProwlarrSearchResult[] = [];

      if (!options.apiKey) {
        throw new Error("PROWLARR_API_KEY is required");
      }

      let categoryIds: number[] = [];
      if (options.categories && options.categories.length > 0) {
        categoryIds = options.categories;
      } else {
        const setName = (options.set ?? "music").toUpperCase();
        const envVarName = `PROWLARR_CATEGORY_SET_${setName}`;
        const configStr = process.env[envVarName] ?? getDefaultCategorySet(setName);
        categoryIds = configStr
          .split(",")
          .map((s) => Number.parseInt(s.trim(), 10))
          .filter((n) => !Number.isNaN(n));
      }

      const searchParams = new URLSearchParams();
      searchParams.set("query", options.query);
      for (const cat of categoryIds) {
        searchParams.append("categories", cat.toString());
      }

      const response = await got
        .get(`${options.baseUrl}/api/v1/search`, {
          headers: {
            "X-Api-Key": options.apiKey,
          },
          searchParams,
        })
        .json<ProwlarrSearchResult[]>();

      for (const item of response) {
        results.push(item);
      }

      // Sort by seeders descending
      results.sort((a, b) => b.seeders - a.seeders);

      if (!options.json) {
        console.log(`\n🔎 Prowlarr Search: "${options.query}"`);
        console.log(`${"Indexer".padEnd(20)} ${"Seed".padEnd(5)} ${"Size".padEnd(8)} Title`);
        console.log("-".repeat(80));
        for (const r of results.slice(0, 20)) {
          const sizeStr = `${(r.size / (1024 * 1024)).toFixed(0)}MB`;
          console.log(
            `${(r.indexer || "Unknown").slice(0, 19).padEnd(20)} ` +
              `${r.seeders.toString().padEnd(5)} ` +
              `${sizeStr.padEnd(8)} ` +
              r.title,
          );
        }
      }

      printReport(
        {
          title: "Prowlarr Search Results",
          query: options.query,
          baseUrl: options.baseUrl,
          stats: {
            results: results.length,
            totalSeeders: results.reduce((acc, r) => acc + r.seeders, 0),
          },
          results: results.slice(0, 20), // Top 20
          findings,
        } satisfies ProwlarrSearchReport,
        options.json,
      );
    })(),
    (cause) => fail("Prowlarr search failed", cause),
  );
}

export default function prowlarrCommand(program: Command): void {
  const prowlarr = program.command("prowlarr").description("Search Prowlarr for media");

  prowlarr
    .command("search")
    .description("Search Prowlarr for media using categories or configurable category sets")
    .argument("<query>", "Search query (artist, album, etc.)")
    .option("--json", "Print JSON report", false)
    .option("--categories <ids...>", "Prowlarr category IDs (overrides --set)")
    .option(
      "--set <name>",
      "Predefined category set (music, movies, tv, audiobook, ebook)",
      "music",
    )
    .action(async (query: string, options: Record<string, unknown>) => {
      await runParsedCommand(
        searchOptionsSchema,
        { ...options, query },
        "Invalid Prowlarr search options",
        runSearch,
        (error) => {
          logError(`Prowlarr search failed: ${formatError(error)}`);
          process.exit(1);
        },
      );
    });
}
