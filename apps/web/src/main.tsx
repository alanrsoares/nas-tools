import { QueryClientProvider } from "@tanstack/react-query";
import { createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { createRoot } from "react-dom/client";
import { z } from "zod";
import { TooltipProvider } from "@/components/ui/tooltip";
import { queryClient } from "./api";
import { AppShell } from "./components/AppShell";
import { CueSplit } from "./features/cue-split/CueSplit";
import { Dedupe } from "./features/dedupe/Dedupe";
import { Downloads } from "./features/downloads/Downloads";
import { Jobs } from "./features/jobs/Jobs";
import { Overview } from "./features/overview/Overview";
import { Settings } from "./features/settings/Settings";
import { Staging } from "./features/staging/Staging";

import "./styles.css";

// ── Router Setup ─────────────────────────────────────────────

const rootRoute = createRootRoute({
  component: AppShell,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: () => <Overview />,
});

const stagingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/staging",
  component: () => <Staging />,
});

const dedupeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/dedupe",
  component: () => <Dedupe />,
});

const cueRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/cue",
  component: CueSplit,
});

const jobsSearchSchema = z.object({
  jobId: z.string().optional(),
});

const jobsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/jobs",
  validateSearch: (search) => jobsSearchSchema.parse(search),
  component: () => <Jobs />,
});

const downloadsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/downloads",
  component: () => <Downloads />,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: () => <Settings />,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  stagingRoute,
  dedupeRoute,
  cueRoute,
  jobsRoute,
  downloadsRoute,
  settingsRoute,
]);

const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element missing");

createRoot(rootElement).render(
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <RouterProvider router={router} />
    </TooltipProvider>
  </QueryClientProvider>,
);
