import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { PlayerState } from "../../../types";
import { parseTrackInfo } from "../lib/utils";
import { usePlayer } from "../PlayerProvider";

const fallbackTitle = (state: PlayerState) =>
  state.currentTrack
    ?.split("/")
    .pop()
    ?.replace(/\.[^.]+$/, "") ?? "-";

type TrackHeadingProps = {
  title: string | null;
  artist: string | null | undefined;
  album: string | null | undefined;
  isActive: boolean;
};

function TrackHeading({ title, artist, album, isActive }: TrackHeadingProps) {
  return (
    <div className="flex flex-col gap-1">
      {artist && (
        <p className="text-xs font-medium uppercase tracking-wider text-primary/80">{artist}</p>
      )}
      <CardTitle
        key={title}
        className={cn(
          "truncate text-base leading-snug",
          isActive ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {title ?? "Nothing playing"}
      </CardTitle>
      {album && <p className="truncate text-xs text-muted-foreground">{album}</p>}
    </div>
  );
}

function AudioBadges({ state }: { state: PlayerState }) {
  if (!state.sampleRate && !state.bitDepth) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      {state.sampleRate && (
        <Badge variant="secondary">{(state.sampleRate / 1000).toFixed(1)} kHz</Badge>
      )}
      {state.bitDepth && <Badge variant="secondary">{state.bitDepth}-bit</Badge>}
      {state.channels === 2 && <Badge variant="outline">stereo</Badge>}
      {state.channels === 1 && <Badge variant="outline">mono</Badge>}
      <span className="ml-auto truncate text-muted-foreground/70">{state.device}</span>
    </div>
  );
}

export function NowPlaying() {
  const [{ playerState: state, libraryRoot }] = usePlayer();
  const isActive = state.status !== "idle";
  const info =
    state.currentTrack && libraryRoot ? parseTrackInfo(state.currentTrack, libraryRoot) : null;
  const title = info?.title ?? (isActive ? fallbackTitle(state) : null);

  return (
    <Card
      data-state={state.status}
      className="player-now-playing overflow-hidden transition-colors duration-700"
    >
      <CardHeader className="relative gap-2 p-5">
        <TrackHeading title={title} artist={info?.artist} album={info?.album} isActive={isActive} />
        <AudioBadges state={state} />
      </CardHeader>
      {state.status === "playing" && <div aria-hidden className="player-now-playing-glow" />}
    </Card>
  );
}
