import tw from "@styled-cva/react";
import type * as React from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const ConflictCard = tw.div("rounded-md border border-warning/40 bg-warning p-3 text-sm");

export const ConflictAlbum = tw.div("mb-1 truncate font-medium text-foreground");

export const ConflictFiles = tw.div("flex flex-wrap gap-1");

export function ConflictFileTag({ className, ...props }: React.ComponentProps<typeof Badge>) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "rounded border-transparent bg-warning/60 font-mono text-xs font-normal text-warning-foreground",
        className,
      )}
      {...props}
    />
  );
}
