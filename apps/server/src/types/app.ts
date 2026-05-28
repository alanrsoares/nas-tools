import type { Elysia } from "elysia";

import type { ExecutionService } from "../execution.js";
import type { ConfigState } from "../lib/config-state.js";
import type { ApiRepos } from "./deps.js";

/**
 * Context fields added by {@link depsPlugin}. Handlers destructure these directly.
 */
export type ApiDecorator = {
  config: ConfigState;
  repos: ApiRepos;
  execution: ExecutionService;
};

/** Singleton shape for a deps-aware Elysia instance (tests, Eden helpers). */
export type DepsSingleton = {
  decorator: ApiDecorator & Record<string, unknown>;
  store: Record<string, unknown>;
  derive: Record<string, unknown>;
  resolve: Record<string, unknown>;
};

export type DepsElysiaApp = Elysia<string, DepsSingleton>;
