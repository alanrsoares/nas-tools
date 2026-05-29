import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { CheckCircle2, Download, FolderCog, Loader2, Pause, Play, Trash2, X } from "lucide-react";
import {
  OverviewCardHeader,
  OverviewCardTitle,
  OverviewDlControls,
  OverviewDlItem,
  OverviewDlList,
  OverviewDlMeta,
  OverviewDlName,
  OverviewDlPct,
  OverviewDlSpeed,
  OverviewGrid,
  OverviewIdle,
  OverviewOrphanItem,
  OverviewOrphanList,
  OverviewStat,
  OverviewStatLabel,
  OverviewStats,
  OverviewStatValue,
  ProgressBar,
  ProgressTrack,
  StagingCueIndicator,
} from "@/components/styled";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api, queryClient } from "../../api";
import type { ActiveDownload, OrphanedTorrent, StagingPreviewItem } from "../../types";
import { formatBytes } from "../../utils";

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
        <Loader2 size={13} className="animate-spin" />
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

function ActiveDownloadsCard({ tx, loading }: ActiveDownloadsCardProps) {
  return (
    <Card className="col-span-full">
      <CardContent className="p-4 flex flex-col gap-3">
        <OverviewCardHeader>
          <OverviewCardTitle>
            <Download size={13} />
            Active Downloads
          </OverviewCardTitle>
          {tx ? (
            <span className="text-xs text-muted-foreground">
              {tx.seeding > 0 ? `${tx.seeding} seeding · ` : ""}
              {tx.total} total
            </span>
          ) : null}
        </OverviewCardHeader>
        {loading ? (
          <OverviewIdle>
            <Loader2 size={14} className="animate-spin" /> Loading…
          </OverviewIdle>
        ) : tx === null ? (
          <OverviewIdle>Transmission unreachable</OverviewIdle>
        ) : tx.downloading.length === 0 ? (
          <OverviewIdle>Nothing downloading</OverviewIdle>
        ) : (
          <OverviewDlList>
            {tx.downloading.map((t) => (
              <ActiveDownloadRow key={t.id} torrent={t} />
            ))}
          </OverviewDlList>
        )}
      </CardContent>
    </Card>
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
    <Card>
      <CardContent className="p-4 flex flex-col gap-3">
        <OverviewCardHeader>
          <OverviewCardTitle>
            <FolderCog size={13} />
            Staging Area
          </OverviewCardTitle>
        </OverviewCardHeader>
        {loading ? (
          <OverviewIdle>
            <Loader2 size={14} className="animate-spin" /> Loading…
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
      </CardContent>
    </Card>
  );
}

type OrphanedTorrentsCardProps = {
  tx: TransmissionStatus | null;
  loading: boolean;
  cleanTorrents: CleanTorrentsMutation;
};

function OrphanedTorrentsCard({ tx, loading, cleanTorrents }: OrphanedTorrentsCardProps) {
  return (
    <Card>
      <CardContent className="p-4 flex flex-col gap-3">
        <OverviewCardHeader>
          <OverviewCardTitle>
            <Trash2 size={13} />
            Orphaned Torrents
          </OverviewCardTitle>
        </OverviewCardHeader>
        {loading ? (
          <OverviewIdle>
            <Loader2 size={14} className="animate-spin" /> Loading…
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
      </CardContent>
    </Card>
  );
}

type ActiveDownloadRowProps = { torrent: ActiveDownload };

function ActiveDownloadRow({ torrent }: ActiveDownloadRowProps) {
  const isPaused = torrent.status === 0;

  const action = useMutation({
    mutationFn: async (act: "pause" | "resume" | "remove") =>
      await api.transmission
        .torrents({ id: String(torrent.id) })({ action: act })
        .post(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
  });

  const pending = action.isPending;

  return (
    <OverviewDlItem>
      <OverviewDlName>{torrent.name}</OverviewDlName>
      <OverviewDlMeta>
        <ProgressTrack className="flex-1">
          <ProgressBar $paused={isPaused} style={{ width: `${torrent.progress * 100}%` }} />
        </ProgressTrack>
        <OverviewDlPct>{Math.round(torrent.progress * 100)}%</OverviewDlPct>
        {torrent.rateDownload > 0 ? (
          <OverviewDlSpeed>{formatBytes(torrent.rateDownload)}/s</OverviewDlSpeed>
        ) : (
          <OverviewDlSpeed className="text-muted-foreground">
            {isPaused ? "paused" : "—"}
          </OverviewDlSpeed>
        )}
        <OverviewDlControls>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0"
                disabled={pending}
                onClick={() => action.mutate(isPaused ? "resume" : "pause")}
              >
                {pending && action.variables !== "remove" ? (
                  <Loader2 size={11} className="animate-spin" />
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
                className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                disabled={pending}
                onClick={() => action.mutate("remove")}
              >
                {pending && action.variables === "remove" ? (
                  <Loader2 size={11} className="animate-spin" />
                ) : (
                  <X size={11} />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Remove from Transmission (keeps files)</TooltipContent>
          </Tooltip>
        </OverviewDlControls>
      </OverviewDlMeta>
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
