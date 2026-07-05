import { useMutation, useQuery } from "@tanstack/react-query";
import type { ColumnDef, SortingState } from "@tanstack/react-table";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  ArrowDown,
  CheckCircle2,
  Download,
  ExternalLink,
  Loader2,
  Plus,
  Search,
} from "lucide-react";
import React from "react";
import PlexGlyph from "@/assets/plex.svg?react";
import {
  EmptyState,
  MutedText,
  PathTruncate,
  ResponsiveCard,
  ResponsiveCardContent,
} from "@/components/styled";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { authHeaders } from "@/lib/auth";
import { downloadCategoriesQueryOptions } from "@/lib/download-categories-query";
import { isCategoryActive, type ProwlarrCategory } from "@/lib/prowlarr-categories";
import { cn } from "@/lib/utils";
import { api } from "../../api";
import { IssueList } from "../../components/IssueList";
import { SortableHeader } from "../../components/SortableHeader";
import { formatBytes, readSseStream } from "../../utils";
import { CategoryPicker } from "./CategoryPicker";
import {
  assessPlexFit,
  type PlexFit,
  type PlexFitLevel,
  type MediaKind as PlexMediaKind,
} from "./plex-fit";

type MediaKindValue = string;

/** Drops inactive subcategories and empty groups from the settings-configured tree. */
function visibleCategories(
  categories: ProwlarrCategory[],
  activeIds: number[] | null,
): ProwlarrCategory[] {
  return categories
    .map((group) => ({
      ...group,
      subCategories: group.subCategories.filter((sub) => isCategoryActive(sub.id, activeIds)),
    }))
    .filter((group) => isCategoryActive(group.id, activeIds) || group.subCategories.length > 0);
}

const DEFAULT_CATEGORIES: MediaKindValue[] = ["3040"];

const kindOfCategories = (cats: string[]): PlexMediaKind =>
  cats.length > 0 && cats.every((cat) => cat.startsWith("3")) ? "music" : "video";

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

function TorrentInfoLink({ url }: { url: string | null }) {
  if (!url) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open torrent page on indexer"
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-[5px] text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground max-md:size-9"
        >
          <ExternalLink size={14} />
        </a>
      </TooltipTrigger>
      <TooltipContent>Open torrent page</TooltipContent>
    </Tooltip>
  );
}

function DownloadActionCell({
  url,
  isAdded,
  isPending,
  onAdd,
}: {
  url: string | null;
  isAdded: boolean;
  isPending: boolean;
  onAdd: (url: string) => void;
}) {
  if (!url) return <MutedText className="text-xs">no link</MutedText>;
  return (
    <Button
      size="sm"
      variant={isAdded ? "secondary" : "default"}
      disabled={isAdded || isPending}
      onClick={() => onAdd(url)}
    >
      {isAdded ? <CheckCircle2 size={13} /> : <Plus size={13} />}
      {isAdded ? "Added" : "Add"}
    </Button>
  );
}

async function readSearchStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onStatus: (msg: string) => void,
  onResult: (results: SearchResult[]) => void,
  onError: (err: string) => void,
) {
  await readSseStream(reader, (raw: unknown) => {
    const data = raw as { type: string; message?: string; results?: SearchResult[] };
    if (data.type === "status") {
      onStatus(data.message ?? "");
    } else if (data.type === "result") {
      onResult(data.results ?? []);
    } else if (data.type === "error") {
      onError(data.message ?? "Search failed");
    }
  });
}

function getSearchErrorMessage(cause: unknown): string {
  if (cause instanceof Error) {
    if (cause.name === "AbortError") return "Search cancelled";
    return cause.message;
  }
  return String(cause);
}

function getAddErrorMessage(value: unknown): string {
  if (
    typeof value === "object" &&
    value !== null &&
    "issues" in value &&
    Array.isArray(value.issues)
  ) {
    const messages = value.issues
      .map((issue: unknown) =>
        typeof issue === "object" && issue !== null && "message" in issue
          ? String(issue.message)
          : null,
      )
      .filter((m): m is string => m !== null);
    if (messages.length > 0) return messages.join(" · ");
  }
  return "Failed to add torrent to Transmission";
}

const plexFitStyles: Record<PlexFitLevel, string> = {
  ready: "border-primary/25 bg-primary/10 text-primary",
  warn: "border-warning/30 bg-warning/10 text-warning-foreground",
  avoid: "border-destructive/30 bg-destructive/10 text-destructive",
};

function PlexFitBadge({ fit }: { fit: PlexFit | null }) {
  if (!fit) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-1.5 text-[10px] font-medium leading-4",
            plexFitStyles[fit.level],
          )}
        >
          <PlexGlyph width={9} height={9} aria-hidden="true" className="shrink-0" />
          {fit.label}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{fit.detail}</TooltipContent>
    </Tooltip>
  );
}

type SearchResultsTableProps = {
  results: SearchResult[];
  added: Set<string>;
  isPending: boolean;
  kind: PlexMediaKind;
  onAdd: (url: string) => void;
};

function SearchResultsTable({ results, added, isPending, kind, onAdd }: SearchResultsTableProps) {
  const [sorting, setSorting] = React.useState<SortingState>([]);

  const columns = React.useMemo<ColumnDef<SearchResult>[]>(
    () => [
      {
        accessorKey: "title",
        header: "Title",
        cell: ({ row }) => (
          <div className="flex items-center gap-1.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <PathTruncate className="max-w-[380px] max-md:max-w-none max-md:overflow-visible max-md:text-clip">
                  {row.original.title}
                </PathTruncate>
              </TooltipTrigger>
              <TooltipContent className="max-w-sm break-words">{row.original.title}</TooltipContent>
            </Tooltip>
            <PlexFitBadge fit={assessPlexFit(row.original.title, kind)} />
          </div>
        ),
      },
      {
        accessorKey: "indexer",
        header: "Indexer",
        cell: ({ row }) => (
          <span className="text-muted-foreground text-xs">{row.original.indexer}</span>
        ),
      },
      {
        accessorKey: "seeders",
        header: "Seeds",
        cell: ({ row }) => <span className="tabular-nums text-sm">{row.original.seeders}</span>,
      },
      {
        accessorKey: "size",
        header: "Size",
        cell: ({ row }) => (
          <span className="tabular-nums text-sm text-muted-foreground">
            {formatBytes(row.original.size)}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => {
          const url = row.original.downloadUrl;
          return (
            <div className="flex items-center justify-end gap-1">
              <TorrentInfoLink url={row.original.infoUrl} />
              <DownloadActionCell
                url={url}
                isAdded={url ? added.has(url) : false}
                isPending={isPending}
                onAdd={onAdd}
              />
            </div>
          );
        },
        enableSorting: false,
      },
    ],
    [added, isPending, kind, onAdd],
  );

  const table = useReactTable({
    data: results,
    columns,
    state: {
      sorting,
    },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const sortedBy = sorting[0]?.id;
  const toggleMobileSort = (id: "seeders" | "size") =>
    setSorting((prev) => (prev[0]?.id === id ? [] : [{ id, desc: true }]));

  return (
    <>
      {/* Mobile: result count + sort chips */}
      <div className="flex items-center justify-between gap-2 md:hidden">
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {results.length} result{results.length !== 1 ? "s" : ""}
        </span>
        <div className="flex gap-1.5">
          {(["seeders", "size"] as const).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => toggleMobileSort(id)}
              className={cn(
                "inline-flex min-h-7 items-center gap-1 rounded-full border border-border bg-muted px-2.5 text-[11px] font-medium text-muted-foreground transition-colors duration-150",
                sortedBy === id && "border-primary/40 bg-primary/10 text-primary",
              )}
            >
              {id === "seeders" ? "Seeds" : "Size"}
              {sortedBy === id ? <ArrowDown size={11} /> : null}
            </button>
          ))}
        </div>
      </div>

      {/* Mobile: card list */}
      <div className="flex flex-col divide-y divide-border rounded-md border border-border md:hidden">
        {table.getRowModel().rows.map((row) => {
          const r = row.original;
          return (
            <div key={row.id} className="flex items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <div className="text-[13px] leading-snug [overflow-wrap:anywhere]">{r.title}</div>
                <div className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[11px] tabular-nums text-muted-foreground">
                  <span>{r.indexer}</span>
                  <span aria-hidden="true">·</span>
                  <span className={cn(r.seeders === 0 && "text-warning-foreground")}>
                    {r.seeders} seed{r.seeders !== 1 ? "s" : ""}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{formatBytes(r.size)}</span>
                  <PlexFitBadge fit={assessPlexFit(r.title, kind)} />
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <TorrentInfoLink url={r.infoUrl} />
                <DownloadActionCell
                  url={r.downloadUrl}
                  isAdded={r.downloadUrl ? added.has(r.downloadUrl) : false}
                  isPending={isPending}
                  onAdd={onAdd}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop: table */}
      <div className="hidden overflow-x-auto rounded-md border border-border md:block">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const columnClasses: Record<string, string> = {
                    indexer: "w-36",
                    seeders: "w-16 text-right",
                    size: "w-24 text-right",
                    actions: "w-28",
                  };
                  const className = columnClasses[header.id] ?? "";
                  return (
                    <SortableHeader
                      key={header.id}
                      header={header}
                      className={className}
                      alignRight={header.id === "seeders" || header.id === "size"}
                    />
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => {
                  let className = "";
                  if (cell.column.id === "seeders" || cell.column.id === "size") {
                    className = "text-right";
                  } else if (cell.column.id === "actions") {
                    className = "text-right";
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
    </>
  );
}

type DownloadsSearchFormProps = {
  query: string;
  selectedCategories: MediaKindValue[];
  categories: ProwlarrCategory[];
  activeIds: number[] | null;
  isSearching: boolean;
  onQueryChange: (q: string) => void;
  onCategoriesChange: (c: MediaKindValue[]) => void;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
};

function DownloadsSearchForm({
  query,
  selectedCategories,
  categories,
  activeIds,
  isSearching,
  onQueryChange,
  onCategoriesChange,
  onSubmit,
  onCancel,
}: DownloadsSearchFormProps) {
  return (
    <form onSubmit={onSubmit} className="flex gap-2 max-sm:flex-col">
      <Input
        value={query}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onQueryChange(e.currentTarget.value)}
        placeholder="Search…"
        className="flex-1"
        disabled={isSearching}
      />
      <div className="flex gap-2 max-sm:w-full">
        <CategoryPicker
          categories={categories}
          activeIds={activeIds}
          value={selectedCategories}
          onChange={onCategoriesChange}
          disabled={isSearching}
          className="w-40 shrink-0 max-sm:flex-1"
        />
        {isSearching ? (
          <Button
            type="button"
            onClick={onCancel}
            variant="destructive"
            size="sm"
            className="max-sm:flex-1"
          >
            <Loader2 size={15} className="animate-spin" />
            <span>Cancel</span>
          </Button>
        ) : (
          <Button type="submit" disabled={!query.trim()} size="sm" className="max-sm:flex-1">
            <Search size={15} />
            <span>Search</span>
          </Button>
        )}
      </div>
    </form>
  );
}

type DownloadsBodyProps = {
  searchIsSuccess: boolean;
  results: SearchResult[];
  added: Set<string>;
  isPending: boolean;
  kind: PlexMediaKind;
  onAdd: (url: string) => void;
};

function DownloadsBody({
  searchIsSuccess,
  results,
  added,
  isPending,
  kind,
  onAdd,
}: DownloadsBodyProps) {
  if (searchIsSuccess && results.length === 0) {
    return (
      <EmptyState>
        <Search size={28} />
        <span>No results found.</span>
      </EmptyState>
    );
  }
  if (results.length > 0) {
    return (
      <SearchResultsTable
        results={results}
        added={added}
        isPending={isPending}
        kind={kind}
        onAdd={onAdd}
      />
    );
  }
  if (!searchIsSuccess) {
    return (
      <EmptyState>
        <Download size={28} />
        <span>Search Prowlarr indexers for music, movies, or TV.</span>
      </EmptyState>
    );
  }
  return null;
}

export function Downloads() {
  const categoriesQuery = useQuery(downloadCategoriesQueryOptions());
  const activeIds = categoriesQuery.data?.activeIds ?? null;
  const categories = visibleCategories(categoriesQuery.data?.categories ?? [], activeIds);

  const [query, setQuery] = React.useState("");
  const [selectedCategories, setSelectedCategories] =
    React.useState<MediaKindValue[]>(DEFAULT_CATEGORIES);
  const [added, setAdded] = React.useState<Set<string>>(new Set());

  const [isSearching, setIsSearching] = React.useState(false);
  const [searchStatus, setSearchStatus] = React.useState<string>();
  const [results, setResults] = React.useState<SearchResult[]>([]);
  // Captured at search time so badge assessment matches the results shown
  // even if the category dropdown changes afterwards.
  const [resultsKind, setResultsKind] = React.useState<PlexMediaKind>("music");
  const [searchSuccess, setSearchSuccess] = React.useState(false);
  const [searchError, setSearchError] = React.useState<string | null>(null);

  const abortControllerRef = React.useRef<AbortController | null>(null);
  const readerRef = React.useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);

  // Cancelling the reader (not just the fetch) matters: WebKit does not
  // reject a pending read() on fetch abort, so abort alone hangs on iOS.
  const stopStream = React.useCallback(() => {
    readerRef.current?.cancel().catch(() => {});
    readerRef.current = null;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
  }, []);

  React.useEffect(() => stopStream, [stopStream]);

  const handleCancel = React.useCallback(() => {
    stopStream();
    setIsSearching(false);
    setSearchStatus(undefined);
    setSearchError(null);
  }, [stopStream]);

  const handleSearch = React.useCallback(
    async (q: string, cats: string[]) => {
      stopStream();
      const controller = new AbortController();
      abortControllerRef.current = controller;
      // False once cancelled or superseded by a newer search; stale streams
      // must not touch state after that.
      const isCurrent = () => abortControllerRef.current === controller;

      setIsSearching(true);
      setSearchStatus("Connecting...");
      setSearchError(null);
      setResults([]);
      setResultsKind(kindOfCategories(cats));
      setSearchSuccess(false);

      const finish = (outcome: { results?: SearchResult[]; error?: string }) => {
        if (!isCurrent()) return;
        if (outcome.results) {
          setResults(outcome.results);
          setSearchSuccess(true);
        }
        if (outcome.error) setSearchError(outcome.error);
        setIsSearching(false);
        setSearchStatus(undefined);
      };

      try {
        const params = new URLSearchParams({ q, categories: cats.join(",") });
        const response = await fetch(`/api/search?${params}`, {
          headers: authHeaders(),
          signal: controller.signal,
        });

        const reader = response.body?.getReader();
        if (!reader) throw new Error("Search stream did not open");
        if (!isCurrent()) {
          reader.cancel().catch(() => {});
          return;
        }
        readerRef.current = reader;

        let finished = false;
        await readSearchStream(
          reader,
          (msg) => {
            if (isCurrent()) setSearchStatus(msg);
          },
          (res) => {
            finished = true;
            finish({ results: res });
          },
          (err) => {
            finished = true;
            finish({ error: err });
          },
        );

        // Stream closed without result or error (idle timeout, server
        // restart) — without this the spinner runs forever.
        if (!finished) {
          finish({ error: "Search connection closed unexpectedly — try again" });
        }
      } catch (cause: unknown) {
        finish({ error: getSearchErrorMessage(cause) });
      } finally {
        if (isCurrent()) {
          readerRef.current = null;
          abortControllerRef.current = null;
        }
      }
    },
    [stopStream],
  );

  const addTorrent = useMutation({
    mutationFn: async (url: string) => {
      const res = await api.transmission.add.post({ url });
      if (res.error) throw new Error(getAddErrorMessage(res.error.value));
      return res.data;
    },
    onSuccess: (_, url) => setAdded((prev) => new Set([...prev, url])),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) handleSearch(query.trim(), selectedCategories);
  };

  return (
    <ResponsiveCard>
      <ResponsiveCardContent className="flex flex-col gap-4">
        <DownloadsSearchForm
          query={query}
          selectedCategories={selectedCategories}
          categories={categories}
          activeIds={activeIds}
          isSearching={isSearching}
          onQueryChange={setQuery}
          onCategoriesChange={setSelectedCategories}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
        />
        {searchStatus ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground animate-pulse pl-1">
            <Loader2 size={14} className="animate-spin" />
            <span>{searchStatus}</span>
          </div>
        ) : null}
        {searchError ? (
          <IssueList issues={[{ code: "SEARCH_ERROR", message: searchError }]} />
        ) : null}
        {addTorrent.isError ? (
          <IssueList issues={[{ code: "ADD_ERROR", message: addTorrent.error.message }]} />
        ) : null}
        <DownloadsBody
          searchIsSuccess={searchSuccess}
          results={results}
          added={added}
          isPending={addTorrent.isPending}
          kind={resultsKind}
          onAdd={(url) => addTorrent.mutate(url)}
        />
      </ResponsiveCardContent>
    </ResponsiveCard>
  );
}
