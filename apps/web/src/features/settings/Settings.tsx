import { useQuery } from "@tanstack/react-query";
import { Settings as SettingsIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
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
    <Card>
      <CardContent className="p-4">
        {value ? (
          <div className="settings-grid">
            {Object.entries(value).map(([key, path]) => (
              <label key={key} htmlFor={`setting-${key}`} className="setting-field">
                <span>{settingLabel(key)}</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Input id={`setting-${key}`} value={path} readOnly className="cursor-default" />
                  </TooltipTrigger>
                  <TooltipContent>Read-only — set via server environment variable</TooltipContent>
                </Tooltip>
              </label>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <SettingsIcon size={28} />
            <span>Loading settings.</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
