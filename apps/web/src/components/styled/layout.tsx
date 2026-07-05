import tw from "@styled-cva/react";

export const Shell = tw.div("grid min-h-screen grid-cols-[220px_minmax(0,1fr)] max-md:grid-cols-1");

export const Sidebar = tw.aside(
  "flex flex-col border-r border-border bg-[oklch(0.125_0.015_175)] px-2.5 py-4 text-[oklch(0.92_0.006_155)] max-md:contents",
);

export const Brand = tw.div(
  "mb-2.5 flex items-center gap-2 border-b border-border px-2.5 pb-4 pt-1 text-[15px] font-semibold tracking-tight text-[oklch(0.94_0.008_155)] max-md:hidden",
);

export const Nav = tw.nav(
  "grid gap-0.5 max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-50 max-md:grid-cols-8 max-md:items-stretch max-md:border-t max-md:border-border max-md:bg-[oklch(0.125_0.015_175/0.92)] max-md:px-1.5 max-md:pt-1 max-md:pb-[max(6px,env(safe-area-inset-bottom))] max-md:backdrop-blur-md",
);

export const navLinkClass =
  "relative flex w-full items-center gap-2 rounded-[5px] border-0 bg-transparent px-2.5 py-2 text-left text-[13.5px] tracking-tight text-[oklch(0.82_0.01_165)] no-underline transition-colors duration-150 hover:bg-accent hover:text-foreground max-md:min-h-11 max-md:flex-col max-md:items-center max-md:justify-center max-md:gap-0 max-md:rounded-md max-md:px-0 max-md:py-1.5 max-md:[&_svg]:size-5";

export const navLinkLabelClass = "max-md:hidden";

export const navBadgeClass =
  "ml-auto inline-flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-primary/15 px-1 text-[10px] font-semibold leading-none tabular-nums text-primary max-md:absolute max-md:left-1/2 max-md:top-0.5 max-md:ml-0 max-md:translate-x-[7px]";

export const navLinkActiveClass = "bg-accent font-medium text-foreground [&_svg]:text-primary";

export const Content = tw.main(
  "min-w-0 bg-background px-6 py-5 max-md:px-3.5 max-md:pt-3 max-md:pb-[calc(72px+env(safe-area-inset-bottom))]",
);

export const Topbar = tw.header(
  "mb-4 flex min-h-9 items-center justify-between gap-4 border-b border-border pb-3.5 max-md:mb-3.5 max-md:gap-3 max-md:pb-3",
);

export const TopbarHeading = tw.div("min-w-0");

export const PageTitle = tw.h1(
  "m-0 text-lg font-semibold leading-tight tracking-tight text-foreground max-md:truncate max-md:text-base",
);

export const SectionDesc = tw.p("mt-0.5 text-xs leading-snug text-muted-foreground max-md:hidden");

export const ResponsiveCard = tw.div(
  "rounded-lg border border-border bg-card text-card-foreground shadow-sm max-md:border-0 max-md:bg-transparent max-md:shadow-none",
);

export const ResponsiveCardContent = tw.div("p-4 max-md:p-0");
