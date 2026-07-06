import type { MovePlan, MovePlanItem } from "@nas-tools/core";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { ColumnDef, SortingState } from "@tanstack/react-table";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { AlertTriangle, CheckCircle2, FolderCog, Scissors, Search, Trash2 } from "lucide-react";
import React from "react";
import {
  CueSplitToggle as CueSplitToggleBox,
  CueSplitToggleLabel,
  EmptyState,
  ItemTitleInner,
  MutedText,
  PathTruncate,
  ResponsiveCard,
  ResponsiveCardContent,
  TitleCell,
  Toolbar,
} from "@/components/styled";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { api, queryClient } from "../../api";
import { IssueList, Summary, SummaryCell } from "../../components/IssueList";
import { SortableHeader } from "../../components/SortableHeader";
import { StatusBadge } from "../../components/status-badge";
import type { StagingPreviewItem } from "../../types";
import { mediaLabel, summarizePlan, updatePlanItem } from "../../utils";

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

type PlanSummaryStats = ReturnType<typeof summarizePlan>;

type StagingConfirmMutation = {
  isPending: boolean;
  mutate: (plan: MovePlan) => void;
};

type StagingScanMutation = {
  isPending: boolean;
  mutate: () => void;
};

type CueSplitToggleProps = {
  plan: MovePlan;
  setPlan: (plan: MovePlan) => void;
};

function CueSplitToggle({ plan, setPlan }: CueSplitToggleProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <CueSplitToggleBox className="max-md:w-full max-md:justify-center">
          <Checkbox
            id="staging-cue-split"
            checked={plan.cueSplitEnabled}
            onCheckedChange={(checked: boolean | "indeterminate") =>
              setPlan({ ...plan, cueSplitEnabled: checked === true })
            }
          />
          <CueSplitToggleLabel htmlFor="staging-cue-split">
            <Scissors size={14} />
            <span>Split CUE</span>
          </CueSplitToggleLabel>
        </CueSplitToggleBox>
      </TooltipTrigger>
      <TooltipContent>
        Split matching CUE/audio pairs after move and before Transmission cleanup
      </TooltipContent>
    </Tooltip>
  );
}

type StagingCleanButtonProps = {
  cleanTorrents: StagingCleanTorrentsMutation;
  orphanedCount: number;
};

function StagingCleanButton({ cleanTorrents, orphanedCount }: StagingCleanButtonProps) {
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
          {cleanTorrents.isPending ? <Spinner className="size-[15px]" /> : <Trash2 size={15} />}
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

type StagingConfirmButtonProps = {
  plan: MovePlan;
  canConfirm: boolean | undefined;
  confirmIsPending: boolean;
  needsCorrection: number;
  includedWithCue: number;
  onConfirm: () => void;
};

function StagingConfirmButton({
  plan,
  canConfirm,
  confirmIsPending,
  needsCorrection,
  includedWithCue,
  onConfirm,
}: StagingConfirmButtonProps) {
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
        <span className="max-md:block max-md:w-full [&>button]:max-md:w-full">
          <Button onClick={onConfirm} disabled={!canConfirm || confirmIsPending} size="sm">
            {confirmIsPending ? <Spinner className="size-[15px]" /> : <CheckCircle2 size={15} />}
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
  stats: PlanSummaryStats | undefined;
  cuePairTotal: number;
  orphanedCount: number;
  cleanTorrents: StagingCleanTorrentsMutation;
  confirm: StagingConfirmMutation;
  scan: StagingScanMutation;
  setPlan: (plan: MovePlan | undefined) => void;
};

type StagingSummarySectionProps = {
  stats: PlanSummaryStats | undefined;
  cuePairTotal: number;
};

function StagingSummarySection({ stats, cuePairTotal }: StagingSummarySectionProps) {
  if (!stats) return <div />;
  return (
    <Summary aria-label="Move Plan summary">
      <SummaryCell label="Found" value={stats.total} />
      <SummaryCell label="To move" value={stats.included} />
      {stats.excluded > 0 ? <SummaryCell label="Skipped" value={stats.excluded} /> : null}
      <SummaryCell
        label="Needs fix"
        value={stats.needsCorrection}
        tone={stats.needsCorrection > 0 ? "warn" : ""}
      />
      {cuePairTotal > 0 ? <SummaryCell label="CUE pairs" value={cuePairTotal} tone="warn" /> : null}
    </Summary>
  );
}

type StagingActionsProps = {
  plan: MovePlan | undefined;
  cuePairTotal: number;
  orphanedCount: number;
  cleanTorrents: StagingCleanTorrentsMutation;
  confirm: StagingConfirmMutation;
  scan: StagingScanMutation;
  setPlan: (plan: MovePlan | undefined) => void;
  canConfirm: boolean;
  needsCorrection: number;
  includedWithCue: number;
};

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
}: StagingActionsProps) {
  const showClean =
    orphanedCount > 0 || cleanTorrents.isPending || isCleanSuccess(cleanTorrents.data?.data);
  return (
    <div className="flex gap-2 items-center toolbar-actions max-md:w-full max-md:flex-col max-md:items-stretch">
      {plan && cuePairTotal > 0 ? <CueSplitToggle plan={plan} setPlan={setPlan} /> : null}
      {showClean ? (
        <StagingCleanButton cleanTorrents={cleanTorrents} orphanedCount={orphanedCount} />
      ) : null}
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
    <Toolbar>
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
    </Toolbar>
  );
}

type MovePlanTableProps = {
  plan: MovePlan;
  setPlan: (plan: MovePlan | undefined) => void;
};

function MovePlanTable({ plan, setPlan }: MovePlanTableProps) {
  const [sorting, setSorting] = React.useState<SortingState>([]);

  const columns = React.useMemo<ColumnDef<MovePlanItem>[]>(
    () => [
      {
        id: "use",
        header: () => (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="cursor-default">Use</span>
            </TooltipTrigger>
            <TooltipContent>Include this item in the move</TooltipContent>
          </Tooltip>
        ),
        cell: ({ row }) => {
          const item = row.original;
          return (
            <Checkbox
              aria-label={`Include ${item.albumName}`}
              checked={item.included}
              disabled={item.mediaType === "unknown"}
              onCheckedChange={(checked: boolean | "indeterminate") =>
                setPlan(updatePlanItem(plan, { ...item, included: !!checked }))
              }
            />
          );
        },
        enableSorting: false,
      },
      {
        accessorKey: "albumName",
        header: "Item",
        cell: ({ row }) => {
          const item = row.original;
          return (
            <ItemTitleInner>
              <span>{item.albumName}</span>
              {(item.cueAudioPairs ?? 0) > 0 ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <StatusBadge tone="warning" className="gap-1 cursor-default">
                      <Scissors size={12} />
                      CUE {item.cueAudioPairs}
                    </StatusBadge>
                  </TooltipTrigger>
                  <TooltipContent>Will split after move when Split CUE is enabled</TooltipContent>
                </Tooltip>
              ) : null}
            </ItemTitleInner>
          );
        },
      },
      {
        accessorKey: "mediaType",
        header: "Type",
        cell: ({ row }) => <Badge variant="secondary">{mediaLabel(row.original.mediaType)}</Badge>,
      },
      {
        accessorKey: "artistName",
        header: "Artist",
        cell: ({ row }) => {
          const item = row.original;
          const showWarning = item.issues.length > 0 && item.included;
          return item.mediaType === "music" ? (
            <Input
              aria-label={`Artist for ${item.albumName}`}
              className={showWarning ? "border-warning/60 bg-warning/20 max-w-60" : "max-w-60"}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                const artistName = event.currentTarget.value;
                setPlan(
                  updatePlanItem(plan, {
                    ...item,
                    artistName,
                    issues: artistName.trim()
                      ? item.issues.filter((i) => i.code !== "ARTIST_REQUIRED")
                      : item.issues,
                  }),
                );
              }}
              placeholder="Artist name…"
              value={item.artistName ?? ""}
            />
          ) : (
            <MutedText>—</MutedText>
          );
        },
      },
      {
        accessorFn: (item) => {
          if (item.mediaType === "unknown") return 0;
          if (item.issues.length > 0) return 1;
          if (!item.included) return 2;
          return 3;
        },
        id: "status",
        header: "Status",
        cell: ({ row }) => <PlanStatusBadge item={row.original} />,
      },
      {
        accessorKey: "targetPath",
        header: "Target",
        cell: ({ row }) => {
          const item = row.original;
          return item.mediaType === "unknown" ? (
            <MutedText>—</MutedText>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <PathTruncate>{item.targetPath}</PathTruncate>
              </TooltipTrigger>
              <TooltipContent className="max-w-sm break-all">{item.targetPath}</TooltipContent>
            </Tooltip>
          );
        },
      },
    ],
    [plan, setPlan],
  );

  const table = useReactTable({
    data: plan.items,
    columns,
    state: {
      sorting,
    },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="grid gap-4">
      {/* Desktop view */}
      <div className="hidden md:block overflow-x-auto rounded-md border border-border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <SortableHeader
                    key={header.id}
                    header={header}
                    className={header.id === "use" ? "w-14 text-center" : ""}
                    alignCenter={header.id === "use"}
                  />
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => {
                  if (cell.column.id === "albumName") {
                    return (
                      <TitleCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TitleCell>
                    );
                  }
                  let className = "";
                  if (cell.column.id === "use") {
                    className = "text-center";
                  }
                  return (
                    <TableCell key={cell.id} className={className}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile view */}
      <div className="flex flex-col gap-3 md:hidden">
        {table.getRowModel().rows.map((row) => {
          const item = row.original;
          const showWarning = item.issues.length > 0 && item.included;
          return (
            <Card key={row.id} className="border-border/50 bg-card/60">
              <CardContent className="p-3 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div className="pt-0.5 shrink-0">
                      <Checkbox
                        aria-label={`Include ${item.albumName}`}
                        checked={item.included}
                        disabled={item.mediaType === "unknown"}
                        onCheckedChange={(checked: boolean | "indeterminate") =>
                          setPlan(updatePlanItem(plan, { ...item, included: !!checked }))
                        }
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-sm text-foreground/95 flex flex-wrap items-center gap-1.5 leading-snug">
                        <span>{item.albumName}</span>
                        {(item.cueAudioPairs ?? 0) > 0 ? (
                          <StatusBadge tone="warning" className="gap-0.5 text-[9px] px-1 py-0 h-4">
                            <Scissors size={10} />
                            CUE {item.cueAudioPairs}
                          </StatusBadge>
                        ) : null}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {mediaLabel(item.mediaType)}
                      </div>
                    </div>
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-1">
                    <PlanStatusBadge item={item} />
                  </div>
                </div>

                {item.mediaType === "music" && (
                  <div className="flex flex-col gap-1 w-full">
                    <label
                      htmlFor={`artist-${item.id}`}
                      className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                    >
                      Artist Name
                    </label>
                    <Input
                      id={`artist-${item.id}`}
                      aria-label={`Artist for ${item.albumName}`}
                      className={cn(
                        "w-full h-8 text-xs",
                        showWarning && "border-warning/60 bg-warning/20",
                      )}
                      onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                        const artistName = event.currentTarget.value;
                        setPlan(
                          updatePlanItem(plan, {
                            ...item,
                            artistName,
                            issues: artistName.trim()
                              ? item.issues.filter((i) => i.code !== "ARTIST_REQUIRED")
                              : item.issues,
                          }),
                        );
                      }}
                      placeholder="Artist name…"
                      value={item.artistName ?? ""}
                    />
                  </div>
                )}

                {item.mediaType !== "unknown" && (
                  <div className="flex flex-col gap-1 w-full">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Target Path
                    </span>
                    <div className="text-[10px] font-mono text-muted-foreground/90 break-all select-all leading-normal bg-background/40 p-2 rounded border border-border/20">
                      {item.targetPath}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
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
      <EmptyState>
        <CheckCircle2 size={28} className="text-success-foreground" />
        <span>Staging area is clear — nothing to move.</span>
      </EmptyState>
    );
  }
  if (plan) {
    return <MovePlanTable plan={plan} setPlan={setPlan} />;
  }
  return (
    <EmptyState>
      {scanIsPending ? <Spinner className="size-[28px]" /> : <FolderCog size={28} />}
      <span>
        {scanIsPending ? "Scanning staging area…" : "Scan the staging area to build a Move Plan."}
      </span>
    </EmptyState>
  );
}

type PlanStatusBadgeProps = { item: MovePlanItem };

function PlanStatusBadge({ item }: PlanStatusBadgeProps) {
  if (item.mediaType === "unknown") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="secondary" className="cursor-default">
            Unsupported
          </Badge>
        </TooltipTrigger>
        <TooltipContent>{item.issues.map((issue) => issue.message).join(" · ")}</TooltipContent>
      </Tooltip>
    );
  }
  if (item.issues.length > 0) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <StatusBadge tone="warning" className="gap-1 cursor-default">
            <AlertTriangle size={13} />
            Needs fix
          </StatusBadge>
        </TooltipTrigger>
        <TooltipContent>{item.issues.map((issue) => issue.message).join(" · ")}</TooltipContent>
      </Tooltip>
    );
  }
  if (!item.included) return <Badge variant="secondary">Excluded</Badge>;
  return (
    <StatusBadge tone="success" className="gap-1">
      <CheckCircle2 size={13} />
      Included
    </StatusBadge>
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

  const scanData = scan.data?.data;
  const scanError = scan.error;
  const issues =
    scanData && "issues" in scanData
      ? scanData.issues
      : scanError?.value &&
          typeof scanError.value === "object" &&
          "issues" in scanError.value &&
          Array.isArray(scanError.value.issues)
        ? scanError.value.issues
        : [];

  const confirmIssues =
    confirm.data?.data && "issues" in confirm.data.data ? confirm.data.data.issues : [];

  return (
    <ResponsiveCard>
      <ResponsiveCardContent>
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
      </ResponsiveCardContent>
    </ResponsiveCard>
  );
}
