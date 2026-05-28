import type { MovePlan, MovePlanItem } from "@nas-tools/core";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  CheckCircle2,
  FolderCog,
  Loader2,
  Scissors,
  Search,
  Trash2,
} from "lucide-react";
import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api, queryClient } from "../../api";
import { IssueList, SummaryCell } from "../../components/IssueList";
import type { StagingPreviewItem } from "../../types";
import { mediaLabel, summarizePlan, updatePlanItem } from "../../utils";
import { PlexScanPopover } from "./PlexScanPopover";

type TransmissionStatus = {
  downloading: unknown[];
  seeding: number;
  orphaned: { id: number; name: string }[];
  total: number;
};

type DashboardData = {
  transmission: TransmissionStatus | null;
  staging: { total: number; withCue: number; preview?: StagingPreviewItem[] } | null;
};

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
  includedWithCue,
  onConfirm,
}: {
  plan: MovePlan;
  canConfirm: boolean | undefined;
  confirmIsPending: boolean;
  needsCorrection: number;
  includedWithCue: number;
  onConfirm: () => void;
}) {
  if (!plan.items.length) return null;
  const blockReason = !canConfirm
    ? needsCorrection > 0
      ? `Fix ${needsCorrection} item(s) before confirming`
      : includedWithCue > 0
        ? `${includedWithCue} item(s) have unsplit CUE files — enable Split CUE or go to the CUE Split page first`
        : "No items included"
    : null;
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
      {blockReason ? <TooltipContent>{blockReason}</TooltipContent> : null}
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
  includedWithCue,
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
  includedWithCue: number;
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
          includedWithCue={includedWithCue}
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
  const includedWithCue =
    plan?.items.filter((i) => i.included && (i.cueAudioPairs ?? 0) > 0).length ?? 0;
  const canConfirm = !!(
    plan &&
    stats &&
    stats.included > 0 &&
    stats.needsCorrection === 0 &&
    (plan.cueSplitEnabled || includedWithCue === 0)
  );

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
        includedWithCue={includedWithCue}
      />
    </div>
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
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
              const artistName = event.currentTarget.value;
              onChange({
                ...item,
                artistName,
                issues: artistName.trim()
                  ? item.issues.filter((i) => i.code !== "ARTIST_REQUIRED")
                  : item.issues,
              });
            }}
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
        <TooltipContent>{item.issues.map((issue) => issue.message).join(" · ")}</TooltipContent>
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

export function Staging() {
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
