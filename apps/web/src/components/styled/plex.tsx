import tw from "@styled-cva/react";

export const PlexScanPopover = tw.div("flex flex-col");

export const PlexScanHeader = tw.div(
  "flex items-center justify-between border-b border-border px-3 pb-1.5 pt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground",
);

export const PlexScanList = tw.div("py-1");

export const PlexScanItem = tw.button(
  "group flex w-full cursor-pointer items-center justify-between gap-2 border-0 bg-transparent px-3 py-1.5 text-left text-foreground hover:bg-accent hover:[&_.plex-scan-action]:text-foreground disabled:cursor-default",
  {
    variants: {
      $scanning: { true: "bg-primary/10", false: "" },
    },
    defaultVariants: { $scanning: false },
  },
);

export const PlexScanTitle = tw.span("min-w-0 truncate text-[13.5px]");

export const PlexScanAction = tw.span(
  "plex-scan-action flex shrink-0 items-center gap-1 text-xs text-muted-foreground",
);

export const PlexScanLoading = tw.div(
  "flex items-center gap-2 px-3 py-2.5 text-sm text-muted-foreground",
);
