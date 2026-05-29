import { ListMusic } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    <Card className="bg-muted/30">
      <CardHeader className="px-3 py-2">
        <CardTitle className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <ListMusic data-icon="inline-start" />
          <span>Up next · {remaining}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1 px-3 pb-3 pt-0">
        {upcoming.map((filePath, index) => (
          <p
            key={`${nextStart + index}-${filePath}`}
            className="truncate text-xs text-muted-foreground"
          >
            {nextStart + index + 1}. {basename(filePath)}
          </p>
        ))}
        {remaining > 4 && <p className="text-xs text-muted-foreground/60">+{remaining - 4} more</p>}
      </CardContent>
    </Card>
  );
}
