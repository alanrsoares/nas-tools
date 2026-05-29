import tw from "@styled-cva/react";

export const SettingsGrid = tw.div(
  "grid grid-cols-[repeat(2,minmax(240px,1fr))] gap-3 max-md:grid-cols-1",
);

export const SettingField = tw.label("grid gap-1");

export const SettingFieldLabel = tw.span("text-xs font-medium tracking-wide text-muted-foreground");
