import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Loader2, Scissors, Search } from "lucide-react";
import React from "react";
import { z } from "zod";
import { EmptyState, PathTruncate, Toolbar } from "@/components/styled";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { authHeaders } from "@/lib/auth";
import { IssueList, Summary, SummaryCell } from "../../components/IssueList";
import { readSseStream } from "../../utils";

type CuePair = {
  id: string;
  directory: string;
  cueFile: string;
  audioFile: string;
  blocked: boolean;
  risks: string[];
};

const cuePairSchema = z.object({
  id: z.string(),
  directory: z.string(),
  cueFile: z.string(),
  audioFile: z.string(),
  blocked: z.boolean(),
  risks: z.array(z.string()),
});

const cueScanEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("status"), message: z.string() }),
  z.object({
    type: z.literal("progress"),
    scannedDirectories: z.number(),
    foundPairs: z.number(),
    message: z.string(),
  }),
  z.object({
    type: z.literal("result"),
    root: z.string(),
    pairs: z.array(cuePairSchema),
    ready: z.number(),
    blocked: z.number(),
  }),
  z.object({ type: z.literal("error"), message: z.string() }),
]);

const cueJobResponseSchema = z.object({ ok: z.literal(true), jobId: z.string() });

type CueScanEvent = z.infer<typeof cueScanEventSchema>;

type CueScanStatus = {
  message: string;
  scannedDirectories: number;
  foundPairs: number;
};

type CueScanResult = {
  root: string;
  pairs: CuePair[];
  ready: number;
  blocked: number;
};

function handleCueScanEvent(
  event: CueScanEvent,
  setResult: React.Dispatch<React.SetStateAction<CueScanResult | undefined>>,
  setScanStatus: React.Dispatch<React.SetStateAction<CueScanStatus | undefined>>,
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>,
  setError: React.Dispatch<React.SetStateAction<string | undefined>>,
): void {
  if (event.type === "result") {
    setResult({ root: event.root, pairs: event.pairs, ready: event.ready, blocked: event.blocked });
    setSelectedIds(new Set(event.pairs.filter((p) => !p.blocked).map((p) => p.id)));
    setScanStatus(undefined);
  } else if (event.type === "error") {
    setError(event.message);
  } else if (event.type === "progress") {
    setScanStatus({
      message: event.message,
      scannedDirectories: event.scannedDirectories,
      foundPairs: event.foundPairs,
    });
  } else {
    setScanStatus({ message: event.message, scannedDirectories: 0, foundPairs: 0 });
  }
}

function useCueScan() {
  const [scanStatus, setScanStatus] = React.useState<CueScanStatus>();
  const [result, setResult] = React.useState<CueScanResult>();
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [isScanning, setIsScanning] = React.useState(false);
  const [error, setError] = React.useState<string>();

  async function startScan() {
    setIsScanning(true);
    setError(undefined);
    setResult(undefined);
    setSelectedIds(new Set());
    setScanStatus({ message: "Connecting...", scannedDirectories: 0, foundPairs: 0 });
    try {
      const response = await fetch("/api/cue/scan", { headers: authHeaders() });
      const reader = response.body?.getReader();
      if (!reader) throw new Error("CUE scan stream did not open");
      await readSseStream(reader, (raw) => {
        const event = cueScanEventSchema.parse(raw) as CueScanEvent;
        handleCueScanEvent(event, setResult, setScanStatus, setSelectedIds, setError);
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setIsScanning(false);
    }
  }

  return { scanStatus, result, selectedIds, setSelectedIds, isScanning, error, startScan };
}

type CueScanProgressProps = {
  scanStatus: CueScanStatus;
};

function CueScanProgress({ scanStatus }: CueScanProgressProps) {
  return (
    <div className="mt-8 flex flex-col items-center justify-center p-12 text-center">
      <Loader2 size={32} className="animate-spin mb-4 text-primary" />
      <div className="text-lg font-medium mb-1">{scanStatus.message}</div>
      <div className="text-xs text-muted-foreground">
        {scanStatus.scannedDirectories} directories, {scanStatus.foundPairs} pairs
      </div>
    </div>
  );
}

type CuePairTableProps = {
  pairs: CuePair[];
  selectedIds: Set<string>;
  togglePair: (id: string, checked: boolean) => void;
};

function CuePairTable({ pairs, selectedIds, togglePair }: CuePairTableProps) {
  return (
    <div className="overflow-x-auto rounded-md border border-border mt-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10" />
            <TableHead>CUE</TableHead>
            <TableHead>Audio</TableHead>
            <TableHead className="w-28">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pairs.map((pair) => (
            <TableRow key={pair.id}>
              <TableCell>
                <Checkbox
                  checked={selectedIds.has(pair.id)}
                  disabled={pair.blocked}
                  onCheckedChange={(checked) => togglePair(pair.id, checked === true)}
                />
              </TableCell>
              <TableCell>
                <div className="grid gap-1">
                  <PathTruncate className="font-mono">{pair.cueFile}</PathTruncate>
                  <PathTruncate className="text-xs text-muted-foreground">
                    {pair.directory}
                  </PathTruncate>
                </div>
              </TableCell>
              <TableCell className="font-mono text-xs">{pair.audioFile}</TableCell>
              <TableCell>
                <Badge variant={pair.blocked ? "warning" : "success"}>
                  {pair.blocked ? "Blocked" : "Ready"}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

type CueSplitBodyProps = {
  isScanning: boolean;
  scanStatus: CueScanStatus | undefined;
  result: CueScanResult | undefined;
  selectedIds: Set<string>;
  togglePair: (id: string, checked: boolean) => void;
};

function CueSplitBody({
  isScanning,
  scanStatus,
  result,
  selectedIds,
  togglePair,
}: CueSplitBodyProps) {
  if (isScanning && scanStatus) return <CueScanProgress scanStatus={scanStatus} />;
  if (result && result.pairs.length > 0) {
    return <CuePairTable pairs={result.pairs} selectedIds={selectedIds} togglePair={togglePair} />;
  }
  return (
    <EmptyState>
      <Scissors size={28} />
      <span>Scan the FLAC library for unsplit CUE/audio pairs.</span>
    </EmptyState>
  );
}

type CueSplitToolbarProps = {
  result: CueScanResult | undefined;
  readyPairs: CuePair[];
  selectedPairs: CuePair[];
  isScanning: boolean;
  fixIsPending: boolean;
  onScan: () => void;
  onFix: () => void;
};

type CueSplitActionsProps = {
  readyPairs: CuePair[];
  selectedPairs: CuePair[];
  isScanning: boolean;
  fixIsPending: boolean;
  onScan: () => void;
  onFix: () => void;
};

function CueSplitActions({
  readyPairs,
  selectedPairs,
  isScanning,
  fixIsPending,
  onScan,
  onFix,
}: CueSplitActionsProps) {
  return (
    <div className="flex gap-2 items-center toolbar-actions">
      <Button onClick={onScan} disabled={isScanning || fixIsPending} size="sm" variant="outline">
        {isScanning ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
        <span>{isScanning ? "Scanning..." : "Scan CUE"}</span>
      </Button>
      {readyPairs.length > 0 ? (
        <Button
          onClick={onFix}
          disabled={selectedPairs.length === 0 || isScanning || fixIsPending}
          size="sm"
        >
          {fixIsPending ? <Loader2 size={15} className="animate-spin" /> : <Scissors size={15} />}
          <span>{fixIsPending ? "Starting..." : `Fix ${selectedPairs.length}`}</span>
        </Button>
      ) : null}
    </div>
  );
}

function CueSplitToolbar({
  result,
  readyPairs,
  selectedPairs,
  isScanning,
  fixIsPending,
  onScan,
  onFix,
}: CueSplitToolbarProps) {
  return (
    <Toolbar>
      <Summary aria-label="CUE summary">
        <SummaryCell label="Pairs" value={result?.pairs.length ?? 0} />
        <SummaryCell label="Ready" value={result?.ready ?? 0} />
        <SummaryCell
          label="Blocked"
          value={result?.blocked ?? 0}
          tone={(result?.blocked ?? 0) > 0 ? "warn" : ""}
        />
      </Summary>
      <CueSplitActions
        readyPairs={readyPairs}
        selectedPairs={selectedPairs}
        isScanning={isScanning}
        fixIsPending={fixIsPending}
        onScan={onScan}
        onFix={onFix}
      />
    </Toolbar>
  );
}

export function CueSplit() {
  const navigate = useNavigate();
  const { scanStatus, result, selectedIds, setSelectedIds, isScanning, error, startScan } =
    useCueScan();

  const readyPairs = (result?.pairs ?? []).filter((pair) => !pair.blocked);
  const selectedPairs = readyPairs.filter((pair) => selectedIds.has(pair.id));

  const fixMutation = useMutation({
    mutationFn: async (pairs: CuePair[]) => {
      const response = await fetch("/api/cue/fix/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ pairs }),
      });
      return cueJobResponseSchema.parse(await response.json());
    },
    onSuccess: (data) => navigate({ to: "/jobs", search: { jobId: data.jobId } }),
  });

  const togglePair = (pairId: string, checked: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(pairId);
      else next.delete(pairId);
      return next;
    });
  };

  return (
    <Card>
      <CardContent className="p-4">
        <CueSplitToolbar
          result={result}
          readyPairs={readyPairs}
          selectedPairs={selectedPairs}
          isScanning={isScanning}
          fixIsPending={fixMutation.isPending}
          onScan={startScan}
          onFix={() => fixMutation.mutate(selectedPairs)}
        />
        {error ? <IssueList issues={[{ code: "CUE_ERROR", message: error }]} /> : null}
        <CueSplitBody
          isScanning={isScanning}
          scanStatus={scanStatus}
          result={result}
          selectedIds={selectedIds}
          togglePair={togglePair}
        />
      </CardContent>
    </Card>
  );
}
