import tw from "@styled-cva/react";

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
