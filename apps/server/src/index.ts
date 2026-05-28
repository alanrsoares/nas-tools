import { type App as ApiApp, createApi } from "./api.js";
import { createApp } from "./app.js";
import type { Deps } from "./deps.js";
import { closeDeps, createDeps } from "./deps.js";
import { env } from "./env.js";

export type { CreateDepsOptions, Deps } from "./deps.js";
export type { ApiApp as App };
export { closeDeps, createApi, createApp, createDeps };

let deps: Deps | undefined;
let api: ApiApp | undefined;
let app: ReturnType<typeof createApp> | undefined;

export const getDeps = (): Deps => {
  deps ??= createDeps();
  return deps;
};

export const getApi = (): ApiApp => {
  api ??= createApi(getDeps());
  return api;
};

export const getApp = (): ReturnType<typeof createApp> => {
  app ??= createApp(getDeps());
  return app;
};

if (import.meta.main) {
  const activeDeps = getDeps();
  const activeApp = getApp();
  const host = env.HOST;
  const port = env.PORT;

  const shutdown = () => {
    closeDeps(activeDeps);
    process.exit(0);
  };

  process.on("uncaughtException", (error) => {
    console.error("[nas-tools] uncaughtException:", error);
    activeDeps.repos.jobs.markRunningInterrupted(error);
    shutdown();
  });

  process.on("unhandledRejection", (reason) => {
    console.error("[nas-tools] unhandledRejection:", reason);
    activeDeps.repos.jobs.markRunningInterrupted(reason);
    shutdown();
  });

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  activeApp.listen({ hostname: host, port });
  console.log(`NAS Tools server listening on http://${host}:${port}`);
}
