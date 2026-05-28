import { Elysia } from "elysia";
import { configRoutes } from "./routes/config.js";
import { cueRoutes } from "./routes/cue.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { healthRoutes } from "./routes/health.js";
import { jobRoutes } from "./routes/jobs.js";
import { moveCompletedRoutes } from "./routes/move-completed.js";
import { musicDedupeRoutes } from "./routes/music-dedupe.js";
import { plexRoutes } from "./routes/plex.js";
import { searchRoutes } from "./routes/search.js";
import { transmissionRoutes } from "./routes/transmission.js";

export const api = new Elysia({ prefix: "/api" })
  .use(healthRoutes)
  .use(dashboardRoutes)
  .use(configRoutes)
  .use(moveCompletedRoutes)
  .use(musicDedupeRoutes)
  .use(cueRoutes)
  .use(jobRoutes)
  .use(transmissionRoutes)
  .use(plexRoutes)
  .use(searchRoutes);

export type App = typeof api;
