import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowDown,
  CheckCircle2,
  Download,
  Film,
  FolderCog,
  Pause,
  Play,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  OverviewAggregateRate,
  OverviewCardHeader,
  OverviewCardTitle,
  OverviewDlControls,
  OverviewDlEta,
  OverviewDlFooter,
  OverviewDlHeader,
  OverviewDlHeaderStats,
  OverviewDlItem,
  OverviewDlList,
  OverviewDlName,
  OverviewDlPct,
  OverviewDlRate,
  OverviewDlSpeed,
  OverviewDlStatusDot,
  OverviewGrid,
  OverviewIdle,
  OverviewOrphanItem,
  OverviewOrphanList,
  OverviewStat,
  OverviewStatLabel,
  OverviewStats,
  OverviewStatValue,
  ResponsiveCard,
  ResponsiveCardContent,
  StagingCueIndicator,
} from "@/components/styled";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { authHeaders, withToken } from "@/lib/auth";
import { api, queryClient } from "../../api";
import { TintedProgress } from "../../components/tinted-progress";
import type { ActiveDownload, OrphanedTorrent, StagingPreviewItem } from "../../types";
import { formatBytes, formatEta } from "../../utils";
import { isLikelyVideo } from "../downloads/plex-fit";

type TransmissionStatus = {
  downloading: ActiveDownload[];
  seeding: number;
  orphaned: OrphanedTorrent[];
  total: number;
};

type StagingStatus = {
  total: number;
  withCue: number;
  preview?: StagingPreviewItem[];
};

type DashboardData = {
  transmission: TransmissionStatus | null;
  staging: StagingStatus | null;
};

type StagingPreviewListProps = {
  staging: StagingStatus;
};

function StagingPreviewList({ staging }: StagingPreviewListProps) {
  if (!staging.preview || staging.preview.length === 0) return null;
  return (
    <OverviewOrphanList>
      {staging.preview.map((item) => (
        <OverviewOrphanItem key={item.name} as="div">
          {item.hasCue ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <StagingCueIndicator role="img" aria-label="Has CUE file">
                  ♪
                </StagingCueIndicator>
              </TooltipTrigger>
              <TooltipContent>Contains .cue file</TooltipContent>
            </Tooltip>
          ) : null}
          {item.name}
        </OverviewOrphanItem>
      ))}
      {staging.total > 5 ? (
        <OverviewOrphanItem $muted as="div">
          +{staging.total - 5} more
        </OverviewOrphanItem>
      ) : null}
    </OverviewOrphanList>
  );
}

type StagingAreaBodyProps = {
  staging: StagingStatus;
};

function StagingAreaBody({ staging }: StagingAreaBodyProps) {
  return (
    <>
      <OverviewStats>
        <OverviewStat>
          <OverviewStatValue>{staging.total}</OverviewStatValue>
          <OverviewStatLabel>items</OverviewStatLabel>
        </OverviewStat>
        {staging.withCue > 0 ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <OverviewStat $warn>
                <OverviewStatValue>{staging.withCue}</OverviewStatValue>
                <OverviewStatLabel>need CUE split</OverviewStatLabel>
              </OverviewStat>
            </TooltipTrigger>
            <TooltipContent>
              Items containing .cue files that may need splitting before moving
            </TooltipContent>
          </Tooltip>
        ) : null}
      </OverviewStats>
      <StagingPreviewList staging={staging} />
    </>
  );
}

type OrphanedListProps = {
  orphaned: OrphanedTorrent[];
};

function OrphanedList({ orphaned }: OrphanedListProps) {
  if (orphaned.length === 0) return null;
  return (
    <OverviewOrphanList>
      {orphaned.slice(0, 4).map((o) => (
        <OverviewOrphanItem key={o.id} as="div">
          {o.name}
        </OverviewOrphanItem>
      ))}
      {orphaned.length > 4 ? (
        <OverviewOrphanItem $muted as="div">
          +{orphaned.length - 4} more
        </OverviewOrphanItem>
      ) : null}
    </OverviewOrphanList>
  );
}

type CleanTorrentsMutation = {
  isPending: boolean;
  isSuccess: boolean;
  data: { data: unknown } | undefined;
  mutate: () => void;
};

type CleanButtonProps = {
  cleanTorrents: CleanTorrentsMutation;
  orphanedCount: number;
};

function CleanButton({ cleanTorrents, orphanedCount }: CleanButtonProps) {
  return (
    <Button
      size="sm"
      variant={orphanedCount > 0 ? "default" : "ghost"}
      className="w-full mt-auto"
      disabled={orphanedCount === 0 || cleanTorrents.isPending}
      onClick={() => cleanTorrents.mutate()}
    >
      {cleanTorrents.isPending ? (
        <Spinner className="size-[13px]" />
      ) : cleanTorrents.isSuccess ? (
        <CheckCircle2 size={13} />
      ) : (
        <Trash2 size={13} />
      )}
      {cleanTorrents.isPending
        ? "Cleaning…"
        : cleanTorrents.isSuccess
          ? "Cleaned"
          : "Clean orphans"}
    </Button>
  );
}

type ActiveDownloadsCardProps = {
  tx: TransmissionStatus | null;
  loading: boolean;
};

function compareActiveTorrents(a: ActiveDownload, b: ActiveDownload): number {
  // 1. Not paused (status !== 0) goes before paused (status === 0)
  const aActive = a.status !== 0;
  const bActive = b.status !== 0;
  if (aActive !== bActive) {
    return aActive ? -1 : 1;
  }

  // 2. Active downloads with speed > 0 go first
  if (aActive) {
    const aDownloading = a.rateDownload > 0;
    const bDownloading = b.rateDownload > 0;
    if (aDownloading !== bDownloading) {
      return aDownloading ? -1 : 1;
    }
  }

  if (a.progress !== b.progress) {
    return b.progress - a.progress;
  }
  return a.name.localeCompare(b.name);
}

function sortActiveTorrents(torrents: ActiveDownload[]): ActiveDownload[] {
  return [...torrents].sort(compareActiveTorrents);
}

function sortNonStartedTorrents(torrents: ActiveDownload[]): ActiveDownload[] {
  return [...torrents].sort((a, b) => a.name.localeCompare(b.name));
}

type NonStartedTorrentsListProps = {
  torrents: ActiveDownload[];
  showAll: boolean;
  onToggleShowAll: () => void;
};

function NonStartedTorrentsList({
  torrents,
  showAll,
  onToggleShowAll,
}: NonStartedTorrentsListProps) {
  if (torrents.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5 mt-1">
      <div className="flex items-center justify-between px-1">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
          Unstarted / Inactive ({torrents.length})
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-5 px-1.5 text-[10px] text-muted-foreground/80 hover:text-foreground hover:bg-accent/30"
          onClick={onToggleShowAll}
        >
          {showAll ? "Collapse" : "Show all"}
        </Button>
      </div>
      {showAll && (
        <OverviewDlList>
          {torrents.map((t) => (
            <ActiveDownloadRow key={t.id} torrent={t} />
          ))}
        </OverviewDlList>
      )}
    </div>
  );
}

type ActiveDownloadsBodyProps = {
  loading: boolean;
  tx: TransmissionStatus | null;
  downloadingCount: number;
  sortedActive: ActiveDownload[];
  sortedUnstarted: ActiveDownload[];
  showAllUnstarted: boolean;
  setShowAllUnstarted: (show: boolean) => void;
};

function ActiveDownloadsBody({
  loading,
  tx,
  downloadingCount,
  sortedActive,
  sortedUnstarted,
  showAllUnstarted,
  setShowAllUnstarted,
}: ActiveDownloadsBodyProps) {
  if (loading) {
    return (
      <OverviewIdle>
        <Spinner className="size-[14px]" /> Loading…
      </OverviewIdle>
    );
  }
  if (tx === null) {
    return <OverviewIdle>Transmission unreachable</OverviewIdle>;
  }
  if (downloadingCount === 0) {
    return <OverviewIdle>Nothing downloading</OverviewIdle>;
  }

  return (
    <div className="flex flex-col gap-3">
      {sortedActive.length > 0 && (
        <OverviewDlList>
          {sortedActive.map((t) => (
            <ActiveDownloadRow key={t.id} torrent={t} />
          ))}
        </OverviewDlList>
      )}

      <NonStartedTorrentsList
        torrents={sortedUnstarted}
        showAll={showAllUnstarted}
        onToggleShowAll={() => setShowAllUnstarted(!showAllUnstarted)}
      />
    </div>
  );
}

function ActiveDownloadsCard({ tx, loading }: ActiveDownloadsCardProps) {
  const [showAllUnstarted, setShowAllUnstarted] = useState(false);

  const downloading = tx?.downloading ?? [];
  const activeOrInProgress = downloading.filter((t) => t.status !== 0 || t.progress > 0.001);
  const unstartedTorrents = downloading.filter((t) => t.status === 0 && t.progress <= 0.001);

  const sortedActive = sortActiveTorrents(activeOrInProgress);
  const sortedUnstarted = sortNonStartedTorrents(unstartedTorrents);

  const totalRate = downloading.reduce((sum, t) => sum + Math.max(t.rateDownload, 0), 0);

  return (
    <ResponsiveCard className="col-span-full">
      <ResponsiveCardContent className="flex flex-col gap-3">
        <OverviewCardHeader>
          <OverviewCardTitle>
            <Download size={13} />
            Active Downloads
          </OverviewCardTitle>
          {tx ? (
            <OverviewDlHeaderStats>
              {totalRate > 0 ? (
                <OverviewAggregateRate>
                  <ArrowDown size={11} />
                  {formatBytes(totalRate)}/s
                </OverviewAggregateRate>
              ) : null}
              <span className="text-xs text-muted-foreground">
                {tx.seeding > 0 ? `${tx.seeding} seeding · ` : ""}
                {tx.total} total
              </span>
            </OverviewDlHeaderStats>
          ) : null}
        </OverviewCardHeader>
        <ActiveDownloadsBody
          loading={loading}
          tx={tx}
          downloadingCount={downloading.length}
          sortedActive={sortedActive}
          sortedUnstarted={sortedUnstarted}
          showAllUnstarted={showAllUnstarted}
          setShowAllUnstarted={setShowAllUnstarted}
        />
      </ResponsiveCardContent>
    </ResponsiveCard>
  );
}

type StagingAreaCardProps = {
  staging: StagingStatus | null;
  loading: boolean;
  navigate: ReturnType<typeof useNavigate>;
};

function StagingAreaCard({ staging, loading, navigate }: StagingAreaCardProps) {
  const hasItems = staging !== null && staging.total > 0;
  return (
    <ResponsiveCard>
      <ResponsiveCardContent className="flex flex-col gap-3 h-full">
        <OverviewCardHeader>
          <OverviewCardTitle>
            <FolderCog size={13} />
            Staging Area
          </OverviewCardTitle>
        </OverviewCardHeader>
        {loading ? (
          <OverviewIdle>
            <Spinner className="size-[14px]" /> Loading…
          </OverviewIdle>
        ) : staging === null ? (
          <OverviewIdle>Staging dir unavailable</OverviewIdle>
        ) : staging.total === 0 ? (
          <OverviewIdle>
            <CheckCircle2 size={14} className="text-success-foreground" />
            Staging area clear
          </OverviewIdle>
        ) : (
          <StagingAreaBody staging={staging} />
        )}
        <Button
          size="sm"
          variant={hasItems ? "default" : "outline"}
          className="w-full mt-auto"
          onClick={() => navigate({ to: "/staging" })}
        >
          <FolderCog size={13} />
          {hasItems ? "Review & Move" : "Go to Staging"}
        </Button>
      </ResponsiveCardContent>
    </ResponsiveCard>
  );
}

type OrphanedTorrentsCardProps = {
  tx: TransmissionStatus | null;
  loading: boolean;
  cleanTorrents: CleanTorrentsMutation;
};

function OrphanedTorrentsCard({ tx, loading, cleanTorrents }: OrphanedTorrentsCardProps) {
  return (
    <ResponsiveCard>
      <ResponsiveCardContent className="flex flex-col gap-3">
        <OverviewCardHeader>
          <OverviewCardTitle>
            <Trash2 size={13} />
            Orphaned Torrents
          </OverviewCardTitle>
        </OverviewCardHeader>
        {loading ? (
          <OverviewIdle>
            <Spinner className="size-[14px]" /> Loading…
          </OverviewIdle>
        ) : tx === null ? (
          <OverviewIdle>Transmission unreachable</OverviewIdle>
        ) : (
          <>
            <OverviewStats>
              <OverviewStat $warn={tx.orphaned.length > 0}>
                <OverviewStatValue>{tx.orphaned.length}</OverviewStatValue>
                <OverviewStatLabel>
                  {tx.orphaned.length === 1 ? "torrent" : "torrents"}
                </OverviewStatLabel>
              </OverviewStat>
            </OverviewStats>
            <OrphanedList orphaned={tx.orphaned} />
            <CleanButton cleanTorrents={cleanTorrents} orphanedCount={tx.orphaned.length} />
          </>
        )}
      </ResponsiveCardContent>
    </ResponsiveCard>
  );
}

type ActiveDownloadRowProps = { torrent: ActiveDownload };

function DownloadRate({ torrent }: { torrent: ActiveDownload }) {
  if (torrent.rateDownload <= 0) {
    return <OverviewDlSpeed>{torrent.status === 0 ? "paused" : "—"}</OverviewDlSpeed>;
  }
  const etaSeconds = (torrent.totalSize * (1 - torrent.progress)) / torrent.rateDownload;
  return (
    <>
      <OverviewDlSpeed>{formatBytes(torrent.rateDownload)}/s</OverviewDlSpeed>
      <OverviewDlEta>{formatEta(etaSeconds)} left</OverviewDlEta>
    </>
  );
}

type PreviewStatus =
  | { kind: "loading" }
  | { kind: "unavailable" }
  | { kind: "ready"; safeBytes: number; fileLength: number };

async function fetchPreviewStatus(torrentId: number): Promise<PreviewStatus> {
  try {
    const res = await fetch(`/api/transmission/torrents/${torrentId}/preview/status`, {
      headers: authHeaders(),
    });
    if (!res.ok) return { kind: "unavailable" };
    const data = (await res.json()) as { safeBytes: number; fileLength: number };
    return { kind: "ready", safeBytes: data.safeBytes, fileLength: data.fileLength };
  } catch {
    return { kind: "unavailable" };
  }
}

function usePreviewStatus(torrentId: number, open: boolean): PreviewStatus {
  const [status, setStatus] = useState<PreviewStatus>({ kind: "loading" });

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setStatus({ kind: "loading" });

    const poll = async () => {
      const next = await fetchPreviewStatus(torrentId);
      if (!cancelled) setStatus(next);
    };

    poll();
    const interval = setInterval(poll, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [open, torrentId]);

  return status;
}

type PreviewDialogProps = {
  torrentId: number;
  name: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function PreviewDialog({ torrentId, name, open, onOpenChange }: PreviewDialogProps) {
  const status = usePreviewStatus(torrentId, open);
  const previewUrl = withToken(`/api/transmission/torrents/${torrentId}/preview`);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{name}</DialogTitle>
          <DialogDescription>
            Partial preview — plays whatever has downloaded so far. Won't seek past the buffered
            point.
          </DialogDescription>
        </DialogHeader>
        {status.kind === "loading" ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Spinner className="size-[16px]" /> Checking downloaded data…
          </div>
        ) : status.kind === "unavailable" ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            No previewable video yet — needs an mp4/webm file with enough contiguous data
            downloaded.
          </div>
        ) : (
          <>
            {/* biome-ignore lint/a11y/useMediaCaption: partial-download preview has no caption source */}
            <video controls autoPlay src={previewUrl} className="w-full rounded-md bg-black" />
            <p className="mt-2 text-[11px] tabular-nums text-muted-foreground">
              {formatBytes(status.safeBytes)} buffered
              {status.fileLength > status.safeBytes ? ` of ${formatBytes(status.fileLength)}` : ""}
            </p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ActiveDownloadRow({ torrent }: ActiveDownloadRowProps) {
  const isPaused = torrent.status === 0;
  const [previewOpen, setPreviewOpen] = useState(false);

  const action = useMutation({
    mutationFn: async (act: "pause" | "resume" | "remove") =>
      await api.transmission
        .torrents({ id: String(torrent.id) })({ action: act })
        .post(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
  });

  const pending = action.isPending;

  return (
    <OverviewDlItem $inactive={isPaused}>
      <OverviewDlHeader>
        <OverviewDlStatusDot $active={!isPaused && torrent.rateDownload > 0} />
        <OverviewDlName $inactive={isPaused}>{torrent.name}</OverviewDlName>
        <OverviewDlPct className={isPaused ? "text-muted-foreground/60" : ""}>
          {Math.round(torrent.progress * 100)}%
        </OverviewDlPct>
      </OverviewDlHeader>
      <TintedProgress
        value={torrent.progress * 100}
        className="h-1.5 bg-muted"
        indicatorClassName={isPaused ? "bg-muted-foreground opacity-30" : ""}
      />
      <OverviewDlFooter>
        <OverviewDlRate>
          <DownloadRate torrent={torrent} />
        </OverviewDlRate>
        <OverviewDlControls>
          {isLikelyVideo(torrent.name) ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0 max-md:h-8 max-md:w-8"
                  onClick={() => setPreviewOpen(true)}
                >
                  <Film size={11} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Preview partial download</TooltipContent>
            </Tooltip>
          ) : null}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0 max-md:h-8 max-md:w-8"
                disabled={pending}
                onClick={() => action.mutate(isPaused ? "resume" : "pause")}
              >
                {pending && action.variables !== "remove" ? (
                  <Spinner className="size-[11px]" />
                ) : isPaused ? (
                  <Play size={11} />
                ) : (
                  <Pause size={11} />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{isPaused ? "Resume" : "Pause"}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive max-md:h-8 max-md:w-8"
                disabled={pending}
                onClick={() => action.mutate("remove")}
              >
                {pending && action.variables === "remove" ? (
                  <Spinner className="size-[11px]" />
                ) : (
                  <X size={11} />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Remove from Transmission (keeps files)</TooltipContent>
          </Tooltip>
        </OverviewDlControls>
      </OverviewDlFooter>
      <PreviewDialog
        torrentId={torrent.id}
        name={torrent.name}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
      />
    </OverviewDlItem>
  );
}

export function Overview() {
  const navigate = useNavigate();
  const dashboard = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const res = await api.dashboard.get();
      return res.data && "transmission" in res.data ? (res.data as DashboardData) : null;
    },
    refetchInterval: 8000,
    refetchOnMount: "always",
  });

  const cleanTorrents = useMutation({
    mutationFn: async () => await api.transmission.clean.post(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
  });

  const tx = dashboard.data?.transmission ?? null;
  const staging = dashboard.data?.staging ?? null;
  const loading = dashboard.isLoading;

  return (
    <OverviewGrid>
      <ActiveDownloadsCard tx={tx} loading={loading} />
      <StagingAreaCard staging={staging} loading={loading} navigate={navigate} />
      <OrphanedTorrentsCard tx={tx} loading={loading} cleanTorrents={cleanTorrents} />
    </OverviewGrid>
  );
}
