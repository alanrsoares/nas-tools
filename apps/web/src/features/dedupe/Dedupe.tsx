import { useMutation } from "@tanstack/react-query";
import { Copy, Loader2, Search, Trash2 } from "lucide-react";
import React from "react";
import { EmptyState, ResponsiveCard, ResponsiveCardContent, Toolbar } from "@/components/styled";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { authHeaders } from "@/lib/auth";
import { api } from "../../api";
import { Summary, SummaryCell } from "../../components/IssueList";
import { formatBytes, readSseStream } from "../../utils";

type DedupeGroup = {
  id: string;
  release: { artist: string; album: string };
  winner: AlbumFolder;
  losers: AlbumFolder[];
};

type AlbumFolder = {
  path: string;
  trackCount: number;
  totalSize: number;
  sampleRate: number;
  bitsPerSample: number;
  bitrate: number;
};

type DedupeResults = {
  duplicates: DedupeGroup[];
  moves: { from: string; to: string; reason: string }[];
};

type DedupeStatus = {
  type: string;
  message: string;
  current?: number;
  total?: number;
};

function useDedupeScan() {
  const [results, setResults] = React.useState<DedupeResults>();
  const [status, setStatus] = React.useState<DedupeStatus>();
  const [isScanning, setIsScanning] = React.useState(false);

  async function startScan() {
    setIsScanning(true);
    setResults(undefined);
    setStatus({ type: "connecting", message: "Connecting..." });
    try {
      const response = await fetch("/api/music-dedupe/scan", { headers: authHeaders() });
      const reader = response.body?.getReader();
      if (!reader) return;
      await readSseStream(reader, (data) => {
        if (
          data !== null &&
          typeof data === "object" &&
          "type" in data &&
          (data as { type: string }).type === "result"
        ) {
          setResults(data as unknown as DedupeResults);
          setStatus(undefined);
        } else {
          setStatus(data as DedupeStatus);
        }
      });
    } catch (e) {
      console.error("Scan failed:", e);
      setStatus({ type: "error", message: "Scan failed. Check console." });
    } finally {
      setIsScanning(false);
    }
  }

  return { results, status, isScanning, startScan };
}

type DedupeProgressProps = {
  status: DedupeStatus;
};

function DedupeProgress({ status }: DedupeProgressProps) {
  const showProgress = status.current !== undefined && status.total !== undefined;
  const progressPercent =
    status.current !== undefined && status.total !== undefined
      ? Math.round((status.current / status.total) * 100)
      : 0;
  return (
    <div className="mt-8 flex flex-col items-center justify-center p-12 max-md:p-6 text-center">
      <Loader2 size={32} className="animate-spin mb-4 text-primary" />
      <div className="text-lg font-medium mb-1">{status.message}</div>
      {showProgress && (
        <div className="w-full max-w-md mt-4">
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>
              {status.current} / {status.total} albums
            </span>
            <span>{progressPercent}%</span>
          </div>
          <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

type DedupeGroupCardProps = {
  group: DedupeGroup;
};

function AlbumFolderRow({
  folder,
  type,
}: {
  folder: AlbumFolder;
  type: "keep" | "move";
}) {
  const isKeep = type === "keep";
  const bgClass = isKeep
    ? "bg-success/5 border-success/20 hover:bg-success/10"
    : "bg-muted/30 border-border/50 hover:bg-muted/50";
  const badgeVariant = isKeep ? "success" : "secondary";
  const badgeLabel = isKeep ? "KEEP" : "MOVE";

  const sr = folder.sampleRate >= 1000 ? `${folder.sampleRate / 1000}kHz` : `${folder.sampleRate}Hz`;
  const specs = [`${folder.bitsPerSample}bit`, sr];
  if (folder.bitrate) specs.push(`${Math.round(folder.bitrate)}kbps`);
  const specsStr = specs.join(" / ");

  return (
    <div className={`flex flex-col gap-2 p-2.5 rounded-lg border transition-colors ${bgClass}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge variant={badgeVariant} className="text-[10px] font-bold px-1.5 py-0.5">
            {badgeLabel}
          </Badge>
          <span className="text-[11px] font-semibold text-foreground/90">
            {specsStr}
          </span>
        </div>
        <span className="text-[10px] text-muted-foreground/80 font-medium">
          {folder.trackCount} tracks • {formatBytes(folder.totalSize)}
        </span>
      </div>
      <div className="text-[11px] font-mono text-muted-foreground/90 break-all select-all leading-normal bg-background/40 p-1.5 rounded border border-border/20">
        {folder.path}
      </div>
    </div>
  );
}

function DedupeGroupCard({ group }: DedupeGroupCardProps) {
  return (
    <Card key={group.id} className="border-border/50">
      <CardContent className="p-3 max-md:p-2.5">
        <div className="flex justify-between items-start mb-2.5">
          <div>
            <h3 className="font-bold text-sm text-foreground/95">
              {group.release.artist} — {group.release.album}
            </h3>
            <p className="text-[10px] text-muted-foreground mt-0.5">{group.id}</p>
          </div>
        </div>
        <div className="grid gap-2">
          <AlbumFolderRow folder={group.winner} type="keep" />
          {group.losers.map((loser, idx) => (
            <AlbumFolderRow key={idx} folder={loser} type="move" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

type DedupeBodyProps = {
  isScanning: boolean;
  status: DedupeStatus | undefined;
  duplicates: DedupeGroup[];
};

function DedupeBody({ isScanning, status, duplicates }: DedupeBodyProps) {
  if (isScanning && status) return <DedupeProgress status={status} />;
  if (duplicates.length > 0) {
    return (
      <div className="grid gap-4 mt-4">
        {duplicates.map((group) => (
          <DedupeGroupCard key={group.id} group={group} />
        ))}
      </div>
    );
  }
  return (
    <EmptyState>
      <Copy size={28} />
      <span>
        {status?.type === "error"
          ? status.message
          : "Scan your music library to find duplicate releases."}
      </span>
    </EmptyState>
  );
}

export function Dedupe() {
  const { results, status, isScanning, startScan } = useDedupeScan();

  const apply = useMutation({
    mutationFn: async (moves: { from: string; to: string; reason: string }[]) =>
      await api["music-dedupe"].apply.post({ moves }),
    onSuccess: () => {
      startScan();
    },
  });

  const duplicates = results?.duplicates ?? [];
  const moves = results?.moves ?? [];

  return (
    <ResponsiveCard>
      <ResponsiveCardContent>
        <Toolbar>
          <Summary aria-label="Dedupe summary">
            <SummaryCell label="Duplicates Found" value={duplicates.length} />
            <SummaryCell label="Folders to Move" value={moves.length} />
          </Summary>
          <div className="flex gap-2 items-center toolbar-actions max-md:w-full [&>button]:max-md:flex-1">
            <Button
              onClick={startScan}
              disabled={isScanning || apply.isPending}
              size="sm"
              variant="outline"
            >
              <Search size={15} />
              <span>{isScanning ? "Scanning…" : "Scan Library"}</span>
            </Button>
            {moves.length > 0 && (
              <Button
                onClick={() => apply.mutate(moves)}
                disabled={apply.isPending || isScanning}
                size="sm"
              >
                {apply.isPending ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Trash2 size={15} />
                )}
                <span>{apply.isPending ? "Applying…" : "Apply Dedupe"}</span>
              </Button>
            )}
          </div>
        </Toolbar>
        <DedupeBody isScanning={isScanning} status={status} duplicates={duplicates} />
      </ResponsiveCardContent>
    </ResponsiveCard>
  );
}
