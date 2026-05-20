import { readFile } from "node:fs/promises";
import { Command } from "commander";
import { ResultAsync } from "neverthrow";
import { z } from "zod";

import { fail, formatError, parseWith } from "../lib/fp.js";
import { printReport, type Finding } from "../lib/report.js";
import { logError } from "../lib/utils.js";

const plexPreferencesPath =
  "/volume1/Plex/Library/Plex Media Server/Preferences.xml";

const scanMusicOptionsSchema = z.object({
  baseUrl: z
    .string()
    .url()
    .optional()
    .default(process.env["PLEX_URL"] ?? "http://127.0.0.1:32400"),
  dryRun: z.boolean().optional().default(false),
  json: z.boolean().optional().default(false),
  preferences: z.string().optional().default(plexPreferencesPath),
  sectionId: z.string().optional(),
  sectionTitle: z.string().optional().default("Music"),
  token: z
    .string()
    .optional()
    .default(process.env["PLEX_TOKEN"] ?? ""),
});

type ScanMusicOptions = z.infer<typeof scanMusicOptionsSchema>;

export interface PlexSection {
  key: string;
  title: string;
  type: string;
}

interface PlexScanReport {
  title: string;
  baseUrl: string;
  dryRun: boolean;
  section: PlexSection | { key: string } | null;
  stats: {
    sections: number;
    musicSections: number;
    scanTriggered: boolean;
  };
  findings: Finding[];
}

export function parsePlexToken(preferencesXml: string): string | undefined {
  return preferencesXml.match(/PlexOnlineToken="([^"]+)"/)?.[1];
}

function decodeXmlAttribute(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function parseAttributes(tag: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const match of tag.matchAll(/([A-Za-z0-9_:-]+)="([^"]*)"/g)) {
    const [, key, value] = match;
    if (key && value !== undefined) {
      attributes[key] = decodeXmlAttribute(value);
    }
  }
  return attributes;
}

export function parsePlexSections(sectionsXml: string): PlexSection[] {
  const sections: PlexSection[] = [];
  for (const match of sectionsXml.matchAll(/<Directory\s+[^>]*>/g)) {
    const attributes = parseAttributes(match[0] ?? "");
    if (attributes["key"] && attributes["title"] && attributes["type"]) {
      sections.push({
        key: attributes["key"],
        title: attributes["title"],
        type: attributes["type"],
      });
    }
  }
  return sections;
}

export function chooseMusicSection(
  sections: PlexSection[],
  title: string,
): PlexSection | undefined {
  const musicSections = sections.filter((section) => section.type === "artist");
  return (
    musicSections.find((section) => section.title === title) ??
    musicSections.find(
      (section) => section.title.toLowerCase() === title.toLowerCase(),
    ) ??
    musicSections[0]
  );
}

function plexUrl(baseUrl: string, path: string, token: string): URL {
  const url = new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  url.searchParams.set("X-Plex-Token", token);
  return url;
}

async function resolvePlexToken(options: ScanMusicOptions): Promise<string> {
  if (options.token) {
    return options.token;
  }

  const preferencesXml = await readFile(options.preferences, "utf8");
  const token = parsePlexToken(preferencesXml);
  if (!token) {
    throw new Error(
      `Plex token not found in ${options.preferences}; pass --token or set PLEX_TOKEN`,
    );
  }
  return token;
}

async function getPlexSections(
  options: ScanMusicOptions,
  token: string,
): Promise<PlexSection[]> {
  const response = await fetch(
    plexUrl(options.baseUrl, "/library/sections", token),
  );
  if (!response.ok) {
    throw new Error(`Plex sections request failed: HTTP ${response.status}`);
  }
  return parsePlexSections(await response.text());
}

async function triggerPlexRefresh(
  options: ScanMusicOptions,
  token: string,
  sectionId: string,
): Promise<void> {
  const response = await fetch(
    plexUrl(options.baseUrl, `/library/sections/${sectionId}/refresh`, token),
  );
  if (!response.ok) {
    throw new Error(`Plex refresh request failed: HTTP ${response.status}`);
  }
}

function runScanMusic(
  options: ScanMusicOptions,
): ResultAsync<void, ReturnType<typeof fail>> {
  return ResultAsync.fromPromise(
    (async () => {
      const token = await resolvePlexToken(options);
      const sections = options.sectionId
        ? []
        : await getPlexSections(options, token);
      const musicSections = sections.filter(
        (section) => section.type === "artist",
      );
      const selected = options.sectionId
        ? { key: options.sectionId }
        : chooseMusicSection(sections, options.sectionTitle);
      const findings: Finding[] = [];

      if (!selected) {
        findings.push({
          severity: "error",
          message: `No Plex music library section found for title '${options.sectionTitle}'.`,
        });
      } else if (options.dryRun) {
        findings.push({
          severity: "info",
          message: "Would trigger Plex music library refresh.",
          path: `section ${selected.key}`,
        });
      } else {
        await triggerPlexRefresh(options, token, selected.key);
        findings.push({
          severity: "info",
          message: "Triggered Plex music library refresh.",
          path: `section ${selected.key}`,
        });
      }

      printReport(
        {
          title: "Plex music library scan",
          baseUrl: options.baseUrl,
          dryRun: options.dryRun,
          section: selected ?? null,
          stats: {
            sections: sections.length,
            musicSections: musicSections.length,
            scanTriggered: Boolean(selected) && !options.dryRun,
          },
          findings,
        } satisfies PlexScanReport,
        options.json,
      );

      if (!selected) {
        throw new Error("No Plex music library section found");
      }
    })(),
    (cause) => fail("Plex music scan failed", cause),
  );
}

export default function plexCommand(program: Command): void {
  const plex = program.command("plex").description("Plex server workflows");

  plex
    .command("scan-music")
    .description("Trigger a Plex refresh for the music library section")
    .option(
      "--base-url <url>",
      "Plex server base URL",
      process.env["PLEX_URL"] ?? "http://127.0.0.1:32400",
    )
    .option("--token <token>", "Plex token; defaults to PLEX_TOKEN")
    .option(
      "--preferences <path>",
      "Plex Preferences.xml path used to discover token",
      plexPreferencesPath,
    )
    .option("--section-id <id>", "Plex library section id to refresh")
    .option("--section-title <title>", "Music library title", "Music")
    .option("--dry-run", "Preview the selected music section", false)
    .option("--json", "Print JSON report", false)
    .action(async (options: Record<string, unknown>) => {
      const result = await parseWith(
        scanMusicOptionsSchema,
        options,
        "Invalid Plex scan options",
      ).asyncAndThen(runScanMusic);

      result.match(
        () => undefined,
        (error) => {
          logError(`Plex music scan failed: ${formatError(error)}`);
          process.exit(1);
        },
      );
    });
}
