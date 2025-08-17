#!/usr/bin/env node
import { Command } from "commander";

import pkg from "../package.json" with { type: "json" };

const program = new Command();

program
  .name("nas-tools")
  .description(
    "NAS tools CLI for managing music files, downloads, and file operations",
  )
  .version(pkg.version);

const COMMAND_MODULES = [
  import("./commands/dir-tree.js"),
  import("./commands/download.js"),
  import("./commands/fix-unsplit-cue.js"),
  import("./commands/move-completed.js"),
];

await Promise.all(
  COMMAND_MODULES.map((m) => m.then((m) => m.default(program))),
);

// Parse command line arguments
await program.parseAsync();
