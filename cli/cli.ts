#!/usr/bin/env node
import { Command } from "commander";

import { dirTreeCommand } from "./commands/dir-tree.js";
import { downloadCommand } from "./commands/download.js";
import { fixUnsplitCueCommand } from "./commands/fix-unsplit-cue.js";
import { moveCompletedCommand } from "./commands/move-completed.js";

const program = new Command();

program
  .name("nas-tools")
  .description(
    "NAS tools CLI for managing music files, downloads, and file operations",
  )
  .version("1.0.0");

// Add commands
dirTreeCommand(program);
downloadCommand(program);
fixUnsplitCueCommand(program);
moveCompletedCommand(program);

// Parse command line arguments
program.parse();
