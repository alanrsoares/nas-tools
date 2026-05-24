import { env } from "./env.js";

const BASE_URL = env.PROWLARR_URL.replace(/\/$/, "");
const API_KEY = env.PROWLARR_API_KEY;

export interface SearchResult {
  title: string;
  size: number;
  indexer: string;
  seeders: number;
  leechers: number;
  downloadUrl: string | null;
  infoUrl: string | null;
  publishDate: string | null;
  guid: string;
}

interface ProwlarrRaw {
  title: string;
  size: number;
  indexer: string;
  seeders: number;
  leechers: number;
  downloadUrl?: string;
  infoUrl?: string;
  publishDate?: string;
  guid: string;
}

export async function prowlarrSearch(query: string, categories = [3040]): Promise<SearchResult[]> {
  if (!API_KEY) throw new Error("PROWLARR_API_KEY is not set");

  const params = new URLSearchParams({ query });
  for (const cat of categories) params.append("categories", String(cat));

  const res = await fetch(`${BASE_URL}/api/v1/search?${params}`, {
    headers: { "X-Api-Key": API_KEY },
  });

  if (!res.ok) throw new Error(`Prowlarr search responded HTTP ${res.status}`);

  const raw = (await res.json()) as ProwlarrRaw[];

  return raw
    .map((r) => ({
      title: r.title,
      size: r.size,
      indexer: r.indexer,
      seeders: r.seeders,
      leechers: r.leechers,
      downloadUrl: r.downloadUrl ?? null,
      infoUrl: r.infoUrl ?? null,
      publishDate: r.publishDate ?? null,
      guid: r.guid,
    }))
    .sort((a, b) => b.seeders - a.seeders)
    .slice(0, 50);
}
