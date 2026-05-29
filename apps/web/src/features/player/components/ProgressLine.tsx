import { cn } from "@/lib/utils";
import { formatMs } from "../lib/utils";
import { usePlayer } from "../PlayerProvider";

export function ProgressLine() {
  const [{ playerState: state }] = usePlayer();
  if (!state.durationMs || state.status === "idle") return null;
  const pct = Math.min(100, (state.positionMs / state.durationMs) * 100);
  const isPlaying = state.status === "playing";

  return (
    <div className="flex flex-col gap-1.5 px-0.5">
      <div
        className="relative h-1 rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={Math.round(state.positionMs)}
        aria-valuemin={0}
        aria-valuemax={state.durationMs}
        aria-label="Playback position"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-1000 ease-linear"
          style={{ width: `${pct}%` }}
        />
        <div
          className={cn(
            "absolute top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary transition-[left] duration-1000 ease-linear",
            isPlaying && "animate-pulse",
          )}
          style={{ left: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between text-xs tabular-nums text-muted-foreground">
        <span>{formatMs(state.positionMs)}</span>
        <span>{formatMs(state.durationMs)}</span>
      </div>
    </div>
  );
}
