import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, Download, Loader2, Plus, Search } from "lucide-react";
import React from "react";
import { EmptyState, MutedText, PathTruncate } from "@/components/styled";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { api } from "../../api";
import { IssueList } from "../../components/IssueList";
import { formatBytes } from "../../utils";

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
            <PathTruncate className="max-w-[380px]">{result.title}</PathTruncate>
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
          <MutedText className="text-xs">no link</MutedText>
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
        <span>Search Prowlarr indexers for lossless audio.</span>
      </EmptyState>
    );
  }
  return null;
}

export function Downloads() {
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
