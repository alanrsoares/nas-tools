import { useMutation, useQuery } from "@tanstack/react-query";
import { Settings as SettingsIcon } from "lucide-react";
import {
  EmptyState,
  ResponsiveCard,
  ResponsiveCardContent,
  SettingField,
  SettingFieldLabel,
  SettingsGrid,
} from "@/components/styled";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  downloadCategoriesQueryKey,
  downloadCategoriesQueryOptions,
  flattenCategoryIds,
} from "@/lib/download-categories-query";
import { isCategoryActive } from "@/lib/prowlarr-categories";
import { api, queryClient } from "../../api";
import { settingLabel } from "../../utils";

function DownloadCategoriesSettings() {
  const categoriesQuery = useQuery(downloadCategoriesQueryOptions());
  const categories = categoriesQuery.data?.categories ?? [];
  const activeIds = categoriesQuery.data?.activeIds ?? flattenCategoryIds(categories);

  const mutation = useMutation({
    mutationFn: async (ids: number[]) => api.search.categories.active.put({ activeIds: ids }),
    onMutate: async (ids) => {
      await queryClient.cancelQueries({ queryKey: downloadCategoriesQueryKey });
      const previous = queryClient.getQueryData(downloadCategoriesQueryKey);
      queryClient.setQueryData(downloadCategoriesQueryKey, (old: typeof previous) =>
        old ? { ...old, activeIds: ids } : old,
      );
      return { previous };
    },
    onError: (_err, _ids, context) => {
      if (context?.previous) queryClient.setQueryData(downloadCategoriesQueryKey, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: downloadCategoriesQueryKey }),
  });

  function toggle(id: number, checked: boolean) {
    const next = checked ? [...activeIds, id] : activeIds.filter((existing) => existing !== id);
    mutation.mutate(next);
  }

  if (categoriesQuery.isLoading || categories.length === 0) return null;

  return (
    <ResponsiveCard>
      <ResponsiveCardContent className="flex flex-col gap-4">
        <h3 className="font-bold text-sm text-foreground/95">Download Categories</h3>
        <div className="grid grid-cols-[repeat(2,minmax(240px,1fr))] gap-4 max-md:grid-cols-1">
          {categories.map((group) => (
            <div key={group.id} className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Checkbox
                  id={`cat-${group.id}`}
                  checked={isCategoryActive(group.id, activeIds)}
                  onCheckedChange={(checked) => toggle(group.id, checked === true)}
                />
                <label htmlFor={`cat-${group.id}`}>{group.name}</label>
              </div>
              <div className="flex flex-col gap-1.5 pl-6">
                {group.subCategories.map((sub) => (
                  <div
                    key={sub.id}
                    className="flex items-center gap-2 text-xs text-muted-foreground"
                  >
                    <Checkbox
                      id={`cat-${sub.id}`}
                      checked={isCategoryActive(sub.id, activeIds)}
                      onCheckedChange={(checked) => toggle(sub.id, checked === true)}
                    />
                    <label htmlFor={`cat-${sub.id}`}>{sub.name}</label>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </ResponsiveCardContent>
    </ResponsiveCard>
  );
}

export function Settings() {
  const config = useQuery({
    queryKey: ["config"],
    queryFn: async () => await api.config.get(),
  });

  const value =
    config.data?.data && "config" in config.data.data ? config.data.data.config : undefined;

  return (
    <div className="flex flex-col gap-4">
      <ResponsiveCard>
        <ResponsiveCardContent>
          {value ? (
            <SettingsGrid>
              {Object.entries(value).map(([key, path]) => (
                <SettingField key={key} htmlFor={`setting-${key}`}>
                  <SettingFieldLabel>{settingLabel(key)}</SettingFieldLabel>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Input
                        id={`setting-${key}`}
                        value={path}
                        readOnly
                        className="cursor-default"
                      />
                    </TooltipTrigger>
                    <TooltipContent>Read-only — set via server environment variable</TooltipContent>
                  </Tooltip>
                </SettingField>
              ))}
            </SettingsGrid>
          ) : (
            <EmptyState>
              <SettingsIcon size={28} />
              <span>Loading settings.</span>
            </EmptyState>
          )}
        </ResponsiveCardContent>
      </ResponsiveCard>
      <DownloadCategoriesSettings />
    </div>
  );
}
