import { Separator } from "@/components/ui/separator";
import { usePlayer } from "../PlayerProvider";

const basename = (filePath: string) =>
  filePath
    .split("/")
    .pop()
    ?.replace(/\.[^.]+$/, "")
    .replace(/^\d+[\s._-]+/, "") ?? filePath;

export function QueuePanel() {
  const [{ playlist, playlistIdx }] = usePlayer();
  const nextStart = Math.max(playlistIdx + 1, 0);
  const upcoming = playlist.slice(nextStart, nextStart + 4);
  const remaining = Math.max(playlist.length - nextStart, 0);
  if (upcoming.length === 0) return null;

  return (
    <div>
      <Separator className="mb-3" />
      <p className="mb-2 text-xs font-medium text-muted-foreground">Up next · {remaining}</p>
      <ol className="flex flex-col gap-1">
        {upcoming.map((filePath, index) => (
          <li
            key={`${nextStart + index}-${filePath}`}
            className="flex min-w-0 items-baseline gap-2 text-xs text-muted-foreground"
          >
            <span className="w-5 shrink-0 text-right tabular-nums text-muted-foreground/60">
              {nextStart + index + 1}
            </span>
            <span className="truncate">{basename(filePath)}</span>
          </li>
        ))}
      </ol>
      {remaining > 4 && (
        <p className="mt-1.5 text-xs text-muted-foreground/60">+{remaining - 4} more in queue</p>
      )}
    </div>
  );
}
