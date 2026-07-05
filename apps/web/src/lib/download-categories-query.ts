import { queryOptions } from "@tanstack/react-query";
import { api } from "../api";
import type { ProwlarrCategory } from "./prowlarr-categories";

export type DownloadCategoriesData = {
  categories: ProwlarrCategory[];
  activeIds: number[] | null;
};

export const downloadCategoriesQueryKey = ["search-categories"] as const;

export function downloadCategoriesQueryOptions() {
  return queryOptions({
    queryKey: downloadCategoriesQueryKey,
    queryFn: async (): Promise<DownloadCategoriesData> => {
      const res = await api.search.categories.get();
      return res.data && "categories" in res.data
        ? {
            categories: res.data.categories as ProwlarrCategory[],
            activeIds: res.data.activeIds as number[] | null,
          }
        : { categories: [], activeIds: null };
    },
    staleTime: 10 * 60 * 1000,
  });
}

export function flattenCategoryIds(categories: ProwlarrCategory[]): number[] {
  return categories.flatMap((group) => [group.id, ...group.subCategories.map((sub) => sub.id)]);
}
