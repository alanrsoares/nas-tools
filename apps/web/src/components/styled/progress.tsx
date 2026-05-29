import tw from "@styled-cva/react";

export const ProgressTrack = tw.div("h-1 overflow-hidden rounded-full bg-muted");

export const ProgressBar = tw.div(
  "h-full rounded-full bg-primary transition-[width] duration-300 ease-[cubic-bezier(0.25,0,0,1)]",
  {
    variants: {
      $failed: { true: "bg-[oklch(0.78_0.13_60)]", false: "" },
      $paused: { true: "bg-muted-foreground opacity-40", false: "" },
    },
    defaultVariants: { $failed: false, $paused: false },
  },
);

export const StatusDot = tw.span("size-[7px] shrink-0 rounded-full bg-muted-foreground", {
  variants: {
    $status: {
      queued: "bg-muted-foreground",
      running: "animate-pulse bg-primary",
      completed: "bg-success-foreground",
      completed_with_failures: "bg-[oklch(0.78_0.13_60)]",
      failed: "bg-destructive",
      canceled: "bg-muted-foreground",
      interrupted: "bg-muted-foreground",
    },
  },
  defaultVariants: { $status: "queued" },
});
