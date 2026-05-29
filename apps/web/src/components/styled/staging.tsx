import tw from "@styled-cva/react";
import { TableCell } from "@/components/ui/table";

export const Toolbar = tw.div(
  "mb-3.5 flex items-start justify-between gap-3.5 max-md:flex-col max-md:items-stretch",
);

export const CueSplitToggle = tw.div(
  "inline-flex h-8 cursor-pointer items-center gap-2 rounded-md border border-border bg-background px-2.5 text-[13px] font-medium text-foreground hover:bg-muted",
);

export const CueSplitToggleLabel = tw.label("inline-flex cursor-pointer items-center gap-2");

export const PathCell = tw(TableCell)`max-w-[340px] tabular-nums [overflow-wrap:anywhere]`;

export const TitleCell = tw(TableCell)`min-w-[220px] font-semibold`;

export const ItemTitleInner = tw.div(
  "flex min-w-0 items-center gap-2 [&>span:first-child]:min-w-0 [&>span:first-child]:[overflow-wrap:anywhere]",
);

export const PathTruncate = tw.span("block max-w-[220px] cursor-default truncate tabular-nums");

export const MutedText = tw.span("text-muted-foreground");

export const StrongText = tw.span("font-semibold");
