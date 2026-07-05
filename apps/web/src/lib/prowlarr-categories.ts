export type ProwlarrCategory = {
  id: number;
  name: string;
  subCategories: ProwlarrCategory[];
};

/** `null` activeIds means no override has been saved — everything is active. */
export function isCategoryActive(id: number, activeIds: number[] | null): boolean {
  return activeIds === null || activeIds.includes(id);
}
