import { match } from "@onrails/pattern";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import {
  AlertTriangle,
  CheckCircle2,
  GitMerge,
  ListChecks,
  Loader2,
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
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { withToken } from "@/lib/auth";
import { api, queryClient } from "../../api";
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
            <Progress
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

export function Jobs() {
  const { jobId } = useSearch({ from: "/jobs" });
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
      <ResponsiveCard className="w-[220px] shrink-0 max-md:w-full">
        <ResponsiveCardContent className="p-2 max-md:p-0">
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
                  $active={selected?.id === job.id}
                  onClick={() => navigate({ to: "/jobs", search: { jobId: job.id } })}
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
        </ResponsiveCardContent>
      </ResponsiveCard>

      {/* Job detail */}
      {selected ? <JobDetail job={selected} /> : null}
    </div>
  );
}
