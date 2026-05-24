import { Command } from "commander";
import got from "got";
import { ResultAsync } from "neverthrow";
import { z } from "zod";

import { fail, formatError, parseWith, type AppError } from "../lib/fp.js";
import { printReport, type Finding } from "../lib/report.js";
import { logError } from "../lib/utils.js";

const searchOptionsSchema = z.object({
  apiKey: z
    .string()
    .optional()
    .default(process.env["PROWLARR_API_KEY"] ?? ""),
  baseUrl: z
    .string()
    .url()
    .optional()
    .default(process.env["PROWLARR_URL"] ?? "http://127.0.0.1:29696"),
  categories: z.array(z.coerce.number()).optional().default([3040]), // Audio/Lossless
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

function runSearch(options: SearchOptions): ResultAsync<void, AppError> {
  return ResultAsync.fromPromise(
    (async () => {
      const findings: Finding[] = [];
      const results: ProwlarrSearchResult[] = [];

      if (!options.apiKey) {
        throw new Error("PROWLARR_API_KEY is required");
      }

      const searchParams = new URLSearchParams();
      searchParams.set("query", options.query);
      for (const cat of options.categories) {
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
        console.log(
          `${"Indexer".padEnd(20)} ${"Seed".padEnd(5)} ${"Size".padEnd(8)} Title`,
        );
        console.log("-".repeat(80));
        for (const r of results.slice(0, 20)) {
          const sizeStr = (r.size / (1024 * 1024)).toFixed(0) + "MB";
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
  const prowlarr = program
    .command("prowlarr")
    .description("Search Prowlarr for media");

  prowlarr
    .command("search")
    .description("Search for audio lossless")
    .argument("<query>", "Search query (artist, album, etc.)")
    .option("--json", "Print JSON report", false)
    .option(
      "--categories <ids...>",
      "Prowlarr category IDs (default: 3040 for Lossless Audio)",
    )
    .action(async (query: string, options: Record<string, unknown>) => {
      const result = await parseWith(searchOptionsSchema, {
        ...options,
        query,
      }).asyncAndThen(runSearch);

      result.match(
        () => undefined,
        (error) => {
          logError(`Prowlarr search failed: ${formatError(error)}`);
          process.exit(1);
        },
      );
    });
}
