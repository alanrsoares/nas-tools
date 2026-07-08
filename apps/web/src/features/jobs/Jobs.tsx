import { match } from "@onrails/pattern";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  GitMerge,
  ListChecks,
  SkipForward,
  XCircle,
} from "lucide-react";
import React from "react";
import {
  ConflictAlbum,
  ConflictCard,
  ConflictFiles,
  ConflictFileTag,
  EmptyState,
  EventLine,
  EventLog,
  EventLogArt,
  EventLogEmpty,
  EventMessage,
  EventSeq,
  JobListItem,
  JobListMeta,
  JobListTime,
  JobListType,
  ResponsiveCard,
  ResponsiveCardContent,
  StatusDot,
} from "@/components/styled";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
} from "@/components/ui/pagination";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { withToken } from "@/lib/auth";
import { api, queryClient } from "../../api";
import { StatusBadge } from "../../components/status-badge";
import { TintedProgress } from "../../components/tinted-progress";
import type { JobEventRecord, JobRecord, JobStatus } from "../../types";
import { TERMINAL_STATUSES } from "../../types";
import { formatRelativeTime } from "../../utils";

// jobsRoute is defined in main.tsx; we receive the route id via declaration merge.
// useSearch needs the route id — import the route object is circular, so cast below.

type ConflictItem = {
  itemId: string;
  albumName: string;
  conflictingFiles: string[];
  sourcePath: string;
};

type ConflictPanelProps = {
  jobId: string;
  onResolved: () => void;
};

export function ConflictPanel({ jobId, onResolved }: ConflictPanelProps) {
  const conflictsQuery = useQuery({
    queryKey: ["job-conflicts", jobId],
    queryFn: async () => {
      const res = await api.jobs({ id: jobId }).conflicts.get();
      return res.data && "conflicts" in res.data ? (res.data.conflicts as ConflictItem[]) : [];
    },
    refetchOnMount: "always",
  });

  const conflicts = conflictsQuery.data ?? [];
  const [resolving, setResolving] = React.useState<Record<string, boolean>>({});

  if (conflicts.length === 0) return null;

  async function resolve(itemId: string, resolution: "skip" | "overwrite") {
    setResolving((r) => ({ ...r, [itemId]: true }));
    try {
      await api.jobs({ id: jobId })["resolve-conflict"].post({ itemId, resolution });
      await queryClient.invalidateQueries({ queryKey: ["job-conflicts", jobId] });
      onResolved();
    } finally {
      setResolving((r) => ({ ...r, [itemId]: false }));
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-sm font-medium text-warning-foreground">
        <AlertTriangle size={14} />
        <span>
          {conflicts.length} conflict{conflicts.length !== 1 ? "s" : ""} need resolution
        </span>
      </div>
      {conflicts.map((c) => (
        <ConflictCard key={c.itemId}>
          <ConflictAlbum>{c.albumName}</ConflictAlbum>
          <ConflictFiles>
            {c.conflictingFiles.map((f) => (
              <ConflictFileTag key={f}>{f}</ConflictFileTag>
            ))}
          </ConflictFiles>
          <div className="flex gap-2 mt-2">
            <Button
              size="sm"
              variant="outline"
              disabled={resolving[c.itemId]}
              onClick={() => resolve(c.itemId, "skip")}
            >
              <SkipForward size={12} />
              Skip
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={resolving[c.itemId]}
              onClick={() => resolve(c.itemId, "overwrite")}
            >
              <GitMerge size={12} />
              Force merge
            </Button>
          </div>
        </ConflictCard>
      ))}
    </div>
  );
}

type JobStatusDotProps = { status: JobStatus };

export function JobStatusDot({ status }: JobStatusDotProps) {
  return <StatusDot $status={status} />;
}

type JobStatusBadgeProps = { status: JobStatus };

export function JobStatusBadge({ status }: JobStatusBadgeProps) {
  return match(status)
    .with("running", () => (
      <Badge variant="default" className="gap-1">
        <Spinner className="size-[11px]" />
        Running
      </Badge>
    ))
    .with("completed", () => (
      <StatusBadge tone="success" className="gap-1">
        <CheckCircle2 size={11} />
        Completed
      </StatusBadge>
    ))
    .with("completed_with_failures", () => (
      <StatusBadge tone="warning" className="gap-1">
        <AlertTriangle size={11} />
        Partial
      </StatusBadge>
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

type JobDetailProps = { job: JobRecord };

function useJobDetail(initialJob: JobRecord) {
  const [liveJob, setLiveJob] = React.useState<JobRecord>(initialJob);
  const [events, setEvents] = React.useState<JobEventRecord[]>([]);
  const isTerminal = TERMINAL_STATUSES.has(liveJob.status);

  // Sync state when switching to a different job
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on job switch only, not on every poll refetch
  React.useEffect(() => {
    setLiveJob(initialJob);
    setEvents([]);
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
    const source = new EventSource(withToken(`/api/jobs/${initialJob.id}/events/stream`));
    source.onmessage = (e: MessageEvent<string>) => {
      // biome-ignore lint: trusted same-origin SSE; validate if JobEventRecord gets a Zod schema
      const event = JSON.parse(e.data) as JobEventRecord;
      setEvents((prev) => (prev.some((p) => p.seq === event.seq) ? prev : [...prev, event]));
    };
    source.onerror = () => source.close();
    return () => source.close();
  }, [initialJob.id]);

  const cancelMutation = useMutation({
    mutationFn: async () => await api.jobs({ id: initialJob.id }).cancel.post(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["jobs"] }),
  });

  return { liveJob, events, isTerminal, cancelMutation };
}

export function JobDetail({ job: initialJob }: JobDetailProps) {
  const { liveJob, events, isTerminal, cancelMutation } = useJobDetail(initialJob);
  const logRef = React.useRef<HTMLDivElement>(null);

  // Auto-scroll log
  React.useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, []);

  const counts = liveJob.counts;
  const progress =
    counts.total > 0 ? Math.round(((counts.completed + counts.failed) / counts.total) * 100) : 0;

  return (
    <ResponsiveCard className="min-w-0 flex-1">
      <ResponsiveCardContent className="flex flex-col gap-3">
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
            <TintedProgress
              value={progress}
              className="h-1 bg-muted"
              indicatorClassName={counts.failed > 0 ? "bg-[oklch(0.78_0.13_60)]" : ""}
            />
          </div>
        ) : null}

        {/* Event log */}
        <EventLog ref={logRef}>
          {events.length === 0 ? (
            <EventLogEmpty>
              <EventLogArt>{`  ┌ ─ ─ ─ ─ ─ ┐
    · · · · ·
  └ ─ ─ ─ ─ ─ ┘`}</EventLogArt>
              <span>waiting for events</span>
            </EventLogEmpty>
          ) : (
            events.map((event) => (
              <EventLine key={event.seq}>
                <EventSeq>{event.seq}</EventSeq>
                <EventMessage
                  $level={
                    event.level === "error" || event.level === "warning" ? event.level : "info"
                  }
                >
                  {event.message}
                </EventMessage>
              </EventLine>
            ))
          )}
        </EventLog>

        {/* Conflict resolution */}
        {isTerminal && liveJob.status === "completed_with_failures" ? (
          <ConflictPanel
            jobId={liveJob.id}
            onResolved={() => {
              queryClient.invalidateQueries({ queryKey: ["job-events", initialJob.id] });
            }}
          />
        ) : null}
      </ResponsiveCardContent>
    </ResponsiveCard>
  );
}

const JOBS_PAGE_SIZE = 30;

type JobsPaginationProps = {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
};

function JobsPagination({ currentPage, totalPages, onPageChange }: JobsPaginationProps) {
  if (totalPages <= 1) return null;
  return (
    <Pagination className="mt-2 max-md:mt-1">
      <PaginationContent className="gap-0.5">
        <PaginationItem>
          <PaginationLink
            size="icon"
            aria-label="Previous page"
            className={currentPage <= 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
            onClick={(e) => {
              e.preventDefault();
              if (currentPage > 1) onPageChange(currentPage - 1);
            }}
          >
            <ChevronLeft className="size-4" />
          </PaginationLink>
        </PaginationItem>
        <PaginationItem>
          <span className="px-1 text-xs text-muted-foreground whitespace-nowrap">
            {currentPage} / {totalPages}
          </span>
        </PaginationItem>
        <PaginationItem>
          <PaginationLink
            size="icon"
            aria-label="Next page"
            className={
              currentPage >= totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"
            }
            onClick={(e) => {
              e.preventDefault();
              if (currentPage < totalPages) onPageChange(currentPage + 1);
            }}
          >
            <ChevronRight className="size-4" />
          </PaginationLink>
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}

type JobListEntriesProps = {
  jobList: JobRecord[];
  selectedId: string | undefined;
  onSelect: (jobId: string) => void;
};

function JobListEntries({ jobList, selectedId, onSelect }: JobListEntriesProps) {
  return (
    <div className="grid gap-1 max-md:flex max-md:overflow-x-auto max-md:pb-1 max-md:pt-0.5 max-md:gap-1.5 max-md:[scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {jobList.map((job) => {
        const itemLabel =
          job.counts.total > 0
            ? `${job.counts.total} item${job.counts.total !== 1 ? "s" : ""}`
            : job.type === "cue_fix"
              ? "CUE fix"
              : "Move Plan";
        return (
          <JobListItem
            key={job.id}
            type="button"
            $active={selectedId === job.id}
            onClick={() => onSelect(job.id)}
          >
            <JobStatusDot status={job.status} />
            <JobListMeta>
              <JobListType>{itemLabel}</JobListType>
              <JobListTime>{formatRelativeTime(job.createdAt)}</JobListTime>
            </JobListMeta>
          </JobListItem>
        );
      })}
    </div>
  );
}

export function Jobs() {
  const { jobId, page } = useSearch({ from: "/jobs" });
  const navigate = useNavigate();
  const currentPage = page ?? 1;

  const jobsQuery = useQuery({
    queryKey: ["jobs", currentPage],
    queryFn: async () => {
      const res = await api.jobs.get({
        query: {
          limit: String(JOBS_PAGE_SIZE),
          offset: String((currentPage - 1) * JOBS_PAGE_SIZE),
        },
      });
      const jobs = res.data && "jobs" in res.data ? (res.data.jobs as JobRecord[]) : [];
      const total = res.data && "total" in res.data ? (res.data.total as number) : jobs.length;
      return { jobs, total };
    },
    // Only the most recent page tracks running jobs; older pages are static history.
    refetchInterval: currentPage === 1 ? 3000 : false,
    refetchOnMount: "always",
  });

  const jobList = jobsQuery.data?.jobs ?? [];
  const total = jobsQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / JOBS_PAGE_SIZE));

  function goToPage(next: number) {
    navigate({ to: "/jobs", search: { page: next } });
  }

  if (jobList.length === 0 && !jobsQuery.isLoading) {
    return (
      <ResponsiveCard>
        <ResponsiveCardContent>
          <EmptyState>
            <ListChecks size={28} />
            <span>No jobs yet. Confirm a Move Plan to start one.</span>
          </EmptyState>
        </ResponsiveCardContent>
      </ResponsiveCard>
    );
  }

  const selected = jobId ? (jobList.find((j) => j.id === jobId) ?? jobList[0]) : jobList[0];

  return (
    <div className="flex gap-4 max-md:flex-col" style={{ minWidth: 0 }}>
      {/* Job list */}
      <ResponsiveCard className="w-[220px] shrink-0 max-md:w-full md:sticky md:top-0 md:max-h-[calc(100dvh-7.5rem)] md:overflow-y-auto md:self-start">
        <ResponsiveCardContent className="p-2 max-md:p-0">
          <JobListEntries
            jobList={jobList}
            selectedId={selected?.id}
            onSelect={(id) => navigate({ to: "/jobs", search: { jobId: id } })}
          />
          <JobsPagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={goToPage}
          />
        </ResponsiveCardContent>
      </ResponsiveCard>

      {/* Job detail */}
      {selected ? <JobDetail job={selected} /> : null}
    </div>
  );
}
