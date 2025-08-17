#!/usr/bin/env node
import { readdir } from "node:fs/promises";
import { extname, join } from "node:path";
import { Command } from "commander";

import pkg from "../package.json" with { type: "json" };

const program = new Command();

program
  .name("nas-tools")
  .description(
    "NAS tools CLI for managing music files, downloads, and file operations",
  )
  .version(pkg.version);

// automatically discover commands under ./commands using bun
async function discoverCommands(program: Command) {
  const commandsDir = join(import.meta.dirname, "commands");
  const files = await readdir(commandsDir);
  const commandFiles = files.filter((file) => {
    const ext = extname(file);
    return (
      (ext === ".js" || ext === ".ts") &&
      !file.includes(".test.") &&
      !file.includes(".spec.")
    );
  });
  for (const file of commandFiles) {
    const module = await import(join(commandsDir, file));
    module.default(program);
  }
}

await discoverCommands(program);

// Parse command line arguments
await program.parseAsync();
