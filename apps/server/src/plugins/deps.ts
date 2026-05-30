import { Elysia } from "elysia";

import { createDb, createJobEventsRepo, createJobsRepo, createPlansRepo } from "../db/index.js";
import { createExecutionService } from "../execution.js";
import { createConfigState } from "../lib/config-state.js";
import { nullPlayer } from "../player/index.js";
import type { CreateDepsOptions, Deps } from "../types/deps.js";

export type { CreateDepsOptions, Deps } from "../types/deps.js";

/**
 * Builds API dependencies. Pure function — no global singleton.
 */
export function createDeps(options?: CreateDepsOptions): Deps {
  const { db, close } = createDb(options?.dbPath);
  const config = createConfigState(options?.initialConfig);
  const repos = {
    plans: createPlansRepo(db),
    jobs: createJobsRepo(db),
    jobEvents: createJobEventsRepo(db),
  };
  return {
    config,
    repos,
    execution: createExecutionService(repos),
    player: options?.player ?? nullPlayer,
    close,
  };
}

/**
 * Injects {@link Deps} onto the Elysia context for every route on this subrouter chain.
 */
export function depsPlugin(deps: Deps) {
  return new Elysia({ name: "deps" }).decorate({
    config: deps.config,
    repos: deps.repos,
    execution: deps.execution,
  });
}

/** Release SQLite and other resources. Safe to call multiple times in tests. */
export function closeDeps(deps: Deps): void {
  try {
    deps.close();
  } catch {
    // ignore
  }
}
