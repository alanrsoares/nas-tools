import tw from "@styled-cva/react";

export const EmptyState = tw.div(
  "grid min-h-[200px] place-items-center content-center gap-2.5 text-[13px] text-muted-foreground [&_svg]:opacity-40",
);

export const IssueList = tw.div("mb-3.5 grid gap-1.5");

export const IssueRow = tw.div(
  "flex items-center gap-2 rounded-[5px] border border-[oklch(0.38_0.1_55)] bg-[oklch(0.175_0.035_55)] px-2.5 py-2 text-[13px] text-[oklch(0.78_0.1_55)] [&_svg]:shrink-0 [&_svg]:opacity-80",
);

export const Summary = tw.section("flex flex-wrap gap-1.5");

export const SummaryCell = tw.div(
  "min-w-20 rounded-[5px] border border-border bg-muted px-2.5 py-1.5",
  {
    variants: {
      $tone: {
        default: "",
        warn: "[&_strong]:text-[oklch(0.73_0.13_60)]",
      },
    },
    defaultVariants: { $tone: "default" },
  },
);

export const SummaryCellLabel = tw.span(
  "block text-[11px] font-medium uppercase tracking-wide text-muted-foreground",
);

export const SummaryCellValue = tw.strong(
  "mt-0.5 block text-lg font-semibold tabular-nums text-foreground",
);
