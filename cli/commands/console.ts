import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Command } from "commander";
import { env } from "../../apps/server/src/env.js";

export default function consoleCommand(program: Command) {
  program
    .command("console")
    .alias("cockpit")
    .description("Start the NAS Tools web dashboard (Console)")
    .option("-p, --port <number>", "Port to listen on", String(env.PORT))
    .option("-h, --host <string>", "Host to listen on", env.HOST)
    .action(async (options) => {
      const port = Number(options.port);
      const host = options.host;

      // Bun sets SO_REUSEPORT on Linux, so a second instance binds the same
      // port silently instead of failing — probe first and refuse to stack.
      const running = await fetch(`http://127.0.0.1:${port}/api/health`, {
        signal: AbortSignal.timeout(1500),
      }).catch(() => null);
      if (running?.ok) {
        console.error(`NAS Tools Console already running on port ${port} — refusing to start.`);
        process.exit(1);
      }

      const distPath = join(import.meta.dirname, "../../apps/web/dist");
      if (!existsSync(distPath)) {
        console.warn(`Warning: Frontend dist folder not found at ${distPath}`);
        console.warn("Run 'bun run build' to compile the frontend.");
      }

      const { createApp, createDeps, createMpdPlayer } = await import(
        "../../apps/server/src/index.js"
      );
      const { isErr } = await import("@onrails/result");

      const playerResult = await createMpdPlayer({
        host: "127.0.0.1",
        port: 6600,
        musicDir: env.MUSIC_LIBRARY_PATH,
        device: env.ALSA_DEVICE,
      });

      if (isErr(playerResult)) {
        console.warn(
          "Warning: Failed to connect to MPD — is mpd running? Player will be unavailable.",
        );
      }

      const activeDeps = createDeps(isErr(playerResult) ? {} : { player: playerResult.value });

      createApp(activeDeps).listen({ hostname: host, port });
      console.log(`NAS Tools Console listening on http://${host}:${port}`);
    });
}
