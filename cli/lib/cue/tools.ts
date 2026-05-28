import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { delimiter, join } from "node:path";

import { safeAsync } from "../fp.js";
import { isRequiredTool, optionalTools, requiredTools } from "./names.js";
import type { ToolStatus } from "./types.js";

async function commandAvailable(name: string): Promise<boolean> {
  const bunRuntime = (globalThis as { Bun?: { which: (name: string) => string | null } }).Bun;
  const bunPath = bunRuntime?.which(name);
  if (bunPath) {
    return true;
  }

  const paths = process.env.PATH?.split(delimiter) ?? [];
  for (const path of paths) {
    const candidate = join(path, name);
    const canExecute = await safeAsync(
      () => access(candidate, constants.X_OK),
      `access ${candidate}`,
    )
      .map(() => true)
      .unwrapOr(false);
    if (canExecute) {
      return true;
    }
  }

  return false;
}

async function getToolStatus(name: string): Promise<ToolStatus> {
  return {
    name,
    available: await commandAvailable(name),
    required: isRequiredTool(name),
  };
}

export async function checkTools(): Promise<ToolStatus[]> {
  const tools = [...requiredTools, ...optionalTools];
  return await Promise.all(tools.map(getToolStatus));
}
