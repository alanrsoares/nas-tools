import { readFile } from "node:fs/promises";
import { env } from "./env.js";

const PLEX_URL = env.PLEX_URL;
const PLEX_TOKEN = env.PLEX_TOKEN;
const PLEX_SECTION_TITLE = env.PLEX_SECTION_TITLE;
const PLEX_PREFERENCES_PATH = "/volume1/Plex/Library/Plex Media Server/Preferences.xml";

function plexApiUrl(apiPath: string, token: string): URL {
  const base = PLEX_URL.endsWith("/") ? PLEX_URL : `${PLEX_URL}/`;
  const url = new URL(apiPath.replace(/^\//, ""), base);
  url.searchParams.set("X-Plex-Token", token);
  return url;
}

async function resolvePlexToken(): Promise<string> {
  if (PLEX_TOKEN) return PLEX_TOKEN;
  const xml = await readFile(PLEX_PREFERENCES_PATH, "utf8");
  const token = xml.match(/PlexOnlineToken="([^"]+)"/)?.[1];
  if (!token) throw new Error(`PLEX_TOKEN not set and not found in ${PLEX_PREFERENCES_PATH}`);
  return token;
}

interface PlexSection {
  key: string;
  title: string;
  type: string;
}

function parseSections(xml: string): PlexSection[] {
  const sections: PlexSection[] = [];
  for (const match of xml.matchAll(/<Directory\s+[^>]*>/g)) {
    const attrs: Record<string, string> = {};
    for (const a of (match[0] ?? "").matchAll(/([A-Za-z0-9_:-]+)="([^"]*)"/g)) {
      if (a[1] && a[2] !== undefined) attrs[a[1]] = a[2];
    }
    if (attrs.key && attrs.title && attrs.type) {
      sections.push({
        key: attrs.key,
        title: attrs.title,
        type: attrs.type,
      });
    }
  }
  return sections;
}

async function getPlexSections(): Promise<{
  token: string;
  sections: PlexSection[];
}> {
  const token = await resolvePlexToken();
  const res = await fetch(plexApiUrl("/library/sections", token));
  if (!res.ok) throw new Error(`Plex /library/sections responded HTTP ${res.status}`);
  return { token, sections: parseSections(await res.text()) };
}

async function refreshSection(key: string, token: string): Promise<void> {
  const res = await fetch(plexApiUrl(`/library/sections/${key}/refresh`, token));
  if (!res.ok) throw new Error(`Plex section ${key} refresh responded HTTP ${res.status}`);
}

export async function triggerPlexMusicScan(): Promise<string> {
  const { token, sections } = await getPlexSections();
  const musicSections = sections.filter((s) => s.type === "artist");
  const section =
    musicSections.find((s) => s.title === PLEX_SECTION_TITLE) ??
    musicSections.find((s) => s.title.toLowerCase() === PLEX_SECTION_TITLE.toLowerCase()) ??
    musicSections[0];

  if (!section)
    throw new Error(`No Plex music section found (looking for "${PLEX_SECTION_TITLE}")`);

  await refreshSection(section.key, token);
  return section.title;
}

export async function scanAllPlexLibraries(): Promise<{
  scanned: { key: string; title: string; type: string }[];
}> {
  const { token, sections } = await getPlexSections();
  await Promise.all(sections.map((s) => refreshSection(s.key, token)));
  return { scanned: sections };
}

export async function listPlexSections(): Promise<{ key: string; title: string; type: string }[]> {
  const { sections } = await getPlexSections();
  return sections;
}

export async function scanPlexSection(key: string): Promise<{ key: string; title: string }> {
  const { token, sections } = await getPlexSections();
  const section = sections.find((s) => s.key === key);
  if (!section) throw new Error(`Plex section "${key}" not found`);
  await refreshSection(key, token);
  return { key: section.key, title: section.title };
}
