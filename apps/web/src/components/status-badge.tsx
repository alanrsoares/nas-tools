import type * as React from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Tone = "success" | "warning";

const toneClass: Record<Tone, string> = {
  success: "border-transparent bg-success/15 text-success-foreground",
  warning: "border-transparent bg-warning/15 text-warning-foreground",
};

type StatusBadgeProps = Omit<React.ComponentProps<typeof Badge>, "variant"> & {
  tone: Tone;
};

export function StatusBadge({ tone, className, ...props }: StatusBadgeProps) {
  return <Badge variant="outline" className={cn(toneClass[tone], className)} {...props} />;
}
