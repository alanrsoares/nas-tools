import tw from "@styled-cva/react";

export const OverviewGrid = tw.div("grid grid-cols-2 gap-4 max-md:grid-cols-1");

export const OverviewDownloadsCard = tw.div("col-span-full");

export const OverviewCardHeader = tw.div("flex items-center justify-between");

export const OverviewCardTitle = tw.span("flex items-center gap-1.5 text-[13px] font-medium");

export const OverviewIdle = tw.div(
  "flex items-center gap-2 py-1.5 text-[13px] text-muted-foreground",
);

export const OverviewStats = tw.div("flex gap-3");

export const OverviewStat = tw.div("flex min-w-14 flex-col", {
  variants: {
    $warn: { true: "[&_strong]:text-[oklch(0.73_0.13_60)]", false: "" },
  },
  defaultVariants: { $warn: false },
});

export const OverviewStatValue = tw.strong(
  "text-[22px] font-semibold leading-tight tabular-nums text-foreground",
);

export const OverviewStatLabel = tw.span(
  "mt-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground",
);

export const OverviewDlList = tw.div("flex flex-col gap-2.5");

export const OverviewDlItem = tw.div("flex flex-col gap-1");

export const OverviewDlName = tw.span("max-w-full truncate text-[13px]");

export const OverviewDlMeta = tw.div("flex items-center gap-2");

export const OverviewDlPct = tw.span(
  "min-w-7 text-right text-[11px] tabular-nums text-muted-foreground",
);

export const OverviewDlSpeed = tw.span(
  "min-w-16 text-right text-[11px] tabular-nums text-muted-foreground",
);

export const OverviewDlEta = tw.span(
  "min-w-12 text-right text-[11px] tabular-nums text-muted-foreground",
);

export const OverviewDlControls = tw.div("flex shrink-0 items-center gap-0.5");

export const OverviewOrphanList = tw.div("flex flex-col gap-0.5");

export const OverviewOrphanItem = tw.span(
  "flex items-center gap-1 truncate text-xs text-muted-foreground",
  {
    variants: {
      $muted: { true: "text-muted-foreground/60", false: "" },
    },
    defaultVariants: { $muted: false },
  },
);

export const StagingCueIndicator = tw.span("shrink-0 text-[11px] text-warning-foreground");
