import { api } from "./api.js";
import { app } from "./app.js";
import { env } from "./env.js";
import { markRunningJobsCrashed } from "./lib/jobs.js";

export type { App } from "./api.js";
export { api, app };

const host = env.HOST;
const port = env.PORT;

if (import.meta.main) {
  process.on("uncaughtException", (error) => {
    console.error("[nas-tools] uncaughtException:", error);
    markRunningJobsCrashed(error);
    process.exit(1);
  });

  process.on("unhandledRejection", (reason) => {
    console.error("[nas-tools] unhandledRejection:", reason);
    markRunningJobsCrashed(reason);
    process.exit(1);
  });

  app.listen({ hostname: host, port });
  console.log(`NAS Tools server listening on http://${host}:${port}`);
}
