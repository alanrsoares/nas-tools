import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Radio } from "lucide-react";
import React from "react";
import {
  PlexScanAction,
  PlexScanHeader,
  PlexScanItem,
  PlexScanList,
  PlexScanLoading,
  PlexScanPopover as PlexScanPopoverRoot,
  PlexScanTitle,
} from "@/components/styled";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api } from "../../api";

export type PlexSection = { key: string; title: string; type: string };

type PlexSectionRowProps = {
  section: PlexSection;
  scanning: boolean;
  done: boolean;
  anyPending: boolean;
  onScan: (key: string) => void;
};

type PlexScanPopoverProps = {
  renderTrigger?: (state: { anyPending: boolean }) => React.ReactNode;
};

type PlexScanTriggerProps = {
  renderTrigger: PlexScanPopoverProps["renderTrigger"];
  anyPending: boolean;
  open: boolean;
};

type PlexScanListProps = {
  isLoading: boolean;
  sections: PlexSection[];
  scanned: Set<string>;
  anyPending: boolean;
  scanAllPending: boolean;
  scanningKey: string | undefined;
  onScan: (key: string) => void;
};

export function PlexSectionRow({
  section,
  scanning,
  done,
  anyPending,
  onScan,
}: PlexSectionRowProps) {
  return (
    <PlexScanItem
      type="button"
      $scanning={scanning}
      disabled={anyPending}
      onClick={() => onScan(section.key)}
    >
      <PlexScanTitle>{section.title}</PlexScanTitle>
      <PlexScanAction>
        {scanning ? (
          <Loader2 size={12} className="animate-spin" />
        ) : done ? (
          <CheckCircle2 size={12} />
        ) : (
          <Radio size={12} />
        )}
        {scanning ? "Scanning…" : done ? "Scanned" : "Scan"}
      </PlexScanAction>
    </PlexScanItem>
  );
}

function PlexScanTrigger({ renderTrigger, anyPending, open }: PlexScanTriggerProps) {
  if (renderTrigger) {
    return <PopoverTrigger asChild>{renderTrigger({ anyPending })}</PopoverTrigger>;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <PopoverTrigger asChild>
          <Button size="sm" variant="ghost" disabled={anyPending && !open}>
            {anyPending ? <Loader2 size={15} className="animate-spin" /> : <Radio size={15} />}
            <span>{anyPending ? "Scanning…" : "Plex scan"}</span>
          </Button>
        </PopoverTrigger>
      </TooltipTrigger>
      <TooltipContent>Trigger a Plex library refresh</TooltipContent>
    </Tooltip>
  );
}

function PlexScanListBody({
  isLoading,
  sections,
  scanned,
  anyPending,
  scanAllPending,
  scanningKey,
  onScan,
}: PlexScanListProps) {
  if (isLoading) {
    return (
      <PlexScanLoading>
        <Loader2 size={14} className="animate-spin" />
        <span>Loading libraries…</span>
      </PlexScanLoading>
    );
  }

  if (sections.length === 0) {
    return (
      <PlexScanLoading>
        <span>No libraries found</span>
      </PlexScanLoading>
    );
  }

  return sections.map((section) => {
    const done = scanned.has(section.key);
    const scanning = (scanningKey === section.key && anyPending) || (scanAllPending && !done);
    return (
      <PlexSectionRow
        key={section.key}
        section={section}
        scanning={scanning}
        done={done}
        anyPending={anyPending}
        onScan={onScan}
      />
    );
  });
}

export function PlexScanPopover({ renderTrigger }: PlexScanPopoverProps) {
  const [open, setOpen] = React.useState(false);
  const [scanned, setScanned] = React.useState<Set<string>>(new Set());

  const sectionsQuery = useQuery({
    queryKey: ["plex-sections"],
    queryFn: async () => {
      const res = await api.plex.sections.get();
      return res.data && "sections" in res.data ? (res.data.sections as PlexSection[]) : [];
    },
    enabled: open,
    staleTime: 60_000,
  });

  const scanAll = useMutation({
    mutationFn: async () => await api.plex.scan.post(),
    onSuccess: () => {
      const keys = (sectionsQuery.data ?? []).map((s) => s.key);
      setScanned(new Set(keys));
    },
  });

  const scanOne = useMutation({
    mutationFn: async (key: string) => await api.plex.sections({ key }).scan.post(),
    onSuccess: (_, key) => setScanned((prev) => new Set([...prev, key])),
  });

  const sections = sectionsQuery.data ?? [];
  const anyPending = scanAll.isPending || scanOne.isPending;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PlexScanTrigger renderTrigger={renderTrigger} anyPending={anyPending} open={open} />
      <PopoverContent align="end" className="w-64 p-0">
        <PlexScanPopoverRoot>
          <PlexScanHeader>
            <span>Plex Libraries</span>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              disabled={anyPending || sections.length === 0}
              onClick={() => scanAll.mutate()}
            >
              {scanAll.isPending ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Radio size={12} />
              )}
              {scanAll.isPending ? "Scanning…" : "Scan all"}
            </Button>
          </PlexScanHeader>
          <PlexScanList>
            <PlexScanListBody
              isLoading={sectionsQuery.isLoading}
              sections={sections}
              scanned={scanned}
              anyPending={anyPending}
              scanAllPending={scanAll.isPending}
              scanningKey={scanOne.variables}
              onScan={(key) => scanOne.mutate(key)}
            />
          </PlexScanList>
        </PlexScanPopoverRoot>
      </PopoverContent>
    </Popover>
  );
}
