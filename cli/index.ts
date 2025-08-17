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

const VALID_EXTENSIONS = [".js", ".ts"];
const EXCLUDED_PATTERNS = /(\.test\.|\.spec\.)(js|ts)$/;

interface CommandModule {
  default: (program: Command) => void;
}

// automatically discover commands under ./commands using bun
async function discoverCommands(program: Command) {
  const commandsDir = join(import.meta.dirname, "commands");
  const files = await readdir(commandsDir);
  const commandFiles = files.filter(
    (f) => VALID_EXTENSIONS.includes(extname(f)) && !EXCLUDED_PATTERNS.test(f),
  );
  for (const file of commandFiles) {
    const module: CommandModule = await import(join(commandsDir, file));
    module.default(program);
  }
}

await discoverCommands(program);

// Parse command line arguments
await program.parseAsync();
