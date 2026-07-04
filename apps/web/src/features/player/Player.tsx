import { ResponsiveCard, ResponsiveCardContent } from "@/components/styled";
import { cn } from "@/lib/utils";
import { Breadcrumb, BrowseEntries, LibraryFilter } from "./components/LibraryBrowser";
import { NowPlaying } from "./components/NowPlaying";
import { ProgressLine } from "./components/ProgressLine";
import { QueuePanel } from "./components/QueuePanel";
import { Transport } from "./components/Transport";
import { PlayerProvider, usePlayer } from "./PlayerProvider";

export function Player() {
  return (
    <PlayerProvider>
      <PlayerContent />
    </PlayerProvider>
  );
}

function PlayerContent() {
  const [{ browse, browseError, playerState }] = usePlayer();
  const isActive = playerState.status !== "idle";

  return (
    <div className="flex flex-col gap-4">
      <ResponsiveCard
        className={cn(
          "transition-colors duration-150",
          isActive && "border-primary/35 max-md:border max-md:border-primary/35 max-md:bg-card/30",
        )}
      >
        <ResponsiveCardContent className="flex flex-col gap-3.5 p-5 max-md:p-3">
          <NowPlaying />
          <ProgressLine />
          <Transport />
          <QueuePanel />
        </ResponsiveCardContent>
      </ResponsiveCard>

      <ResponsiveCard className="overflow-hidden bg-muted/30">
        <ResponsiveCardContent className="p-0 max-md:p-0">
          {browse && <Breadcrumb />}
          {browse && <LibraryFilter />}
          {browseError && (
            <p className="border-b px-3.5 py-2.5 text-xs text-destructive">{browseError}</p>
          )}
          {browse && <BrowseEntries />}
        </ResponsiveCardContent>
      </ResponsiveCard>
    </div>
  );
}
