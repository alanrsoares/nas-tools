#!/usr/bin/env node
import { Command } from "commander";

const program = new Command();

program
  .name("nas-tools")
  .description(
    "NAS tools CLI for managing music files, downloads, and file operations",
  )
  .version("1.0.0");

const COMMANDS = [
  import("./commands/dir-tree.js"),
  import("./commands/download.js"),
  import("./commands/fix-unsplit-cue.js"),
  import("./commands/move-completed.js"),
];

// Add commands
for (const command of COMMANDS) {
  const commandModule = await command;
  commandModule.default(program);
}

// Parse command line arguments
program.parse();
