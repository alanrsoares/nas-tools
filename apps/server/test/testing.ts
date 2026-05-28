import { createApi } from "../src/api.js";
import { createApp } from "../src/app.js";
import { closeDeps, createDeps } from "../src/deps.js";
import type { CreateDepsOptions, Deps } from "../src/types/deps.js";

/**
 * Test harness: isolated in-memory SQLite + fresh API app.
 * Call `teardown()` in afterEach / afterAll.
 */
export function createTestHarness(options?: CreateDepsOptions) {
  const deps = createDeps({ dbPath: ":memory:", ...options });
  const api = createApi(deps);
  const app = createApp(deps);

  return {
    deps,
    api,
    app,
    teardown: () => closeDeps(deps),
  };
}

export type TestHarness = ReturnType<typeof createTestHarness>;
export type { CreateDepsOptions, Deps };
