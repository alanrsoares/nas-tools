import { afterEach, describe, expect, it } from "bun:test";

import { createApi } from "../src/api.js";
import { closeDeps, createDeps } from "../src/deps.js";

describe("deps + modules", () => {
  let deps = createDeps({ dbPath: ":memory:" });

  afterEach(() => {
    closeDeps(deps);
    deps = createDeps({ dbPath: ":memory:" });
  });

  it("injects repos on context for typed handlers", async () => {
    const api = createApi(deps);
    const response = await api.handle(new Request("http://localhost/api/health"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("lists jobs via repos from context", async () => {
    const api = createApi(deps);
    const response = await api.handle(new Request("http://localhost/api/jobs"));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean; jobs: unknown[] };
    expect(body.ok).toBe(true);
    expect(body.jobs).toEqual([]);
  });
});
