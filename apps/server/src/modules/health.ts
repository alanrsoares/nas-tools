import { publicSubrouter } from "../lib/subrouter.js";
import type { Deps } from "../types/deps.js";

export function healthModule(deps: Deps) {
  return publicSubrouter(deps).get("/health", () => ({ ok: true }));
}
