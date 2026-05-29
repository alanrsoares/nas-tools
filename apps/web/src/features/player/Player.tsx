import { Card } from "@/components/ui/card";
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
      <Card
        className={cn(
          "flex flex-col gap-3.5 border p-5 shadow-none transition-colors duration-150",
          isActive && "border-primary/35",
        )}
      >
        <NowPlaying />
        <ProgressLine />
        <Transport />
        <QueuePanel />
      </Card>

      <Card className="overflow-hidden border bg-muted/30 p-0 shadow-none">
        {browse && <Breadcrumb />}
        {browse && <LibraryFilter />}
        {browseError && (
          <p className="border-b px-3.5 py-2.5 text-xs text-destructive">{browseError}</p>
        )}
        {browse && <BrowseEntries />}
      </Card>
    </div>
  );
}
