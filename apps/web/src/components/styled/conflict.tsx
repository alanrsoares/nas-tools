import tw from "@styled-cva/react";

export const ConflictCard = tw.div("rounded-md border border-warning/40 bg-warning p-3 text-sm");

export const ConflictAlbum = tw.div("mb-1 truncate font-medium text-foreground");

export const ConflictFiles = tw.div("flex flex-wrap gap-1");

export const ConflictFileTag = tw.span(
  "rounded bg-warning/60 px-1.5 py-0.5 font-mono text-xs text-warning-foreground",
);
