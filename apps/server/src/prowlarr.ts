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

export interface ProwlarrCategory {
  id: number;
  name: string;
  subCategories: ProwlarrCategory[];
}

let categoriesCache: { data: ProwlarrCategory[]; expiresAt: number } | null = null;
const CATEGORIES_TTL_MS = 10 * 60 * 1000;

export async function getCategories(): Promise<ProwlarrCategory[]> {
  if (!API_KEY) throw new Error("PROWLARR_API_KEY is not set");

  if (categoriesCache && categoriesCache.expiresAt > Date.now()) {
    return categoriesCache.data;
  }

  const res = await fetch(`${BASE_URL}/api/v1/indexer/categories`, {
    headers: { "X-Api-Key": API_KEY },
  });
  if (!res.ok) throw new Error(`Prowlarr categories responded HTTP ${res.status}`);

  const data = (await res.json()) as ProwlarrCategory[];
  categoriesCache = { data, expiresAt: Date.now() + CATEGORIES_TTL_MS };
  return data;
}

export async function prowlarrSearch(
  query: string,
  categories = [3040],
  signal?: AbortSignal,
): Promise<SearchResult[]> {
  if (!API_KEY) throw new Error("PROWLARR_API_KEY is not set");

  const params = new URLSearchParams({ query });
  for (const cat of categories) params.append("categories", String(cat));

  const res = await fetch(`${BASE_URL}/api/v1/search?${params}`, {
    headers: { "X-Api-Key": API_KEY },
    signal: signal ?? null,
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
