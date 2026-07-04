import { useMutation } from "@tanstack/react-query";
import type { ColumnDef, SortingState } from "@tanstack/react-table";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, CheckCircle2, Download, Loader2, Plus, Search } from "lucide-react";
import React from "react";
import { cn } from "@/lib/utils";
import { EmptyState, MutedText, PathTruncate, ResponsiveCard, ResponsiveCardContent } from "@/components/styled";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { authHeaders } from "@/lib/auth";
import { api } from "../../api";
import { IssueList } from "../../components/IssueList";
import { formatBytes, readSseStream } from "../../utils";

const MEDIA_KINDS = [
  { value: "3040", label: "Music – Lossless", group: "Music" },
  { value: "3010", label: "Music – MP3", group: "Music" },
  { value: "3000", label: "Music – All", group: "Music" },
  { value: "2000", label: "Movies", group: "Video" },
  { value: "5000", label: "TV", group: "Video" },
] as const;

type MediaKindValue = (typeof MEDIA_KINDS)[number]["value"];

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

type SearchResultsTableProps = {
  results: SearchResult[];
  added: Set<string>;
  isPending: boolean;
  onAdd: (url: string) => void;
};

function SearchResultsTable({ results, added, isPending, onAdd }: SearchResultsTableProps) {
  const [sorting, setSorting] = React.useState<SortingState>([]);

  const columns = React.useMemo<ColumnDef<SearchResult>[]>(
    () => [
      {
        accessorKey: "title",
        header: "Title",
        cell: ({ row }) => (
          <Tooltip>
            <TooltipTrigger asChild>
              <PathTruncate className="max-w-[380px] max-md:max-w-none max-md:overflow-visible max-md:text-clip">{row.original.title}</PathTruncate>
            </TooltipTrigger>
            <TooltipContent className="max-w-sm break-words">{row.original.title}</TooltipContent>
          </Tooltip>
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
        cell: ({ row }) => (
          <span className="tabular-nums text-sm">{row.original.seeders}</span>
        ),
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
          const isAdded = url ? added.has(url) : false;
          return url ? (
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
            <MutedText className="text-xs">no link</MutedText>
          );
        },
        enableSorting: false,
      },
    ],
    [added, isPending, onAdd]
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

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                let className = "";
                if (header.id === "indexer") className = "w-36";
                else if (header.id === "seeders") className = "w-16 text-right";
                else if (header.id === "size") className = "w-24 text-right";
                else if (header.id === "actions") className = "w-20";

                const canSort = header.column.getCanSort();
                const isSorted = header.column.getIsSorted();

                return (
                  <TableHead
                    key={header.id}
                    className={cn(
                      className,
                      canSort && "cursor-pointer select-none"
                    )}
                    onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                  >
                    <div className={cn("flex items-center gap-1.5", (header.id === "seeders" || header.id === "size") && "justify-end")}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                      {canSort && (
                        <span>
                          {isSorted === "asc" ? (
                            <ArrowUp className="h-3.5 w-3.5 shrink-0" />
                          ) : isSorted === "desc" ? (
                            <ArrowDown className="h-3.5 w-3.5 shrink-0" />
                          ) : (
                            <ArrowUpDown className="h-3.5 w-3.5 opacity-50 shrink-0 hover:opacity-100" />
                          )}
                        </span>
                      )}
                    </div>
                  </TableHead>
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
  );
}

type DownloadsSearchFormProps = {
  query: string;
  category: MediaKindValue;
  isSearching: boolean;
  searchStatus: string | undefined;
  onQueryChange: (q: string) => void;
  onCategoryChange: (c: MediaKindValue) => void;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
};

function DownloadsSearchForm({
  query,
  category,
  isSearching,
  searchStatus,
  onQueryChange,
  onCategoryChange,
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
        <Select 
          value={category} 
          onValueChange={(v) => onCategoryChange(v as MediaKindValue)}
          disabled={isSearching}
        >
          <SelectTrigger className="w-40 shrink-0 max-sm:flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>Music</SelectLabel>
              {MEDIA_KINDS.filter((k) => k.group === "Music").map((k) => (
                <SelectItem key={k.value} value={k.value}>
                  {k.label}
                </SelectItem>
              ))}
            </SelectGroup>
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel>Video</SelectLabel>
              {MEDIA_KINDS.filter((k) => k.group === "Video").map((k) => (
                <SelectItem key={k.value} value={k.value}>
                  {k.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        {isSearching ? (
          <Button type="button" onClick={onCancel} variant="destructive" size="sm" className="max-sm:flex-1">
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
  onAdd: (url: string) => void;
};

function DownloadsBody({ searchIsSuccess, results, added, isPending, onAdd }: DownloadsBodyProps) {
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
      <SearchResultsTable results={results} added={added} isPending={isPending} onAdd={onAdd} />
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
  const [query, setQuery] = React.useState("");
  const [category, setCategory] = React.useState<MediaKindValue>("3040");
  const [added, setAdded] = React.useState<Set<string>>(new Set());

  const [isSearching, setIsSearching] = React.useState(false);
  const [searchStatus, setSearchStatus] = React.useState<string>();
  const [results, setResults] = React.useState<SearchResult[]>([]);
  const [searchSuccess, setSearchSuccess] = React.useState(false);
  const [searchError, setSearchError] = React.useState<string | null>(null);

  const abortControllerRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const handleCancel = React.useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsSearching(false);
    setSearchStatus(undefined);
  }, []);

  const handleSearch = React.useCallback(async (q: string, cat: string) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsSearching(true);
    setSearchStatus("Connecting...");
    setSearchError(null);
    setResults([]);
    setSearchSuccess(false);

    try {
      const params = new URLSearchParams({ q, categories: cat });
      const response = await fetch(`/api/search?${params}`, {
        headers: authHeaders(),
        signal: controller.signal,
      });

      const reader = response.body?.getReader();
      if (!reader) throw new Error("Search stream did not open");

      await readSseStream(reader, (raw: any) => {
        if (raw.type === "status") {
          setSearchStatus(raw.message);
        } else if (raw.type === "result") {
          setResults(raw.results ?? []);
          setSearchSuccess(true);
          setIsSearching(false);
          setSearchStatus(undefined);
        } else if (raw.type === "error") {
          setSearchError(raw.message);
          setIsSearching(false);
          setSearchStatus(undefined);
        }
      });
    } catch (cause: any) {
      if (cause.name === "AbortError") {
        setSearchError("Search cancelled");
      } else {
        setSearchError(cause instanceof Error ? cause.message : String(cause));
      }
      setIsSearching(false);
      setSearchStatus(undefined);
    }
  }, []);

  const addTorrent = useMutation({
    mutationFn: async (url: string) => await api.transmission.add.post({ url }),
    onSuccess: (_, url) => setAdded((prev) => new Set([...prev, url])),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) handleSearch(query.trim(), category);
  };

  return (
    <ResponsiveCard>
      <ResponsiveCardContent className="flex flex-col gap-4">
        <DownloadsSearchForm
          query={query}
          category={category}
          isSearching={isSearching}
          searchStatus={searchStatus}
          onQueryChange={setQuery}
          onCategoryChange={setCategory}
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
        <DownloadsBody
          searchIsSuccess={searchSuccess}
          results={results}
          added={added}
          isPending={addTorrent.isPending}
          onAdd={(url) => addTorrent.mutate(url)}
        />
      </ResponsiveCardContent>
    </ResponsiveCard>
  );
}
