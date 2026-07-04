import { useQuery } from "@tanstack/react-query";
import { Settings as SettingsIcon } from "lucide-react";
import { EmptyState, ResponsiveCard, ResponsiveCardContent, SettingField, SettingFieldLabel, SettingsGrid } from "@/components/styled";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api } from "../../api";
import { settingLabel } from "../../utils";

export function Settings() {
  const config = useQuery({
    queryKey: ["config"],
    queryFn: async () => await api.config.get(),
  });

  const value =
    config.data?.data && "config" in config.data.data ? config.data.data.config : undefined;

  return (
    <ResponsiveCard>
      <ResponsiveCardContent>
        {value ? (
          <SettingsGrid>
            {Object.entries(value).map(([key, path]) => (
              <SettingField key={key} htmlFor={`setting-${key}`}>
                <SettingFieldLabel>{settingLabel(key)}</SettingFieldLabel>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Input id={`setting-${key}`} value={path} readOnly className="cursor-default" />
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
  );
}
