import type { Maybe } from "../lib/maybe.js";
import { getOrElse, none, some } from "../lib/maybe.js";
import { getStagingStatus } from "../lib/staging.js";
import { publicSubrouter } from "../lib/subrouter.js";
import { getTorrentDashboard } from "../transmission.js";
import type { Deps } from "../types/deps.js";

const settledValue = <T extends object>(result: PromiseSettledResult<T>): Maybe<T> =>
  result.status === "fulfilled" ? some(result.value) : none<T>();

export function dashboardModule(deps: Deps) {
  return publicSubrouter(deps).get("/dashboard", async ({ config }) => {
    const nasConfig = config.get();
    const [transmissionResult, stagingResult] = await Promise.allSettled([
      getTorrentDashboard(nasConfig.stagingDir),
      getStagingStatus(nasConfig.stagingDir),
    ]);
    return {
      ok: true,
      transmission: getOrElse(settledValue(transmissionResult), null),
      staging: getOrElse(settledValue(stagingResult), null),
    };
  });
}
