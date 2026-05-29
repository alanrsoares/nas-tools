import { useMutation } from "@tanstack/react-query";
import { Copy, Loader2, Search, Trash2 } from "lucide-react";
import React from "react";
import { EmptyState, Toolbar } from "@/components/styled";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "../../api";
import { Summary, SummaryCell } from "../../components/IssueList";
import { readSseStream } from "../../utils";

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
      const response = await fetch("/api/music-dedupe/scan");
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
    <div className="mt-8 flex flex-col items-center justify-center p-12 text-center">
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

function DedupeGroupCard({ group }: DedupeGroupCardProps) {
  return (
    <Card key={group.id} className="border-border/50">
      <CardContent className="p-3">
        <div className="flex justify-between items-start mb-2">
          <div>
            <h3 className="font-bold text-sm">
              {group.release.artist} — {group.release.album}
            </h3>
            <p className="text-xs text-muted-foreground">{group.id}</p>
          </div>
        </div>
        <div className="grid gap-2">
          <div className="flex items-center gap-2 text-xs bg-success/10 p-2 rounded border border-success/20">
            <Badge variant="success">KEEP</Badge>
            <div className="flex-1 truncate font-mono">{group.winner.path}</div>
            <div className="text-muted-foreground whitespace-nowrap">
              {group.winner.bitsPerSample}bit / {group.winner.sampleRate}Hz
            </div>
          </div>
          {group.losers.map((loser, idx) => (
            <div
              key={idx}
              className="flex items-center gap-2 text-xs bg-muted/50 p-2 rounded border border-border/50"
            >
              <Badge variant="secondary">MOVE</Badge>
              <div className="flex-1 truncate font-mono">{loser.path}</div>
              <div className="text-muted-foreground whitespace-nowrap">
                {loser.bitsPerSample}bit / {loser.sampleRate}Hz
              </div>
            </div>
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
    <Card>
      <CardContent className="p-4">
        <Toolbar>
          <Summary aria-label="Dedupe summary">
            <SummaryCell label="Duplicates Found" value={duplicates.length} />
            <SummaryCell label="Folders to Move" value={moves.length} />
          </Summary>
          <div className="flex gap-2 items-center toolbar-actions">
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
      </CardContent>
    </Card>
  );
}
