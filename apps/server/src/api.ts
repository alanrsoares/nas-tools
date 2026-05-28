import { Elysia } from "elysia";

import { configModule } from "./modules/config.js";
import { cueModule } from "./modules/cue.js";
import { dashboardModule } from "./modules/dashboard.js";
import { healthModule } from "./modules/health.js";
import { jobsModule } from "./modules/jobs.js";
import { moveCompletedModule } from "./modules/move-completed.js";
import { musicDedupeModule } from "./modules/music-dedupe.js";
import { plexModule } from "./modules/plex.js";
import { searchModule } from "./modules/search.js";
import { transmissionModule } from "./modules/transmission.js";
import type { Deps } from "./types/deps.js";

/**
 * API router. Each module is a subrouter with {@link depsPlugin} on the same chain
 * so handlers get typed `config`, `repos`, and `execution` from context.
 */
export const createApi = (deps: Deps) =>
  new Elysia({ prefix: "/api" })
    .use(healthModule(deps))
    .use(dashboardModule(deps))
    .use(configModule(deps))
    .use(moveCompletedModule(deps))
    .use(musicDedupeModule(deps))
    .use(cueModule(deps))
    .use(jobsModule(deps))
    .use(transmissionModule(deps))
    .use(plexModule(deps))
    .use(searchModule(deps));

export type App = ReturnType<typeof createApi>;
