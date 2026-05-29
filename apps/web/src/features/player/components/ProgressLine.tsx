import { cn } from "@/lib/utils";
import { formatMs } from "../lib/utils";
import { usePlayer } from "../PlayerProvider";

export function ProgressLine() {
  const [{ playerState: state }] = usePlayer();
  if (!state.durationMs || state.status === "idle") return null;
  const pct = Math.min(100, (state.positionMs / state.durationMs) * 100);
  const isPlaying = state.status === "playing";

  return (
    <div className="flex flex-col gap-2 px-1">
      <div className="relative h-1 overflow-visible rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-1000 ease-linear"
          style={{ width: `${pct}%` }}
        />
        <div
          className={cn(
            "absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary shadow-[0_0_8px_var(--primary)] transition-[left] duration-1000 ease-linear",
            isPlaying && "player-progress-dot",
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
