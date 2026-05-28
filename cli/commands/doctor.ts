import { access, stat } from "node:fs/promises";
import { ResultAsync } from "@onrails/result";
import type { Command } from "commander";
import { z } from "zod";

import { type fail, formatError, runParsedCommand } from "../lib/fp.js";
import { type Finding, NAS_PATHS, pathExists, printReport } from "../lib/report.js";
import { logError } from "../lib/utils.js";

const optionsSchema = z.object({
  json: z.boolean().optional().default(false),
});

type CommandOptions = z.infer<typeof optionsSchema>;

interface DoctorReport {
  title: string;
  checks: Array<{ name: string; ok: boolean; detail: string }>;
  findings: Finding[];
}

const tools = [
  "/opt/bin/opkg",
  "/opt/bin/flac",
  "/opt/bin/cuebreakpoints",
  "/opt/bin/shnsplit",
  "/opt/bin/metaflac",
  "/usr/local/bin/docker",
] as const;

async function canAccess(path: string): Promise<boolean> {
  return await ResultAsync.fromPromise(access(path), () => undefined)
    .map(() => true)
    .unwrapOr(false);
}

async function runDoctorChecks(options: CommandOptions): Promise<void> {
  const checks: DoctorReport["checks"] = [];
  const findings: Finding[] = [];

  for (const [name, path] of Object.entries(NAS_PATHS)) {
    const ok = await pathExists(path);
    checks.push({ name, ok, detail: path });
    if (!ok && ["download", "flac", "public"].includes(name)) {
      findings.push({
        severity: "warn",
        message: `Expected NAS path missing: ${name}`,
        path,
      });
    }
  }

  for (const tool of tools) {
    const ok = await canAccess(tool);
    checks.push({
      name: `tool:${tool.split("/").pop()}`,
      ok,
      detail: tool,
    });
    if (!ok && tool !== "/usr/local/bin/docker") {
      findings.push({
        severity: "warn",
        message: `Expected Entware/media tool missing: ${tool}`,
        path: tool,
      });
    }
  }

  const dockerSocket = "/var/run/docker.sock";
  const socketStat = await ResultAsync.fromPromise(stat(dockerSocket), () => undefined).unwrapOr(
    undefined,
  );
  checks.push({
    name: "docker-socket",
    ok: Boolean(socketStat),
    detail: dockerSocket,
  });
  if (socketStat && !(await canAccess(dockerSocket))) {
    findings.push({
      severity: "info",
      message: "Docker socket exists but current user may lack daemon access.",
      path: dockerSocket,
    });
  }

  printReport({ title: "NAS doctor", checks, findings }, options.json);
}

function run(options: CommandOptions): ResultAsync<void, ReturnType<typeof fail>> {
  return ResultAsync.fromSafePromise(runDoctorChecks(options));
}

export default function doctorCommand(program: Command): void {
  program
    .command("doctor")
    .description("Report ADM NAS paths, Entware tools, and app prerequisites")
    .option("--json", "Print JSON report", false)
    .action(async (options: Record<string, unknown>) => {
      await runParsedCommand(optionsSchema, options, "Invalid doctor options", run, (error) => {
        logError(`Doctor failed: ${formatError(error)}`);
        process.exit(1);
      });
    });
}
