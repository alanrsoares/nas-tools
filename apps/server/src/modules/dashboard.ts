import { getStagingStatus } from "../lib/staging.js";
import { publicSubrouter } from "../lib/subrouter.js";
import { getTorrentDashboard } from "../transmission.js";
import type { Deps } from "../types/deps.js";

export function dashboardModule(deps: Deps) {
  return publicSubrouter(deps).get("/dashboard", async ({ config }) => {
    const nasConfig = config.get();
    const [transmissionResult, stagingResult] = await Promise.allSettled([
      getTorrentDashboard(nasConfig.stagingDir),
      getStagingStatus(nasConfig.stagingDir),
    ]);
    return {
      ok: true,
      transmission: transmissionResult.status === "fulfilled" ? transmissionResult.value : null,
      staging: stagingResult.status === "fulfilled" ? stagingResult.value : null,
    };
  });
}
