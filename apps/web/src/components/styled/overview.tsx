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

export const OverviewDlHeaderStats = tw.div("flex items-center gap-2.5");

export const OverviewAggregateRate = tw.span(
  "flex items-center gap-1 text-[12px] font-semibold tabular-nums text-primary",
);

export const OverviewDlList = tw.div("flex flex-col gap-1.5");

export const OverviewDlItem = tw.div(
  "flex flex-col gap-1.5 rounded-md border border-border/60 bg-background/30 px-2.5 py-2 transition-colors duration-150 hover:bg-accent/40",
  {
    variants: {
      $inactive: {
        true: "opacity-45 border-border/20 bg-background/10 hover:opacity-85 hover:bg-accent/20",
        false: "",
      },
    },
    defaultVariants: { $inactive: false },
  },
);

export const OverviewDlHeader = tw.div("flex items-center gap-2");

export const OverviewDlStatusDot = tw.span("size-1.5 shrink-0 rounded-full", {
  variants: {
    $active: { true: "bg-primary", false: "bg-muted-foreground/50" },
  },
  defaultVariants: { $active: false },
});

export const OverviewDlName = tw.span("min-w-0 flex-1 truncate text-[13px]", {
  variants: {
    $inactive: {
      true: "text-muted-foreground",
      false: "text-foreground",
    },
  },
  defaultVariants: { $inactive: false },
});

export const OverviewDlPct = tw.span(
  "shrink-0 text-[12px] font-semibold tabular-nums text-foreground",
);

export const OverviewDlFooter = tw.div("flex items-center justify-between gap-2");

export const OverviewDlRate = tw.div(
  "flex items-center gap-1.5 text-[11px] tabular-nums text-muted-foreground",
);

export const OverviewDlSpeed = tw.span("min-w-14 tabular-nums");

export const OverviewDlEta = tw.span("text-muted-foreground/70");

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
