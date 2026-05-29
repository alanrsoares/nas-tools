import tw from "@styled-cva/react";

export const Shell = tw.div("grid min-h-screen grid-cols-[220px_minmax(0,1fr)] max-md:grid-cols-1");

export const Sidebar = tw.aside(
  "flex flex-col border-r border-border bg-[oklch(0.125_0.015_175)] px-2.5 py-4 text-[oklch(0.92_0.006_155)] max-md:border-r-0 max-md:border-b max-md:px-2.5 max-md:py-3",
);

export const Brand = tw.div(
  "mb-2.5 flex items-center gap-2 border-b border-border px-2.5 pb-4 pt-1 text-[15px] font-semibold tracking-tight text-[oklch(0.94_0.008_155)] max-md:mb-2 max-md:pb-2.5",
);

export const Nav = tw.nav("grid gap-0.5 max-md:grid-cols-3 max-md:gap-0.5");

export const navLinkClass =
  "flex w-full items-center gap-2 rounded-[5px] border-0 bg-transparent px-2.5 py-2 text-left text-[13.5px] tracking-tight text-[oklch(0.82_0.01_165)] no-underline transition-colors duration-150 hover:bg-accent hover:text-foreground max-md:justify-center max-md:px-2 max-md:py-2 max-md:text-[13px]";

export const navLinkActiveClass = "bg-accent font-medium text-foreground [&_svg]:text-primary";

export const Content = tw.main("min-w-0 bg-background px-6 py-5 max-md:px-4 max-md:py-3.5");

export const Topbar = tw.header(
  "mb-4 flex min-h-9 items-center justify-between gap-4 border-b border-border pb-3.5 max-md:flex-col max-md:items-stretch",
);

export const PageTitle = tw.h1(
  "m-0 text-lg font-semibold leading-tight tracking-tight text-foreground",
);

export const SectionDesc = tw.p("mt-0.5 text-xs leading-snug text-muted-foreground");
