import tw from "@styled-cva/react";

export const JobListItem = tw.button(
  "flex w-full cursor-pointer items-center gap-2 rounded-[5px] border-0 bg-transparent px-2.5 py-2 text-left text-foreground transition-colors duration-150 hover:bg-accent max-md:w-auto max-md:shrink-0 max-md:rounded-lg max-md:border max-md:border-border/70 max-md:px-3 max-md:py-2",
  {
    variants: {
      $active: { true: "bg-accent", false: "" },
    },
    defaultVariants: { $active: false },
  },
);

export const JobListMeta = tw.div("grid min-w-0 gap-px");

export const JobListType = tw.span("truncate text-[12.5px] font-medium");

export const JobListTime = tw.span("text-[11px] text-muted-foreground");

export const EventLog = tw.div(
  "h-[280px] overflow-y-auto rounded-[5px] border border-border bg-background px-3 py-2.5 font-mono text-[12.5px] [scrollbar-color:var(--border)_transparent] [scrollbar-width:thin]",
);

export const EventLogEmpty = tw.div(
  "flex flex-col items-center gap-1.5 py-5 text-xs italic text-muted-foreground",
);

export const EventLogArt = tw.pre(
  "m-0 text-[11px] not-italic leading-relaxed tracking-wider opacity-50",
);

export const EventLine = tw.div("flex items-baseline gap-2.5 py-0.5 leading-normal");

export const EventSeq = tw.span("min-w-6 select-none text-[11px] text-muted-foreground");

export const EventMessage = tw.span("text-foreground", {
  variants: {
    $level: {
      info: "",
      error: "text-[oklch(0.72_0.14_25)]",
      warning: "text-warning-foreground",
    },
  },
  defaultVariants: { $level: "info" },
});
