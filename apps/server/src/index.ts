import { type App as ApiApp, createApi } from "./api.js";
import { createApp } from "./app.js";
import { closeDeps, createDeps } from "./deps.js";
import { env } from "./env.js";
import { isErr } from "@onrails/result";
import { logger } from "./logger.js";
import { createMpdPlayer } from "./player/index.js";

export type { CreateDepsOptions, Deps } from "./deps.js";
export type { ApiApp as App };
export { closeDeps, createApi, createApp, createDeps };

if (import.meta.main) {
  const playerResult = await createMpdPlayer({
    host: "127.0.0.1",
    port: 6600,
    musicDir: env.MUSIC_LIBRARY_PATH,
    device: env.ALSA_DEVICE,
  });

  if (isErr(playerResult)) {
    logger.fatal({ err: playerResult.error }, "Failed to connect to MPD — is mpd running?");
    process.exit(1);
  }

  const activeDeps = createDeps({ player: playerResult.value });
  const activeApp = createApp(activeDeps);
  const host = env.HOST;
  const port = env.PORT;

  const shutdown = () => {
    closeDeps(activeDeps);
    process.exit(0);
  };

  process.on("uncaughtException", (error) => {
    logger.fatal({ err: error }, "uncaughtException");
    activeDeps.repos.jobs.markRunningInterrupted(error);
    shutdown();
  });

  process.on("unhandledRejection", (reason) => {
    logger.fatal({ reason }, "unhandledRejection");
    activeDeps.repos.jobs.markRunningInterrupted(reason);
    shutdown();
  });

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  activeApp.listen({ hostname: host, port });
  logger.info({ host, port }, "NAS Tools server listening");
}
