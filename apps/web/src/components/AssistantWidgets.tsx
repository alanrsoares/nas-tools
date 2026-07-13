import { useState, useEffect } from "react";
import { Check, Download, Scissors, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { api } from "../api";

// Format bytes into readable string
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

interface MovePlanItem {
  id: string;
  sourcePath: string;
  targetPath: string;
  mediaType: "music" | "video" | "unknown";
  albumName: string;
  artistName?: string;
  included: boolean;
}

export function MovePlanWidget({ planId, plan: initialPlan }: { planId: string; plan?: any }) {
  const [plan, setPlan] = useState<any>(initialPlan || null);
  const [items, setItems] = useState<MovePlanItem[]>([]);
  const [cueSplitEnabled, setCueSplitEnabled] = useState(true);
  const [loading, setLoading] = useState(!initialPlan);
  const [submitting, setSubmitting] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!initialPlan) {
      api["move-completed"].plans({ id: planId }).get()
        .then((res) => {
          if (res.error) {
            // biome-ignore lint/complexity/noUselessThisAlias: handle elysia error wrapper
            throw new Error((res.error.value as any)?.message || `HTTP ${res.status}`);
          }
          const data = res.data;
          if (data && data.ok) {
            setPlan(data.plan);
            setItems(data.plan.items);
            setCueSplitEnabled(data.plan.cueSplitEnabled);
          } else {
            throw new Error("Failed to load plan");
          }
        })
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false));
    } else {
      setItems(initialPlan.items || []);
      setCueSplitEnabled(initialPlan.cueSplitEnabled);
    }
  }, [planId, initialPlan]);

  const handleToggleInclude = (id: string, val: boolean) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, included: val } : item))
    );
  };

  const handleArtistChange = (id: string, val: string) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, artistName: val } : item))
    );
  };

  const handleConfirm = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await api["move-completed"].plans({ id: planId }).confirm.post({
        items: items.map((item) => ({
          id: item.id,
          artistName: item.artistName || undefined,
          included: item.included,
        })),
        cueSplitEnabled,
      });

      if (res.error) {
        throw new Error((res.error.value as any)?.message || "Failed to confirm plan");
      }
      const data = res.data;
      if (!data || !data.ok) {
        throw new Error("Failed to confirm plan");
      }

      setJobId(data.jobId);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-6 gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <span>Loading Move Plan...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-start gap-2 p-3 rounded-lg border border-destructive/20 bg-destructive/10 text-destructive text-xs">
        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
        <span>{error}</span>
      </div>
    );
  }

  if (jobId) {
    return (
      <div className="flex flex-col items-center justify-center p-4 rounded-xl border border-primary/20 bg-primary/5 text-center">
        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-3">
          <Check className="h-5 w-5" />
        </div>
        <h4 className="text-sm font-semibold text-foreground mb-1">Move Plan Confirmed!</h4>
        <p className="text-xs text-muted-foreground mb-3">
          Files are being moved. Job has been queued.
        </p>
        <Badge variant="outline" className="font-mono text-[10px]">
          Job ID: {jobId.slice(0, 8)}...
        </Badge>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3.5 p-4 rounded-xl border border-border bg-card/50">
      <div className="flex items-center justify-between border-b border-border/40 pb-2">
        <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">
          Interactive Move Plan
        </h4>
        <Badge variant="secondary" className="text-[10px]">
          {items.filter((i) => i.included).length} items selected
        </Badge>
      </div>

      <div className="flex flex-col gap-3 max-h-[220px] overflow-y-auto pr-1">
        {items.map((item) => (
          <div
            key={item.id}
            className={`flex items-start gap-2.5 p-2.5 rounded-lg border transition-all ${
              item.included ? "border-border bg-background/40" : "border-border/30 opacity-60"
            }`}
          >
            <Checkbox
              id={`include-${item.id}`}
              checked={item.included}
              onCheckedChange={(checked) => handleToggleInclude(item.id, !!checked)}
              className="mt-1"
            />
            <div className="flex-1 flex flex-col gap-1.5 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-foreground truncate" title={item.albumName}>
                  {item.albumName}
                </span>
                <Badge variant="outline" className="text-[9px] uppercase px-1 py-0 h-4">
                  {item.mediaType}
                </Badge>
              </div>

              {item.mediaType === "music" && item.included && (
                <div className="flex flex-col gap-1">
                  <label htmlFor={`artist-${item.id}`} className="text-[10px] text-muted-foreground">
                    Artist Name
                  </label>
                  <Input
                    id={`artist-${item.id}`}
                    value={item.artistName || ""}
                    onChange={(e) => handleArtistChange(item.id, e.target.value)}
                    placeholder="Enter artist name..."
                    className="h-7 text-xs px-2 focus-visible:ring-primary/20"
                  />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 border-t border-border/40 pt-3">
        <div className="flex items-center gap-2">
          <Checkbox
            id="cue-split-toggle"
            checked={cueSplitEnabled}
            onCheckedChange={(checked) => setCueSplitEnabled(!!checked)}
          />
          <label htmlFor="cue-split-toggle" className="text-xs text-muted-foreground select-none cursor-pointer">
            Automatically split CUE files on import
          </label>
        </div>

        <Button
          onClick={handleConfirm}
          disabled={submitting || items.filter((i) => i.included).length === 0}
          size="sm"
          className="w-full text-xs"
        >
          {submitting ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
              Confirming Move...
            </>
          ) : (
            <>
              <Check className="h-3.5 w-3.5 mr-1" />
              Confirm Move Plan
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

interface SearchResultItem {
  guid: string;
  title: string;
  size: number;
  indexer: string;
  seeders: number;
  leechers: number;
  downloadUrl: string | null;
  libraryMatch?: {
    exists: boolean;
    path?: string;
  };
}

export function SearchWidget({ results }: { results: SearchResultItem[] }) {
  const [downloading, setDownloading] = useState<Record<string, "pending" | "success" | "duplicate" | "error">>({});

  const handleDownload = async (guid: string, url: string | null) => {
    if (!url) return;
    setDownloading((prev) => ({ ...prev, [guid]: "pending" }));
    try {
      const res = await api.transmission.add.post({ url });
      if (res.error) {
        throw new Error((res.error.value as any)?.message || "Failed to add torrent");
      }
      const data = res.data;
      if (!data || !data.ok) {
        throw new Error("Failed to add torrent");
      }

      setDownloading((prev) => ({
        ...prev,
        [guid]: data.duplicate ? "duplicate" : "success",
      }));
    } catch (err) {
      setDownloading((prev) => ({ ...prev, [guid]: "error" }));
    }
  };

  const displayedResults = results.slice(0, 3); // show top 3 results

  return (
    <div className="flex flex-col gap-3 p-4 rounded-xl border border-border bg-card/50">
      <div className="flex items-center justify-between border-b border-border/40 pb-2">
        <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">
          Prowlarr Release Search
        </h4>
        <Badge variant="outline" className="text-[9px]">
          Top {displayedResults.length} indexer hits
        </Badge>
      </div>

      <div className="flex flex-col gap-2.5">
        {displayedResults.map((res) => {
          const status = downloading[res.guid];
          const inLibrary = res.libraryMatch?.exists;

          return (
            <div
              key={res.guid}
              className="flex flex-col gap-2 p-2.5 rounded-lg border border-border/60 bg-background/40"
            >
              <div className="flex flex-col gap-1 min-w-0">
                <span className="text-xs font-semibold text-foreground leading-normal line-clamp-2" title={res.title}>
                  {res.title}
                </span>
                <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                  <span>{formatBytes(res.size)}</span>
                  <span>•</span>
                  <span className="text-emerald-500 font-semibold">{res.seeders} S</span>
                  <span>/</span>
                  <span className="text-amber-500 font-semibold">{res.leechers} L</span>
                  <span>•</span>
                  <span className="italic font-mono text-[9px]">{res.indexer}</span>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 border-t border-border/20 pt-2 mt-0.5">
                <div>
                  {inLibrary ? (
                    <Badge variant="outline" className="bg-emerald-500/10 border-emerald-500/30 text-emerald-500 text-[9px] px-1.5 py-0.5">
                      Already in Library
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-muted border-transparent text-muted-foreground text-[9px] px-1.5 py-0.5">
                      New Release
                    </Badge>
                  )}
                </div>

                {!inLibrary && res.downloadUrl && (
                  <Button
                    onClick={() => handleDownload(res.guid, res.downloadUrl)}
                    disabled={!!status}
                    size="sm"
                    className="h-7 text-[10px] px-2.5 gap-1"
                    variant={status === "success" || status === "duplicate" ? "secondary" : "default"}
                  >
                    {status === "pending" && (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin mr-0.5" />
                        Adding...
                      </>
                    )}
                    {status === "success" && (
                      <>
                        <Check className="h-3 w-3 mr-0.5" />
                        Added
                      </>
                    )}
                    {status === "duplicate" && (
                      <>
                        <Check className="h-3 w-3 mr-0.5" />
                        Duplicate
                      </>
                    )}
                    {status === "error" && "Retry"}
                    {!status && (
                      <>
                        <Download className="h-3 w-3" />
                        Download
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface CuePairItem {
  id: string;
  directory: string;
  cueFile: string;
  audioFile: string;
  blocked: boolean;
  risks: string[];
}

export function CueSplitWidget({ pairs }: { pairs: CuePairItem[] }) {
  const [submitting, setSubmitting] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSplit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.cue.fix.jobs.post({ pairs });
      if (res.error) {
        throw new Error((res.error.value as any)?.message || "Failed to split CUE files");
      }
      const data = res.data;
      if (!data || !data.ok) {
        throw new Error("Failed to split CUE files");
      }

      setJobId(data.jobId);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const activePairs = pairs.filter((p) => !p.blocked);

  if (jobId) {
    return (
      <div className="flex flex-col items-center justify-center p-4 rounded-xl border border-primary/20 bg-primary/5 text-center">
        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-3">
          <Scissors className="h-5 w-5" />
        </div>
        <h4 className="text-sm font-semibold text-foreground mb-1">CUE Split Scheduled!</h4>
        <p className="text-xs text-muted-foreground mb-3">
          Splitting job started for {activePairs.length} file(s).
        </p>
        <Badge variant="outline" className="font-mono text-[10px]">
          Job ID: {jobId.slice(0, 8)}...
        </Badge>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3.5 p-4 rounded-xl border border-border bg-card/50">
      <div className="flex items-center justify-between border-b border-border/40 pb-2">
        <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">
          Interactive CUE Splitter
        </h4>
        <Badge variant="secondary" className="text-[10px]">
          {activePairs.length} pairs ready
        </Badge>
      </div>

      <div className="flex flex-col gap-2.5 max-h-[180px] overflow-y-auto pr-1">
        {pairs.map((pair) => (
          <div
            key={pair.id}
            className="flex flex-col gap-1 p-2 rounded-lg border border-border/60 bg-background/40 text-xs"
          >
            <div className="font-medium text-foreground truncate" title={pair.cueFile}>
              {pair.cueFile}
            </div>
            <div className="text-[10px] text-muted-foreground truncate" title={pair.directory}>
              Folder: {pair.directory.split("/").pop()}
            </div>
            {pair.blocked && (
              <Badge variant="destructive" className="self-start text-[8px] px-1 py-0 mt-1 uppercase">
                Blocked
              </Badge>
            )}
            {pair.risks.length > 0 && (
              <div className="text-[9px] text-amber-500 mt-1 flex items-start gap-1 font-medium">
                <AlertCircle className="h-3 w-3 shrink-0" />
                <span>{pair.risks[0]}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {error && (
        <div className="flex items-start gap-2 p-2.5 rounded-lg border border-destructive/20 bg-destructive/10 text-destructive text-xs">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <Button
        onClick={handleSplit}
        disabled={submitting || activePairs.length === 0}
        size="sm"
        className="w-full text-xs"
      >
        {submitting ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
            Scheduling split...
          </>
        ) : (
          <>
            <Scissors className="h-3.5 w-3.5 mr-1" />
            Split {activePairs.length} CUE File(s)
          </>
        )}
      </Button>
    </div>
  );
}
