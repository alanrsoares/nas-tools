import { treaty } from "@elysiajs/eden";
import type { MovePlan, MovePlanItem } from "@nas-tools/core";
import type { App } from "@nas-tools/server";
import { QueryClient, QueryClientProvider, useMutation, useQuery } from "@tanstack/react-query";
import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  RouterProvider,
  useNavigate,
  useSearch,
} from "@tanstack/react-router";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Download,
  FolderCog,
  LayoutDashboard,
  ListChecks,
  Loader2,
  Pause,
  Play,
  Plus,
  Radio,
  Scissors,
  Search,
  Settings as SettingsIcon,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import React from "react";
import { createRoot } from "react-dom/client";
import { match } from "ts-pattern";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import "./styles.css";

const api = treaty<App>(window.location.origin).api;
const queryClient = new QueryClient();

// ── Router Setup ─────────────────────────────────────────────

const rootRoute = createRootRoute({
  component: AppShell,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: () => <Overview />,
});

const stagingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/staging",
  component: () => <Staging />,
});

const dedupeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/dedupe",
  component: () => <Dedupe />,
});

const cueRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/cue",
  component: CueSplit,
});

const jobsSearchSchema = z.object({
  jobId: z.string().optional(),
});

const jobsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/jobs",
  validateSearch: (search) => jobsSearchSchema.parse(search),
  component: () => <Jobs />,
});

const downloadsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/downloads",
  component: () => <Downloads />,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: () => <Settings />,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  stagingRoute,
  dedupeRoute,
  cueRoute,
  jobsRoute,
  downloadsRoute,
  settingsRoute,
]);

const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

type Section = "overview" | "staging" | "dedupe" | "cue" | "jobs" | "downloads" | "settings";

type JobStatus =
  | "queued"
  | "running"
  | "completed"
  | "completed_with_failures"
  | "failed"
  | "canceled"
  | "interrupted";

type JobCounts = {
  total: number;
  completed: number;
  failed: number;
  skipped: number;
};

type Issue = {
  code: string;
  message: string;
};

type NavItem = {
  id: Section;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
};

const navItems: NavItem[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "staging", label: "Staging", icon: FolderCog },
  { id: "dedupe", label: "Dedupe", icon: Copy },
  { id: "cue", label: "CUE Split", icon: Scissors },
  { id: "jobs", label: "Jobs", icon: ListChecks },
  { id: "downloads", label: "Downloads", icon: Download },
  { id: "settings", label: "Settings", icon: SettingsIcon },
];

const sectionLabel: Record<Section, string> = {
  overview: "Overview",
  staging: "Download Staging Area",
  dedupe: "Library Dedupe",
  cue: "CUE Split",
  jobs: "Jobs",
  downloads: "Downloads",
  settings: "Settings",
};

const sectionDescription: Record<Section, string> = {
  overview: "System status at a glance — active downloads, staging area, and cleanup tasks.",
  staging: "Scan your downloads folder, review detected media, and confirm moves to the library.",
  dedupe:
    "Index your FLAC library to identify duplicated releases and keep the best quality versions.",
  cue: "Audit unsplit CUE/audio pairs and run split jobs with live progress.",
  jobs: "Track active and past move operations. Select a job to see its progress and event log.",
  downloads: "Search Prowlarr indexers for lossless audio and add directly to Transmission.",
  settings: "NAS library paths used when organizing media. Edit via server environment variables.",
};

function AppShell() {
  const { pathname } = window.location; // Simple way to get active state for now or use useMatch

  const currentSection = (pathname === "/" ? "overview" : pathname.slice(1)) as Section;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <BrandIcon />
          NAS Tools
        </div>
        <nav className="nav" aria-label="Cockpit sections">
          {navItems.map((item) => {
            const Icon = item.icon;
            const to = item.id === "overview" ? "/" : `/${item.id}`;
            return (
              <Link key={item.id} to={to} activeProps={{ className: "active" }}>
                <Icon size={17} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
      <main className="content">
        <header className="topbar">
          <div>
            <h1>{sectionLabel[currentSection]}</h1>
            <p className="section-desc">{sectionDescription[currentSection]}</p>
          </div>
          <ServerStatus />
        </header>
        <Outlet />
      </main>
    </div>
  );
}

function ServerStatus() {
  const query = useQuery({
    queryKey: ["health"],
    queryFn: async () => await api.health.get(),
    refetchInterval: 5000,
  });

  const connected = query.data?.data?.ok;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={connected ? "status ok" : "status"}>
          <Activity size={14} />
          Server
        </span>
      </TooltipTrigger>
      <TooltipContent>{connected ? "Connected" : "Offline or unreachable"}</TooltipContent>
    </Tooltip>
  );
}

// ── Brand icon ─────────────────────────────────────────────────

function BrandIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 32 32"
      aria-hidden="true"
      style={{ color: "var(--primary)", flexShrink: 0 }}
    >
      <rect x="5" y="7" width="22" height="5.5" rx="1.5" fill="currentColor" />
      <rect x="5" y="13.5" width="22" height="5.5" rx="1.5" fill="currentColor" opacity="0.65" />
      <rect x="5" y="20" width="22" height="5.5" rx="1.5" fill="currentColor" opacity="0.35" />
      <circle cx="23.5" cy="9.75" r="1.3" fill="oklch(0.125 0.015 175)" />
      <circle cx="23.5" cy="16.25" r="1.3" fill="oklch(0.125 0.015 175)" />
      <circle cx="23.5" cy="22.75" r="1.3" fill="oklch(0.125 0.015 175)" />
    </svg>
  );
}

// ── Overview ───────────────────────────────────────────────────

type ActiveDownload = {
  id: number;
  name: string;
  progress: number;
  totalSize: number;
  rateDownload: number;
  status: number;
};

type OrphanedTorrent = {
  id: number;
  name: string;
};

type TransmissionStatus = {
  downloading: ActiveDownload[];
  seeding: number;
  orphaned: OrphanedTorrent[];
  total: number;
};

type StagingPreviewItem = { name: string; hasCue: boolean };

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

type CleanTorrentsMutation = {
  isPending: boolean;
  isSuccess: boolean;
  data: { data: unknown } | undefined;
  mutate: () => void;
};

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

function Overview() {
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

// ── ActiveDownloadRow ──────────────────────────────────────────

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

// ── Staging ────────────────────────────────────────────────────

function isCleanSuccess(data: unknown): data is { removed: number } {
  return (
    typeof data === "object" &&
    data !== null &&
    "removed" in data &&
    typeof (data as { removed: unknown }).removed === "number"
  );
}

type StagingCleanTorrentsMutation = {
  isPending: boolean;
  data: { data: unknown } | undefined;
  mutate: () => void;
};

function CueSplitToggle({ plan, setPlan }: { plan: MovePlan; setPlan: (p: MovePlan) => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="cue-split-toggle">
          <Checkbox
            id="staging-cue-split"
            checked={plan.cueSplitEnabled}
            onCheckedChange={(checked: boolean | "indeterminate") =>
              setPlan({ ...plan, cueSplitEnabled: checked === true })
            }
          />
          <label htmlFor="staging-cue-split" className="cue-split-toggle-label">
            <Scissors size={14} />
            <span>Split CUE</span>
          </label>
        </div>
      </TooltipTrigger>
      <TooltipContent>
        Split matching CUE/audio pairs after move and before Transmission cleanup
      </TooltipContent>
    </Tooltip>
  );
}

function StagingCleanButton({
  cleanTorrents,
  orphanedCount,
}: {
  cleanTorrents: StagingCleanTorrentsMutation;
  orphanedCount: number;
}) {
  const cleanData = cleanTorrents.data?.data;
  const cleanSucceeded = isCleanSuccess(cleanData);
  const label = cleanTorrents.isPending
    ? "Removing…"
    : cleanSucceeded
      ? `Removed ${(cleanData as { removed: number }).removed} torrent${(cleanData as { removed: number }).removed !== 1 ? "s" : ""}`
      : `Remove moved (${orphanedCount})`;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          onClick={() => cleanTorrents.mutate()}
          disabled={cleanTorrents.isPending}
          size="sm"
          variant="ghost"
        >
          {cleanTorrents.isPending ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <Trash2 size={15} />
          )}
          <span>{label}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        Remove {orphanedCount} completed Transmission torrent
        {orphanedCount !== 1 ? "s" : ""} whose files have already been moved to the library
      </TooltipContent>
    </Tooltip>
  );
}

function StagingConfirmButton({
  plan,
  canConfirm,
  confirmIsPending,
  needsCorrection,
  onConfirm,
}: {
  plan: MovePlan;
  canConfirm: boolean | undefined;
  confirmIsPending: boolean;
  needsCorrection: number;
  onConfirm: () => void;
}) {
  if (!plan.items.length) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span>
          <Button onClick={onConfirm} disabled={!canConfirm || confirmIsPending} size="sm">
            {confirmIsPending ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <CheckCircle2 size={15} />
            )}
            <span>{confirmIsPending ? "Confirming…" : "Confirm"}</span>
          </Button>
        </span>
      </TooltipTrigger>
      {!canConfirm ? (
        <TooltipContent>
          {needsCorrection > 0
            ? `Fix ${needsCorrection} item(s) before confirming`
            : "No items included"}
        </TooltipContent>
      ) : null}
    </Tooltip>
  );
}

type StagingToolbarProps = {
  plan: MovePlan | undefined;
  stats: ReturnType<typeof summarizePlan> | undefined;
  cuePairTotal: number;
  orphanedCount: number;
  cleanTorrents: StagingCleanTorrentsMutation;
  confirm: {
    isPending: boolean;
    mutate: (plan: MovePlan) => void;
  };
  scan: {
    isPending: boolean;
    mutate: () => void;
  };
  setPlan: (plan: MovePlan | undefined) => void;
};

function StagingSummarySection({
  stats,
  cuePairTotal,
}: {
  stats: ReturnType<typeof summarizePlan> | undefined;
  cuePairTotal: number;
}) {
  if (!stats) return <div />;
  return (
    <section className="summary" aria-label="Move Plan summary">
      <SummaryCell label="Found" value={stats.total} />
      <SummaryCell label="To move" value={stats.included} />
      {stats.excluded > 0 ? <SummaryCell label="Skipped" value={stats.excluded} /> : null}
      <SummaryCell
        label="Needs fix"
        value={stats.needsCorrection}
        tone={stats.needsCorrection > 0 ? "warn" : ""}
      />
      {cuePairTotal > 0 ? <SummaryCell label="CUE pairs" value={cuePairTotal} tone="warn" /> : null}
    </section>
  );
}

function StagingActions({
  plan,
  cuePairTotal,
  orphanedCount,
  cleanTorrents,
  confirm,
  scan,
  setPlan,
  canConfirm,
  needsCorrection,
}: {
  plan: MovePlan | undefined;
  cuePairTotal: number;
  orphanedCount: number;
  cleanTorrents: StagingCleanTorrentsMutation;
  confirm: { isPending: boolean; mutate: (plan: MovePlan) => void };
  scan: { isPending: boolean; mutate: () => void };
  setPlan: (p: MovePlan | undefined) => void;
  canConfirm: boolean;
  needsCorrection: number;
}) {
  const showClean =
    orphanedCount > 0 || cleanTorrents.isPending || isCleanSuccess(cleanTorrents.data?.data);
  return (
    <div className="flex gap-2 items-center toolbar-actions">
      {plan && cuePairTotal > 0 ? <CueSplitToggle plan={plan} setPlan={setPlan} /> : null}
      {showClean ? (
        <StagingCleanButton cleanTorrents={cleanTorrents} orphanedCount={orphanedCount} />
      ) : null}
      <PlexScanPopover />
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            onClick={() => scan.mutate()}
            disabled={scan.isPending || confirm.isPending}
            size="sm"
            variant="outline"
          >
            <Search size={15} />
            <span>{scan.isPending ? "Scanning…" : "Scan"}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>Scan the staging directory for new media</TooltipContent>
      </Tooltip>
      {plan ? (
        <StagingConfirmButton
          plan={plan}
          canConfirm={canConfirm}
          confirmIsPending={confirm.isPending}
          needsCorrection={needsCorrection}
          onConfirm={() => confirm.mutate(plan)}
        />
      ) : null}
    </div>
  );
}

function StagingToolbar({
  plan,
  stats,
  cuePairTotal,
  orphanedCount,
  cleanTorrents,
  confirm,
  scan,
  setPlan,
}: StagingToolbarProps) {
  const canConfirm = !!(plan && stats && stats.included > 0 && stats.needsCorrection === 0);

  return (
    <div className="toolbar">
      <StagingSummarySection stats={stats} cuePairTotal={cuePairTotal} />
      <StagingActions
        plan={plan}
        cuePairTotal={cuePairTotal}
        orphanedCount={orphanedCount}
        cleanTorrents={cleanTorrents}
        confirm={confirm}
        scan={scan}
        setPlan={setPlan}
        canConfirm={canConfirm}
        needsCorrection={stats?.needsCorrection ?? 0}
      />
    </div>
  );
}

function Staging() {
  const navigate = useNavigate();
  const [plan, setPlan] = React.useState<MovePlan>();

  const scan = useMutation({
    mutationFn: async () => await api["move-completed"].scan.post(),
    onSuccess: (response) => {
      if (response.data && "plan" in response.data) setPlan(response.data.plan);
    },
  });

  React.useEffect(() => {
    scan.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scan.mutate]);

  const dashboardQuery = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const res = await api.dashboard.get();
      return res.data && "transmission" in res.data ? (res.data as DashboardData) : null;
    },
    refetchOnMount: "always",
    refetchInterval: 10_000,
  });

  const orphanedCount = dashboardQuery.data?.transmission?.orphaned.length ?? 0;

  const cleanTorrents = useMutation({
    mutationFn: async () => await api.transmission.clean.post(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
  });

  const confirm = useMutation({
    mutationFn: async (currentPlan: MovePlan) => {
      const response = await api["move-completed"].plans({ id: currentPlan.id }).confirm.post({
        items: currentPlan.items.map((item) => ({
          id: item.id,
          ...(item.artistName !== undefined ? { artistName: item.artistName } : {}),
          included: item.included,
        })),
        cueSplitEnabled: currentPlan.cueSplitEnabled,
      });
      return response;
    },
    onSuccess: (response) => {
      if (response.data && "jobId" in response.data) {
        setPlan(undefined);
        navigate({ to: "/jobs", search: { jobId: response.data.jobId as string } });
      }
    },
  });

  const stats = plan ? summarizePlan(plan.items) : undefined;
  const cuePairTotal = stats?.cuePairTotal ?? 0;
  const issues = scan.data?.data && "issues" in scan.data.data ? scan.data.data.issues : [];

  const confirmIssues =
    confirm.data?.data && "issues" in confirm.data.data ? confirm.data.data.issues : [];

  return (
    <Card>
      <CardContent className="p-4">
        <StagingToolbar
          plan={plan}
          stats={stats}
          cuePairTotal={cuePairTotal}
          orphanedCount={orphanedCount}
          cleanTorrents={cleanTorrents}
          confirm={confirm}
          scan={scan}
          setPlan={setPlan}
        />

        {issues.length > 0 ? <IssueList issues={issues} /> : null}
        {confirmIssues.length > 0 ? <IssueList issues={confirmIssues} /> : null}
        <StagingBody plan={plan} scanIsPending={scan.isPending} setPlan={setPlan} />
      </CardContent>
    </Card>
  );
}

type MovePlanTableProps = {
  plan: MovePlan;
  setPlan: (plan: MovePlan | undefined) => void;
};

function MovePlanTable({ plan, setPlan }: MovePlanTableProps) {
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-14 text-center">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="cursor-default">Use</span>
                </TooltipTrigger>
                <TooltipContent>Include this item in the move</TooltipContent>
              </Tooltip>
            </TableHead>
            <TableHead>Item</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Artist</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Target</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {plan.items.map((item) => (
            <MovePlanRow
              key={item.id}
              item={item}
              onChange={(next) => setPlan(updatePlanItem(plan, next))}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

type StagingBodyProps = {
  plan: MovePlan | undefined;
  scanIsPending: boolean;
  setPlan: (plan: MovePlan | undefined) => void;
};

function StagingBody({ plan, scanIsPending, setPlan }: StagingBodyProps) {
  if (plan && plan.items.length === 0) {
    return (
      <div className="empty-state">
        <CheckCircle2 size={28} className="text-success-foreground" />
        <span>Staging area is clear — nothing to move.</span>
      </div>
    );
  }
  if (plan) {
    return <MovePlanTable plan={plan} setPlan={setPlan} />;
  }
  return (
    <div className="empty-state">
      {scanIsPending ? <Loader2 size={28} className="animate-spin" /> : <FolderCog size={28} />}
      <span>
        {scanIsPending ? "Scanning staging area…" : "Scan the staging area to build a Move Plan."}
      </span>
    </div>
  );
}

type MovePlanRowProps = {
  item: MovePlanItem;
  onChange: (item: MovePlanItem) => void;
};

function MovePlanRow({ item, onChange }: MovePlanRowProps) {
  const showWarning = item.issues.length > 0 && item.included;

  return (
    <TableRow>
      <TableCell className="text-center">
        <Checkbox
          aria-label={`Include ${item.albumName}`}
          checked={item.included}
          onCheckedChange={(checked: boolean | "indeterminate") =>
            onChange({ ...item, included: !!checked })
          }
        />
      </TableCell>
      <TableCell className="font-semibold path-cell">
        <div className="item-title-cell">
          <span>{item.albumName}</span>
          {(item.cueAudioPairs ?? 0) > 0 ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="warning" className="gap-1 cursor-default">
                  <Scissors size={12} />
                  CUE {item.cueAudioPairs}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>Will split after move when Split CUE is enabled</TooltipContent>
            </Tooltip>
          ) : null}
        </div>
      </TableCell>
      <TableCell>
        <Badge variant="secondary">{mediaLabel(item.mediaType)}</Badge>
      </TableCell>
      <TableCell>
        {item.mediaType === "music" ? (
          <Input
            aria-label={`Artist for ${item.albumName}`}
            className={showWarning ? "border-warning/60 bg-warning/20 max-w-60" : "max-w-60"}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
              onChange({ ...item, artistName: event.currentTarget.value })
            }
            placeholder="Artist name…"
            value={item.artistName ?? ""}
          />
        ) : (
          <span className="muted">—</span>
        )}
      </TableCell>
      <TableCell>
        <StatusBadge item={item} />
      </TableCell>
      <TableCell>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="path-truncate">{item.targetPath}</span>
          </TooltipTrigger>
          <TooltipContent className="max-w-sm break-all">{item.targetPath}</TooltipContent>
        </Tooltip>
      </TableCell>
    </TableRow>
  );
}

type StatusBadgeProps = { item: MovePlanItem };

function StatusBadge({ item }: StatusBadgeProps) {
  if (item.issues.length > 0) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="warning" className="gap-1 cursor-default">
            <AlertTriangle size={13} />
            Needs fix
          </Badge>
        </TooltipTrigger>
        <TooltipContent>{item.issues[0]?.message ?? "Unknown issue"}</TooltipContent>
      </Tooltip>
    );
  }
  if (!item.included) return <Badge variant="secondary">Excluded</Badge>;
  return (
    <Badge variant="success" className="gap-1">
      <CheckCircle2 size={13} />
      Included
    </Badge>
  );
}

// ── Dedupe ────────────────────────────────────────────────────

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

function parseSseChunk(chunk: string, onEvent: (data: unknown) => void): void {
  if (!chunk.startsWith("data: ")) return;
  const raw = chunk.slice(6);
  try {
    onEvent(JSON.parse(raw));
  } catch (e) {
    console.error("Failed to parse stream data:", raw, e);
  }
}

async function readSseStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onEvent: (data: unknown) => void,
): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value);
    const lines = buffer.split("\n\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      parseSseChunk(line, onEvent);
    }
  }
}

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

function DedupeProgress({ status }: { status: DedupeStatus }) {
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

function DedupeGroupCard({ group }: { group: DedupeGroup }) {
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
    <div className="empty-state">
      <Copy size={28} />
      <span>
        {status?.type === "error"
          ? status.message
          : "Scan your music library to find duplicate releases."}
      </span>
    </div>
  );
}

function Dedupe() {
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
        <div className="toolbar">
          <section className="summary" aria-label="Dedupe summary">
            <SummaryCell label="Duplicates Found" value={duplicates.length} />
            <SummaryCell label="Folders to Move" value={moves.length} />
          </section>
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
        </div>
        <DedupeBody isScanning={isScanning} status={status} duplicates={duplicates} />
      </CardContent>
    </Card>
  );
}

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
      const response = await fetch("/api/cue/scan");
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

function CueScanProgress({ scanStatus }: { scanStatus: CueScanStatus }) {
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
                  <span className="path-truncate font-mono">{pair.cueFile}</span>
                  <span className="text-xs text-muted-foreground path-truncate">
                    {pair.directory}
                  </span>
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
    <div className="empty-state">
      <Scissors size={28} />
      <span>Scan the FLAC library for unsplit CUE/audio pairs.</span>
    </div>
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

function CueSplitActions({
  readyPairs,
  selectedPairs,
  isScanning,
  fixIsPending,
  onScan,
  onFix,
}: {
  readyPairs: CuePair[];
  selectedPairs: CuePair[];
  isScanning: boolean;
  fixIsPending: boolean;
  onScan: () => void;
  onFix: () => void;
}) {
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
    <div className="toolbar">
      <section className="summary" aria-label="CUE summary">
        <SummaryCell label="Pairs" value={result?.pairs.length ?? 0} />
        <SummaryCell label="Ready" value={result?.ready ?? 0} />
        <SummaryCell
          label="Blocked"
          value={result?.blocked ?? 0}
          tone={(result?.blocked ?? 0) > 0 ? "warn" : ""}
        />
      </section>
      <CueSplitActions
        readyPairs={readyPairs}
        selectedPairs={selectedPairs}
        isScanning={isScanning}
        fixIsPending={fixIsPending}
        onScan={onScan}
        onFix={onFix}
      />
    </div>
  );
}

function CueSplit() {
  const navigate = useNavigate();
  const { scanStatus, result, selectedIds, setSelectedIds, isScanning, error, startScan } =
    useCueScan();

  const readyPairs = (result?.pairs ?? []).filter((pair) => !pair.blocked);
  const selectedPairs = readyPairs.filter((pair) => selectedIds.has(pair.id));

  const fixMutation = useMutation({
    mutationFn: async (pairs: CuePair[]) => {
      const response = await fetch("/api/cue/fix/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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

// ── PlexScanPopover ────────────────────────────────────────────

type PlexSection = { key: string; title: string; type: string };

type PlexSectionRowProps = {
  section: PlexSection;
  scanning: boolean;
  done: boolean;
  anyPending: boolean;
  onScan: (key: string) => void;
};

function PlexSectionRow({ section, scanning, done, anyPending, onScan }: PlexSectionRowProps) {
  return (
    <button
      key={section.key}
      type="button"
      className={`plex-scan-item${scanning ? " scanning" : ""}`}
      disabled={anyPending}
      onClick={() => onScan(section.key)}
    >
      <span className="plex-scan-title">{section.title}</span>
      <span className="plex-scan-action">
        {scanning ? (
          <Loader2 size={12} className="animate-spin" />
        ) : done ? (
          <CheckCircle2 size={12} />
        ) : (
          <Radio size={12} />
        )}
        {scanning ? "Scanning…" : done ? "Scanned" : "Scan"}
      </span>
    </button>
  );
}

function PlexScanPopover() {
  const [open, setOpen] = React.useState(false);
  const [scanned, setScanned] = React.useState<Set<string>>(new Set());

  const sectionsQuery = useQuery({
    queryKey: ["plex-sections"],
    queryFn: async () => {
      const res = await api.plex.sections.get();
      return res.data && "sections" in res.data ? (res.data.sections as PlexSection[]) : [];
    },
    enabled: open,
    staleTime: 60_000,
  });

  const scanAll = useMutation({
    mutationFn: async () => await api.plex.scan.post(),
    onSuccess: () => {
      const keys = (sectionsQuery.data ?? []).map((s) => s.key);
      setScanned(new Set(keys));
    },
  });

  const scanOne = useMutation({
    mutationFn: async (key: string) => await api.plex.sections({ key }).scan.post(),
    onSuccess: (_, key) => setScanned((prev) => new Set([...prev, key])),
  });

  const sections = sectionsQuery.data ?? [];
  const anyPending = scanAll.isPending || scanOne.isPending;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button size="sm" variant="ghost" disabled={anyPending && !open}>
              {anyPending ? <Loader2 size={15} className="animate-spin" /> : <Radio size={15} />}
              <span>{anyPending ? "Scanning…" : "Plex scan"}</span>
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Trigger a Plex library refresh</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-64 p-0">
        <div className="plex-scan-popover">
          <div className="plex-scan-header">
            <span>Plex Libraries</span>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs px-2"
              disabled={anyPending || sections.length === 0}
              onClick={() => scanAll.mutate()}
            >
              {scanAll.isPending ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Radio size={12} />
              )}
              {scanAll.isPending ? "Scanning…" : "Scan all"}
            </Button>
          </div>
          <div className="plex-scan-list">
            {sectionsQuery.isLoading ? (
              <div className="plex-scan-loading">
                <Loader2 size={14} className="animate-spin" />
                <span>Loading libraries…</span>
              </div>
            ) : sections.length === 0 ? (
              <div className="plex-scan-loading">
                <span>No libraries found</span>
              </div>
            ) : (
              sections.map((section) => {
                const done = scanned.has(section.key);
                const scanning =
                  (scanOne.isPending && scanOne.variables === section.key) ||
                  (scanAll.isPending && !done);
                return (
                  <PlexSectionRow
                    key={section.key}
                    section={section}
                    scanning={scanning}
                    done={done}
                    anyPending={anyPending}
                    onScan={(key) => scanOne.mutate(key)}
                  />
                );
              })
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ── Jobs ───────────────────────────────────────────────────────

type JobRecord = {
  id: string;
  type: string;
  status: JobStatus;
  planId: string | null;
  counts: JobCounts;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type JobEventRecord = {
  id: string;
  jobId: string;
  seq: number;
  type: string;
  level: string;
  message: string;
  data: string | null;
  createdAt: string;
};

const TERMINAL_STATUSES = new Set<JobStatus>([
  "completed",
  "completed_with_failures",
  "failed",
  "canceled",
  "interrupted",
]);

function Jobs() {
  const { jobId } = useSearch({ from: jobsRoute.id });
  const navigate = useNavigate();

  const jobsQuery = useQuery({
    queryKey: ["jobs"],
    queryFn: async () => {
      const res = await api.jobs.get();
      return res.data && "jobs" in res.data ? (res.data.jobs as JobRecord[]) : [];
    },
    refetchInterval: 3000,
    refetchOnMount: "always",
  });

  const jobList = jobsQuery.data ?? [];

  if (jobList.length === 0 && !jobsQuery.isLoading) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="empty-state">
            <ListChecks size={28} />
            <span>No jobs yet. Confirm a Move Plan to start one.</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const selected = jobId ? (jobList.find((j) => j.id === jobId) ?? jobList[0]) : jobList[0];

  return (
    <div className="flex gap-4" style={{ minWidth: 0 }}>
      {/* Job list */}
      <Card style={{ width: 220, flexShrink: 0 }}>
        <CardContent className="p-2">
          <div className="grid gap-1">
            {jobList.map((job) => {
              const itemLabel =
                job.counts.total > 0
                  ? `${job.counts.total} item${job.counts.total !== 1 ? "s" : ""}`
                  : job.type === "cue_fix"
                    ? "CUE fix"
                    : "Move Plan";
              return (
                <button
                  key={job.id}
                  type="button"
                  onClick={() => navigate({ to: "/jobs", search: { jobId: job.id } })}
                  className={`job-list-item${selected?.id === job.id ? " active" : ""}`}
                >
                  <JobStatusDot status={job.status} />
                  <div className="job-list-meta">
                    <span className="job-list-type">{itemLabel}</span>
                    <span className="job-list-time">{formatRelativeTime(job.createdAt)}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Job detail */}
      {selected ? <JobDetail job={selected} /> : null}
    </div>
  );
}

type JobDetailProps = { job: JobRecord };

function JobDetail({ job: initialJob }: JobDetailProps) {
  const [liveJob, setLiveJob] = React.useState<JobRecord>(initialJob);
  const [events, setEvents] = React.useState<JobEventRecord[]>([]);
  const logRef = React.useRef<HTMLDivElement>(null);
  const isTerminal = TERMINAL_STATUSES.has(liveJob.status);

  // Sync state when switching to a different job
  React.useEffect(() => {
    setLiveJob(initialJob);
    setEvents([]);
    // biome-ignore lint/correctness/useExhaustiveDependencies: reset on job switch only, not on every poll refetch
  }, [initialJob.id]);

  // Always fetch fresh status on mount; poll while non-terminal
  useQuery({
    queryKey: ["job", initialJob.id],
    queryFn: async () => {
      const res = await api.jobs({ id: initialJob.id }).get();
      if (res.data && "job" in res.data) setLiveJob(res.data.job as JobRecord);
      return null;
    },
    refetchOnMount: "always",
    refetchInterval: isTerminal ? false : 1000,
  });

  // Pre-load historical events via REST on every mount
  useQuery({
    queryKey: ["job-events", initialJob.id],
    queryFn: async () => {
      const res = await api.jobs({ id: initialJob.id }).events.get({
        query: { after: "-1" },
      });
      const loaded = res.data && "events" in res.data ? (res.data.events as JobEventRecord[]) : [];
      setEvents(loaded);
      return loaded;
    },
    refetchOnMount: "always",
    staleTime: Infinity,
  });

  // SSE for live events — server closes naturally when job is terminal
  React.useEffect(() => {
    const source = new EventSource(`/api/jobs/${initialJob.id}/events/stream`);
    source.onmessage = (e: MessageEvent<string>) => {
      // biome-ignore lint: trusted same-origin SSE; validate if JobEventRecord gets a Zod schema
      const event = JSON.parse(e.data) as JobEventRecord;
      setEvents((prev) => (prev.some((p) => p.seq === event.seq) ? prev : [...prev, event]));
    };
    source.onerror = () => source.close();
    return () => source.close();
  }, [initialJob.id]);

  // Auto-scroll log
  React.useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, []);

  const counts = liveJob.counts;
  const progress =
    counts.total > 0 ? Math.round(((counts.completed + counts.failed) / counts.total) * 100) : 0;

  const cancelMutation = useMutation({
    mutationFn: async () => await api.jobs({ id: initialJob.id }).cancel.post(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["jobs"] }),
  });

  return (
    <Card className="min-w-0 flex-1">
      <CardContent className="p-4 flex flex-col gap-3">
        {/* Header row */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <JobStatusBadge status={liveJob.status} />
            <span className="text-xs text-muted-foreground">
              {formatRelativeTime(liveJob.createdAt)}
            </span>
          </div>
          {!isTerminal ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => cancelMutation.mutate()}
                  disabled={cancelMutation.isPending}
                >
                  <XCircle size={14} />
                  Cancel
                </Button>
              </TooltipTrigger>
              <TooltipContent>Signals the job to stop; current item finishes first</TooltipContent>
            </Tooltip>
          ) : null}
        </div>

        {/* Progress bar */}
        {counts.total > 0 ? (
          <div>
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>
                {counts.completed} / {counts.total} {liveJob.type === "cue_fix" ? "fixed" : "moved"}
                {counts.failed > 0 ? `, ${counts.failed} failed` : ""}
              </span>
              <span>{progress}%</span>
            </div>
            <div className="progress-track">
              <div
                className="progress-bar"
                style={{ width: `${progress}%` }}
                data-failed={counts.failed > 0}
              />
            </div>
          </div>
        ) : null}

        {/* Event log */}
        <div className="event-log" ref={logRef}>
          {events.length === 0 ? (
            <div className="event-log-empty">
              <pre className="event-log-art">{`  ┌ ─ ─ ─ ─ ─ ┐
    · · · · ·
  └ ─ ─ ─ ─ ─ ┘`}</pre>
              <span>waiting for events</span>
            </div>
          ) : (
            events.map((event) => (
              <div key={event.seq} className={`event-line level-${event.level}`}>
                <span className="event-seq">{event.seq}</span>
                <span className="event-msg">{event.message}</span>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

type JobStatusDotProps = { status: JobStatus };

function JobStatusDot({ status }: JobStatusDotProps) {
  return <span className="status-dot" data-status={status} />;
}

type JobStatusBadgeProps = { status: JobStatus };

function JobStatusBadge({ status }: JobStatusBadgeProps) {
  return match(status)
    .with("running", () => (
      <Badge variant="default" className="gap-1">
        <Loader2 size={11} className="animate-spin" />
        Running
      </Badge>
    ))
    .with("completed", () => (
      <Badge variant="success" className="gap-1">
        <CheckCircle2 size={11} />
        Completed
      </Badge>
    ))
    .with("completed_with_failures", () => (
      <Badge variant="warning" className="gap-1">
        <AlertTriangle size={11} />
        Partial
      </Badge>
    ))
    .with("canceled", () => <Badge variant="secondary">Canceled</Badge>)
    .with("interrupted", () => <Badge variant="secondary">Interrupted</Badge>)
    .with("queued", () => <Badge variant="secondary">Queued</Badge>)
    .with("failed", () => (
      <Badge variant="destructive" className="gap-1">
        <XCircle size={11} />
        Failed
      </Badge>
    ))
    .exhaustive();
}

// ── Downloads ──────────────────────────────────────────────────

type SearchResult = {
  title: string;
  size: number;
  indexer: string;
  seeders: number;
  leechers: number;
  downloadUrl: string | null;
  infoUrl: string | null;
  guid: string;
};

type SearchResultRowProps = {
  result: SearchResult;
  isAdded: boolean;
  isPending: boolean;
  onAdd: (url: string) => void;
};

function SearchResultRow({ result, isAdded, isPending, onAdd }: SearchResultRowProps) {
  const url = result.downloadUrl;
  return (
    <TableRow>
      <TableCell>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="path-truncate" style={{ maxWidth: 380 }}>
              {result.title}
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-sm break-words">{result.title}</TooltipContent>
        </Tooltip>
      </TableCell>
      <TableCell className="text-muted-foreground text-xs">{result.indexer}</TableCell>
      <TableCell className="text-right tabular-nums text-sm">{result.seeders}</TableCell>
      <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
        {formatBytes(result.size)}
      </TableCell>
      <TableCell className="text-right">
        {url ? (
          <Button
            size="sm"
            variant={isAdded ? "secondary" : "default"}
            disabled={isAdded || isPending}
            onClick={() => onAdd(url)}
          >
            {isAdded ? <CheckCircle2 size={13} /> : <Plus size={13} />}
            {isAdded ? "Added" : "Add"}
          </Button>
        ) : (
          <span className="muted text-xs">no link</span>
        )}
      </TableCell>
    </TableRow>
  );
}

type SearchResultsTableProps = {
  results: SearchResult[];
  added: Set<string>;
  isPending: boolean;
  onAdd: (url: string) => void;
};

function SearchResultsTable({ results, added, isPending, onAdd }: SearchResultsTableProps) {
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead className="w-36">Indexer</TableHead>
            <TableHead className="w-16 text-right">Seeds</TableHead>
            <TableHead className="w-24 text-right">Size</TableHead>
            <TableHead className="w-20" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {results.map((result) => (
            <SearchResultRow
              key={result.guid}
              result={result}
              isAdded={result.downloadUrl ? added.has(result.downloadUrl) : false}
              isPending={isPending}
              onAdd={onAdd}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

type DownloadsSearchFormProps = {
  query: string;
  isPending: boolean;
  onQueryChange: (q: string) => void;
  onSubmit: (e: React.FormEvent) => void;
};

function DownloadsSearchForm({
  query,
  isPending,
  onQueryChange,
  onSubmit,
}: DownloadsSearchFormProps) {
  return (
    <form onSubmit={onSubmit} className="flex gap-2">
      <Input
        value={query}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onQueryChange(e.currentTarget.value)}
        placeholder="Artist, album, or release…"
        className="flex-1"
      />
      <Button type="submit" disabled={!query.trim() || isPending} size="sm">
        {isPending ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
        <span>{isPending ? "Searching…" : "Search"}</span>
      </Button>
    </form>
  );
}

type DownloadsBodyProps = {
  searchIsSuccess: boolean;
  results: SearchResult[];
  added: Set<string>;
  isPending: boolean;
  onAdd: (url: string) => void;
};

function DownloadsBody({ searchIsSuccess, results, added, isPending, onAdd }: DownloadsBodyProps) {
  if (searchIsSuccess && results.length === 0) {
    return (
      <div className="empty-state">
        <Search size={28} />
        <span>No results found.</span>
      </div>
    );
  }
  if (results.length > 0) {
    return (
      <SearchResultsTable results={results} added={added} isPending={isPending} onAdd={onAdd} />
    );
  }
  if (!searchIsSuccess) {
    return (
      <div className="empty-state">
        <Download size={28} />
        <span>Search Prowlarr indexers for lossless audio.</span>
      </div>
    );
  }
  return null;
}

function Downloads() {
  const [query, setQuery] = React.useState("");
  const [added, setAdded] = React.useState<Set<string>>(new Set());

  const search = useMutation({
    mutationFn: async (q: string) => {
      const res = await api.search.get({ query: { q } });
      return res.data && "results" in res.data ? (res.data.results as SearchResult[]) : [];
    },
  });

  const addTorrent = useMutation({
    mutationFn: async (url: string) => await api.transmission.add.post({ url }),
    onSuccess: (_, url) => setAdded((prev) => new Set([...prev, url])),
  });

  const results = search.data ?? [];
  const searchError = search.data === undefined && search.error ? String(search.error) : null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) search.mutate(query.trim());
  };

  return (
    <Card>
      <CardContent className="p-4 flex flex-col gap-4">
        <DownloadsSearchForm
          query={query}
          isPending={search.isPending}
          onQueryChange={setQuery}
          onSubmit={handleSubmit}
        />
        {searchError ? (
          <IssueList issues={[{ code: "SEARCH_ERROR", message: searchError }]} />
        ) : null}
        <DownloadsBody
          searchIsSuccess={search.isSuccess}
          results={results}
          added={added}
          isPending={addTorrent.isPending}
          onAdd={(url) => addTorrent.mutate(url)}
        />
      </CardContent>
    </Card>
  );
}

function formatBytes(bytes: number): string {
  if (!bytes) return "—";
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  return `${Math.round(bytes / 1024 ** 2)} MB`;
}

// ── Settings ───────────────────────────────────────────────────

function Settings() {
  const config = useQuery({
    queryKey: ["config"],
    queryFn: async () => await api.config.get(),
  });

  const value =
    config.data?.data && "config" in config.data.data ? config.data.data.config : undefined;

  return (
    <Card>
      <CardContent className="p-4">
        {value ? (
          <div className="settings-grid">
            {Object.entries(value).map(([key, path]) => (
              <label key={key} htmlFor={`setting-${key}`} className="setting-field">
                <span>{settingLabel(key)}</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Input id={`setting-${key}`} value={path} readOnly className="cursor-default" />
                  </TooltipTrigger>
                  <TooltipContent>Read-only — set via server environment variable</TooltipContent>
                </Tooltip>
              </label>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <SettingsIcon size={28} />
            <span>Loading settings.</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Shared ─────────────────────────────────────────────────────

type IssueListProps = { issues: Issue[] };

function IssueList({ issues }: IssueListProps) {
  return (
    <div className="issue-list">
      {issues.map((issue) => (
        <div key={`${issue.code}:${issue.message}`} className="issue">
          <AlertTriangle size={16} />
          <span>{issue.message}</span>
        </div>
      ))}
    </div>
  );
}

type SummaryCellProps = {
  label: string;
  value: number;
  tone?: "" | "warn";
};

function SummaryCell({ label, value, tone = "" }: SummaryCellProps) {
  return (
    <div className={tone ? `summary-cell ${tone}` : "summary-cell"}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function summarizePlan(items: MovePlanItem[]) {
  const included = items.filter((i) => i.included && i.issues.length === 0).length;
  const needsCorrection = items.filter((i) => i.issues.length > 0).length;
  const excluded = items.filter((i) => !i.included && i.issues.length === 0).length;
  const cuePairTotal = items.reduce((sum, item) => sum + (item.cueAudioPairs ?? 0), 0);
  return { total: items.length, included, needsCorrection, excluded, cuePairTotal };
}

function updatePlanItem(plan: MovePlan, item: MovePlanItem): MovePlan {
  return {
    ...plan,
    items: plan.items.map((candidate) => (candidate.id === item.id ? item : candidate)),
  };
}

function mediaLabel(mediaType: MovePlanItem["mediaType"]) {
  const labels: Record<MovePlanItem["mediaType"], string> = {
    audiobook: "Audiobook",
    movie: "Movie",
    music: "Music",
    tv: "TV",
  };
  return labels[mediaType];
}

function settingLabel(key: string) {
  const labels: Record<string, string> = {
    audiobookDir: "Audiobooks",
    backupDir: "Backup",
    movieDir: "Movies",
    musicDir: "Music",
    stagingDir: "Download Staging",
    tvDir: "TV",
  };
  return labels[key] ?? key;
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element missing");

createRoot(rootElement).render(
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <RouterProvider router={router} />
    </TooltipProvider>
  </QueryClientProvider>,
);
