import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { PlayerState } from "../../../types";
import { parseTrackInfo } from "../lib/utils";
import { usePlayer } from "../PlayerProvider";

const fallbackTitle = (state: PlayerState) =>
  state.currentTrack
    ?.split("/")
    .pop()
    ?.replace(/\.[^.]+$/, "") ?? "—";

const statusLabel: Record<PlayerState["status"], string> = {
  idle: "Idle",
  playing: "Playing",
  paused: "Paused",
};

type TrackHeadingProps = {
  title: string;
  artist: string | null | undefined;
  album: string | null | undefined;
  isActive: boolean;
};

function TrackHeading({ title, artist, album, isActive }: TrackHeadingProps) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      {artist && (
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {artist}
        </p>
      )}
      <h2
        className={cn(
          "truncate font-semibold leading-snug tracking-tight",
          isActive ? "text-xl" : "text-base font-medium text-muted-foreground",
        )}
      >
        {title}
      </h2>
      {album && <p className="truncate text-xs text-muted-foreground">{album}</p>}
    </div>
  );
}

type AudioSpecsProps = {
  state: PlayerState;
};

function AudioSpecs({ state }: AudioSpecsProps) {
  if (!state.sampleRate && !state.bitDepth && !state.device) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {state.sampleRate && (
        <Badge variant="secondary" className="text-[11px]">
          {(state.sampleRate / 1000).toFixed(1)} kHz
        </Badge>
      )}
      {state.bitDepth && (
        <Badge variant="secondary" className="text-[11px]">
          {state.bitDepth}-bit
        </Badge>
      )}
      {state.channels === 2 && (
        <Badge variant="outline" className="text-[11px]">
          stereo
        </Badge>
      )}
      {state.channels === 1 && (
        <Badge variant="outline" className="text-[11px]">
          mono
        </Badge>
      )}
      {state.device && (
        <span className="ml-auto max-w-[55%] truncate text-[11px] text-muted-foreground/80">
          {state.device}
        </span>
      )}
    </div>
  );
}

export function NowPlaying() {
  const [{ playerState: state, libraryRoot }] = usePlayer();
  const isActive = state.status !== "idle";
  const info =
    state.currentTrack && libraryRoot ? parseTrackInfo(state.currentTrack, libraryRoot) : null;
  const title = info?.title ?? (isActive ? fallbackTitle(state) : "Nothing playing");

  return (
    <header className="flex flex-col gap-2.5">
      <Badge
        variant="outline"
        className={cn(
          "w-fit text-[11px] font-medium uppercase tracking-wide",
          state.status === "playing" && "border-primary/40 text-primary",
        )}
      >
        {statusLabel[state.status]}
      </Badge>
      <TrackHeading title={title} artist={info?.artist} album={info?.album} isActive={isActive} />
      <AudioSpecs state={state} />
    </header>
  );
}
