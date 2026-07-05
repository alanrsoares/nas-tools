import tw from "@styled-cva/react";

export const ServerPulseBadge = tw.button(
  "inline-flex min-h-7 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-medium tracking-wide text-muted-foreground hover:bg-accent hover:text-foreground disabled:cursor-default disabled:opacity-80 max-md:min-h-8",
  {
    variants: {
      $connected: {
        true: "border-[oklch(0.42_0.09_155)] bg-[oklch(0.21_0.05_155)] text-[oklch(0.74_0.13_155)]",
        false: "",
      },
    },
    defaultVariants: { $connected: false },
  },
);

export const ServerPulseStatus = tw.span("inline-flex items-center gap-1.5 [&_svg]:opacity-70");

export const ServerPulseDivider = tw.span("h-4 w-px bg-current opacity-30");

export const ServerPulseAction = tw.span("inline-flex items-center gap-1.5");
