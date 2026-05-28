import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { CheckCircle2, Download, FolderCog, Loader2, Pause, Play, Trash2, X } from "lucide-react";
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

function StagingPreviewList({ staging }: { staging: StagingStatus }) {
  if (!staging.preview || staging.preview.length === 0) return null;
  return (
    <div className="overview-orphan-list">
      {staging.preview.map((item) => (
        <div key={item.name} className="overview-orphan-item">
          {item.hasCue ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="staging-cue-indicator" role="img" aria-label="Has CUE file">
                  ♪
                </span>
              </TooltipTrigger>
              <TooltipContent>Contains .cue file</TooltipContent>
            </Tooltip>
          ) : null}
          {item.name}
        </div>
      ))}
      {staging.total > 5 ? (
        <div className="overview-orphan-item muted">+{staging.total - 5} more</div>
      ) : null}
    </div>
  );
}

function StagingAreaBody({ staging }: { staging: StagingStatus }) {
  return (
    <>
      <div className="overview-stats">
        <div className="overview-stat">
          <strong>{staging.total}</strong>
          <span>items</span>
        </div>
        {staging.withCue > 0 ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="overview-stat warn">
                <strong>{staging.withCue}</strong>
                <span>need CUE split</span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              Items containing .cue files that may need splitting before moving
            </TooltipContent>
          </Tooltip>
        ) : null}
      </div>
      <StagingPreviewList staging={staging} />
    </>
  );
}

function OrphanedList({ orphaned }: { orphaned: OrphanedTorrent[] }) {
  if (orphaned.length === 0) return null;
  return (
    <div className="overview-orphan-list">
      {orphaned.slice(0, 4).map((o) => (
        <div key={o.id} className="overview-orphan-item">
          {o.name}
        </div>
      ))}
      {orphaned.length > 4 ? (
        <div className="overview-orphan-item muted">+{orphaned.length - 4} more</div>
      ) : null}
    </div>
  );
}

type CleanTorrentsMutation = {
  isPending: boolean;
  isSuccess: boolean;
  data: { data: unknown } | undefined;
  mutate: () => void;
};

function CleanButton({
  cleanTorrents,
  orphanedCount,
}: {
  cleanTorrents: CleanTorrentsMutation;
  orphanedCount: number;
}) {
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
    <Card className="overview-downloads">
      <CardContent className="p-4 flex flex-col gap-3">
        <div className="overview-card-header">
          <span className="overview-card-title">
            <Download size={13} />
            Active Downloads
          </span>
          {tx ? (
            <span className="text-xs text-muted-foreground">
              {tx.seeding > 0 ? `${tx.seeding} seeding · ` : ""}
              {tx.total} total
            </span>
          ) : null}
        </div>
        {loading ? (
          <div className="overview-idle">
            <Loader2 size={14} className="animate-spin" /> Loading…
          </div>
        ) : tx === null ? (
          <div className="overview-idle">Transmission unreachable</div>
        ) : tx.downloading.length === 0 ? (
          <div className="overview-idle">Nothing downloading</div>
        ) : (
          <div className="overview-dl-list">
            {tx.downloading.map((t) => (
              <ActiveDownloadRow key={t.id} torrent={t} />
            ))}
          </div>
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
        <div className="overview-card-header">
          <span className="overview-card-title">
            <FolderCog size={13} />
            Staging Area
          </span>
        </div>
        {loading ? (
          <div className="overview-idle">
            <Loader2 size={14} className="animate-spin" /> Loading…
          </div>
        ) : staging === null ? (
          <div className="overview-idle">Staging dir unavailable</div>
        ) : staging.total === 0 ? (
          <div className="overview-idle">
            <CheckCircle2 size={14} className="text-success-foreground" />
            Staging area clear
          </div>
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
        <div className="overview-card-header">
          <span className="overview-card-title">
            <Trash2 size={13} />
            Orphaned Torrents
          </span>
        </div>
        {loading ? (
          <div className="overview-idle">
            <Loader2 size={14} className="animate-spin" /> Loading…
          </div>
        ) : tx === null ? (
          <div className="overview-idle">Transmission unreachable</div>
        ) : (
          <>
            <div className="overview-stats">
              <div className={`overview-stat${tx.orphaned.length > 0 ? " warn" : ""}`}>
                <strong>{tx.orphaned.length}</strong>
                <span>{tx.orphaned.length === 1 ? "torrent" : "torrents"}</span>
              </div>
            </div>
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
    <div className="overview-dl-item">
      <span className="overview-dl-name">{torrent.name}</span>
      <div className="overview-dl-meta">
        <div className="progress-track" style={{ flex: 1 }}>
          <div
            className="progress-bar"
            style={{ width: `${torrent.progress * 100}%` }}
            data-paused={isPaused}
          />
        </div>
        <span className="overview-dl-pct tabular-nums">{Math.round(torrent.progress * 100)}%</span>
        {torrent.rateDownload > 0 ? (
          <span className="overview-dl-speed tabular-nums">
            {formatBytes(torrent.rateDownload)}/s
          </span>
        ) : (
          <span className="overview-dl-speed text-muted-foreground">
            {isPaused ? "paused" : "—"}
          </span>
        )}
        <div className="overview-dl-controls">
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
        </div>
      </div>
    </div>
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
    <div className="overview-grid">
      <ActiveDownloadsCard tx={tx} loading={loading} />
      <StagingAreaCard staging={staging} loading={loading} navigate={navigate} />
      <OrphanedTorrentsCard tx={tx} loading={loading} cleanTorrents={cleanTorrents} />
    </div>
  );
}
