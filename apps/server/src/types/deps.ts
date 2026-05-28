import type { NasPathConfig } from "@nas-tools/core";

import type { JobEventsRepo, JobsRepo, PlansRepo } from "../db/index.js";
import type { ExecutionService } from "../execution.js";
import type { ConfigState } from "../lib/config-state.js";

/** Repositories and services composed at startup (or in tests). */
export type ApiRepos = {
  plans: PlansRepo;
  jobs: JobsRepo;
  jobEvents: JobEventsRepo;
};

/**
 * Application dependencies. Created by {@link createDeps}; injected into Elysia
 * context via {@link depsPlugin}. Tests pass `dbPath` / `initialConfig` overrides.
 */
export type Deps = {
  config: ConfigState;
  repos: ApiRepos;
  execution: ExecutionService;
  close: () => void;
};

export type CreateDepsOptions = {
  /** SQLite file path (default: env). Use `":memory:"` in tests. */
  dbPath?: string;
  /** Seed in-memory config instead of package defaults. */
  initialConfig?: NasPathConfig;
};
