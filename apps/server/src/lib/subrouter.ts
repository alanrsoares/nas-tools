import { Elysia } from "elysia";

import { depsPlugin } from "../plugins/deps.js";
import type { Deps } from "../types/deps.js";

/**
 * Subrouter with deps on the same Elysia chain so handlers get full context inference
 * (`config`, `repos`, `execution`). Use for all API modules (see safeurl `publicSubrouter`).
 */
export function publicSubrouter(deps: Deps) {
  return new Elysia().use(depsPlugin(deps));
}
