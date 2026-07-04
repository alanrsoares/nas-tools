import type { Header } from "@tanstack/react-table";
import { flexRender } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";

type SortableHeaderProps<TData, TValue> = {
  header: Header<TData, TValue>;
  className?: string;
  alignCenter?: boolean;
  alignRight?: boolean;
};

export function SortableHeader<TData, TValue>({
  header,
  className = "",
  alignCenter = false,
  alignRight = false,
}: SortableHeaderProps<TData, TValue>) {
  const canSort = header.column.getCanSort();
  const isSorted = header.column.getIsSorted();

  return (
    <TableHead
      className={cn(className, canSort && "cursor-pointer select-none")}
      onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
    >
      <div
        className={cn(
          "flex items-center gap-1.5",
          alignCenter && "justify-center",
          alignRight && "justify-end",
        )}
      >
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
}
