import type { NasPathConfig } from "@nas-tools/core";

import type {
  DownloadCategorySettingsRepo,
  JobEventsRepo,
  JobsRepo,
  PlansRepo,
} from "../db/index.js";
import type { ExecutionService } from "../execution.js";
import type { ConfigState } from "../lib/config-state.js";
import type { PlayerPort } from "../player/index.js";

/** Repositories and services composed at startup (or in tests). */
export type ApiRepos = {
  plans: PlansRepo;
  jobs: JobsRepo;
  jobEvents: JobEventsRepo;
  downloadCategorySettings: DownloadCategorySettingsRepo;
};

/**
 * Application dependencies. Created by {@link createDeps}; injected into Elysia
 * context via {@link depsPlugin}. Tests pass `dbPath` / `initialConfig` overrides.
 */
export type Deps = {
  config: ConfigState;
  repos: ApiRepos;
  execution: ExecutionService;
  player: PlayerPort;
  close: () => void;
};

export type CreateDepsOptions = {
  /** SQLite file path (default: env). Use `":memory:"` in tests. */
  dbPath?: string;
  /** Seed in-memory config instead of package defaults. */
  initialConfig?: NasPathConfig;
  /** Pre-constructed player port. Omit in tests — a no-op stub is used. */
  player?: PlayerPort;
};
