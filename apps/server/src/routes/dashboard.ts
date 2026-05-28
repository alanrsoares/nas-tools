import { Elysia } from "elysia";
import { getNasConfig } from "../lib/config-state.js";
import { getStagingStatus } from "../lib/staging.js";
import { getTorrentDashboard } from "../transmission.js";

export const dashboardRoutes = new Elysia().get("/dashboard", async () => {
  const config = getNasConfig();
  const [transmissionResult, stagingResult] = await Promise.allSettled([
    getTorrentDashboard(config.stagingDir),
    getStagingStatus(config.stagingDir),
  ]);
  return {
    ok: true,
    transmission: transmissionResult.status === "fulfilled" ? transmissionResult.value : null,
    staging: stagingResult.status === "fulfilled" ? stagingResult.value : null,
  };
});
