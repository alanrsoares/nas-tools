import { match } from "@onrails/pattern";
import { Pause, Play, SkipBack, SkipForward, Square } from "lucide-react";
import type React from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { usePlayer } from "../PlayerProvider";

type TransportButtonProps = {
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  children: React.ReactNode;
  large?: boolean;
};

function TransportButton({
  onClick,
  disabled,
  title,
  children,
  large = false,
}: TransportButtonProps) {
  return (
    <Button
      type="button"
      variant={large ? "secondary" : "ghost"}
      size="icon"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "rounded-full",
        large
          ? "size-11 border border-primary/20 bg-primary/10 text-primary hover:bg-primary/15"
          : "size-9",
      )}
    >
      {children}
    </Button>
  );
}

export function Transport() {
  const [
    { playerState: state, playlist, playlistIdx, devices, selectedDevice },
    { setSelectedDevice, handlePrev, handlePause, handleResume, handleStop, handleNext },
  ] = usePlayer();
  const canPrev = state.status !== "idle";
  const canNext = playlistIdx >= 0 && playlistIdx < playlist.length - 1;

  const PlayPause = match(state.status)
    .with("idle", () => (
      <TransportButton onClick={() => {}} disabled large title="Play">
        <Play data-icon="inline-start" />
      </TransportButton>
    ))
    .with("playing", () => (
      <TransportButton onClick={handlePause} large title="Pause (Space)">
        <Pause data-icon="inline-start" />
      </TransportButton>
    ))
    .with("paused", () => (
      <TransportButton onClick={handleResume} large title="Resume (Space)">
        <Play data-icon="inline-start" />
      </TransportButton>
    ))
    .exhaustive();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-center gap-2">
        <TransportButton onClick={handlePrev} disabled={!canPrev} title="Prev (Left arrow)">
          <SkipBack data-icon="inline-start" />
        </TransportButton>
        {PlayPause}
        <TransportButton onClick={handleStop} disabled={state.status === "idle"} title="Stop (Esc)">
          <Square data-icon="inline-start" />
        </TransportButton>
        <TransportButton onClick={handleNext} disabled={!canNext} title="Next (Right arrow)">
          <SkipForward data-icon="inline-start" />
        </TransportButton>
      </div>

      <div className="flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <span className="tabular-nums">
          {playlist.length > 0 && playlistIdx >= 0
            ? `${playlistIdx + 1} / ${playlist.length}`
            : "No queue"}
        </span>
        {devices.length > 0 ? (
          <Select
            value={selectedDevice}
            onValueChange={setSelectedDevice}
            disabled={state.status === "playing"}
          >
            <SelectTrigger className="h-8 w-full sm:w-auto sm:min-w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {devices.map((device) => (
                  <SelectItem key={device.id} value={device.id}>
                    {device.name} ({device.id})
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        ) : (
          <span className="truncate">{selectedDevice}</span>
        )}
      </div>
    </div>
  );
}
