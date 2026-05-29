import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
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
  const [{ browse, browseError }] = usePlayer();

  return (
    <div className="player-page flex flex-col gap-3">
      <div className="flex flex-col gap-3">
        <NowPlaying />
        <ProgressLine />
        <Transport />
        <QueuePanel />
      </div>

      <Separator className="my-1" />

      <Card className="overflow-hidden">
        {browse && <Breadcrumb />}
        {browse && <LibraryFilter />}
        {browseError && <p className="px-4 py-3 text-xs text-destructive">{browseError}</p>}
        {browse && <BrowseEntries />}
      </Card>
    </div>
  );
}
