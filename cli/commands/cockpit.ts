import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Command } from "commander";
import { env } from "../../apps/server/src/env.js";

export default function cockpitCommand(program: Command) {
  program
    .command("cockpit")
    .description("Start the NAS Tools web dashboard (Cockpit)")
    .option("-p, --port <number>", "Port to listen on", String(env.PORT))
    .option("-h, --host <string>", "Host to listen on", env.HOST)
    .action(async (options) => {
      const port = Number(options.port);
      const host = options.host;

      const distPath = join(import.meta.dirname, "../../apps/web/dist");
      if (!existsSync(distPath)) {
        console.warn(`Warning: Frontend dist folder not found at ${distPath}`);
        console.warn("Run 'bun run build' to compile the frontend.");
      }

      const { getApp } = await import("../../apps/server/src/index.js");
      getApp().listen({ hostname: host, port });
      console.log(`NAS Tools Cockpit listening on http://${host}:${port}`);
    });
}
