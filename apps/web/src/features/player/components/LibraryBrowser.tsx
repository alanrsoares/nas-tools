import { match } from "@onrails/pattern";
import { ChevronRight, Folder, Home, Music, Play, Plus, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { AudioFileType, BrowseEntry } from "../../../types";
import { usePlayer } from "../PlayerProvider";

type EntryRowProps = {
  entry: BrowseEntry;
  isActive: boolean;
};

const formatLabel = (type: AudioFileType): string | null =>
  match(type)
    .with("dsd", () => "DSD")
    .with("alac", () => "ALAC")
    .with("flac", () => null)
    .exhaustive();

const entryActionsClass =
  "flex shrink-0 items-center gap-0.5 pr-1.5 opacity-100 transition-opacity duration-150 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 max-md:[&>button]:size-9";

type DirectoryRowProps = {
  entry: BrowseEntry;
};

function DirectoryRow({ entry }: DirectoryRowProps) {
  const [, { navigateTo, handlePlayAll, handleAddDirToQueue }] = usePlayer();
  return (
    <div className="group flex items-center border-b border-border transition-colors last:border-0 hover:bg-muted/70">
      <Button
        type="button"
        variant="ghost"
        className="h-10 min-w-0 flex-1 justify-start gap-2.5 rounded-none px-3 text-sm font-normal max-md:h-11"
        onClick={() => navigateTo(entry.path)}
      >
        <Folder data-icon="inline-start" className="opacity-60" />
        <span className="truncate">{entry.name}</span>
        <ChevronRight data-icon="inline-end" className="ml-auto opacity-40" />
      </Button>
      <div className={entryActionsClass}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={() => handlePlayAll(entry.path)}
            >
              <Play data-icon="inline-start" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Play all</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={() => handleAddDirToQueue(entry.path)}
            >
              <Plus data-icon="inline-start" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Add to queue</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

function TrackRow({ entry, isActive }: EntryRowProps) {
  const [, { handlePlay, handleAddToQueue }] = usePlayer();
  const type = entry.type as AudioFileType;
  const label = formatLabel(type);
  const trackName = entry.name.replace(/\.[^.]+$/, "").replace(/^\d+[\s._-]+/, "");
  const trackNum = entry.name.match(/^(\d+)/)?.[1];

  return (
    <div
      className={cn(
        "group flex items-center border-b border-border transition-colors last:border-0 hover:bg-muted/70",
        isActive && "bg-primary/10 hover:bg-primary/15",
      )}
    >
      <Button
        type="button"
        variant="ghost"
        className={cn(
          "h-10 min-w-0 flex-1 justify-start gap-2.5 rounded-none px-3 text-sm font-normal max-md:h-11",
          isActive && "text-primary hover:text-primary",
        )}
        onClick={() => handlePlay(entry.path)}
      >
        <span
          className={cn(
            "inline-flex w-5 shrink-0 items-center justify-end text-xs tabular-nums text-muted-foreground/60",
            isActive && "text-primary",
          )}
        >
          {isActive ? (
            <Play className="inline size-3.5" data-icon="inline-start" />
          ) : (
            (trackNum ?? <Music className="inline size-3.5 opacity-50" data-icon="inline-start" />)
          )}
        </span>
        <span className="truncate">{trackName}</span>
        {label && (
          <Badge variant="secondary" className="ml-auto shrink-0">
            {label}
          </Badge>
        )}
      </Button>
      <div className={entryActionsClass}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={() => handleAddToQueue(entry.path)}
            >
              <Plus data-icon="inline-start" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Add to queue</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

function EntryRow({ entry, isActive }: EntryRowProps) {
  if (entry.type === "dir") return <DirectoryRow entry={entry} />;
  return <TrackRow entry={entry} isActive={isActive} />;
}

export function Breadcrumb() {
  const [{ browse }, { navigateTo }] = usePlayer();
  const parts = browse?.path.split("/").filter(Boolean) ?? [];
  return (
    <nav
      className="flex items-center gap-1 overflow-x-auto border-b border-border px-2.5 py-2 text-xs text-muted-foreground"
      aria-label="Library path"
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 shrink-0 px-2"
        onClick={() => navigateTo(undefined)}
      >
        <Home data-icon="inline-start" />
        Root
      </Button>
      {parts.map((part, index) => (
        <span key={`${index}-${part}`} className="flex min-w-0 items-center gap-1">
          <ChevronRight className="shrink-0 opacity-40" data-icon="inline-start" />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 max-w-44 justify-start px-2 text-muted-foreground hover:text-foreground"
            onClick={() => navigateTo(`/${parts.slice(0, index + 1).join("/")}`)}
          >
            <span className="truncate">{part}</span>
          </Button>
        </span>
      ))}
    </nav>
  );
}

export function BrowseEntries() {
  const [{ browse, filter, playerState }] = usePlayer();
  const q = filter.toLowerCase();
  const entries = browse?.entries ?? [];
  const visible = q ? entries.filter((entry) => entry.name.toLowerCase().includes(q)) : entries;
  return (
    <ScrollArea className="h-[min(52vh,460px)] min-h-72">
      {visible.length === 0 && (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">
          {filter ? "No matches." : "No audio files found."}
        </p>
      )}
      {visible.map((entry) => (
        <EntryRow
          key={entry.path}
          entry={entry}
          isActive={entry.path === playerState.currentTrack}
        />
      ))}
    </ScrollArea>
  );
}

export function LibraryFilter() {
  const [{ filter }, { setFilter }] = usePlayer();
  return (
    <div className="border-b border-border p-3">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          data-icon="inline-start"
        />
        <Input
          placeholder="Filter library"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          className="pl-9"
        />
      </div>
    </div>
  );
}
