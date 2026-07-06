import { match } from "@onrails/pattern";
import { Pause, Play, SkipBack, SkipForward, Square } from "lucide-react";
import type React from "react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { usePlayer } from "../PlayerProvider";

type TransportButtonProps = {
  onClick: () => void;
  disabled?: boolean;
  label: string;
  shortcut?: string;
  children: React.ReactNode;
  primary?: boolean;
};

function TransportButton({
  onClick,
  disabled,
  label,
  shortcut,
  children,
  primary = false,
}: TransportButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant={primary ? "default" : "ghost"}
          size="icon"
          onClick={onClick}
          disabled={disabled}
          className={cn(
            "rounded-full",
            primary
              ? "size-11 max-md:size-12"
              : "size-9 text-muted-foreground hover:text-foreground max-md:size-10",
          )}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent className="flex items-center gap-1.5">
        {label}
        {shortcut && <Kbd>{shortcut}</Kbd>}
      </TooltipContent>
    </Tooltip>
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
      <TransportButton onClick={() => {}} disabled primary label="Play">
        <Play data-icon="inline-start" />
      </TransportButton>
    ))
    .with("playing", () => (
      <TransportButton onClick={handlePause} primary label="Pause" shortcut="Space">
        <Pause data-icon="inline-start" />
      </TransportButton>
    ))
    .with("paused", () => (
      <TransportButton onClick={handleResume} primary label="Resume" shortcut="Space">
        <Play data-icon="inline-start" />
      </TransportButton>
    ))
    .exhaustive();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-center gap-1.5 max-md:gap-3">
        <TransportButton onClick={handlePrev} disabled={!canPrev} label="Prev" shortcut="←">
          <SkipBack data-icon="inline-start" />
        </TransportButton>
        {PlayPause}
        <TransportButton
          onClick={handleStop}
          disabled={state.status === "idle"}
          label="Stop"
          shortcut="Esc"
        >
          <Square data-icon="inline-start" />
        </TransportButton>
        <TransportButton onClick={handleNext} disabled={!canNext} label="Next" shortcut="→">
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
