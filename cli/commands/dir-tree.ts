import * as path from "path";
import { Command } from "commander";
import { z } from "zod";

import {
  logError,
  readDirectoryWithTypes,
  validateDirectory,
} from "../utils.js";

const optionsSchema = z.object({
  maxDepth: z
    .string()
    .transform((val) => (val === "Infinity" ? Infinity : parseInt(val))),
  showHidden: z.boolean().optional(),
  showFiles: z.boolean().optional().default(false),
  exclude: z.array(z.string()).optional(),
});

type TreeOptions = z.infer<typeof optionsSchema>;

// Tree characters for display
const TREE_CHARS = {
  BRANCH: "├── ",
  LAST_BRANCH: "└── ",
  VERTICAL: "│   ",
  SPACE: "    ",
} as const;

// Recursively build the tree structure
async function buildTree(
  dirPath: string,
  prefix: string = "",
  depth: number = 0,
  options: TreeOptions = {
    maxDepth: Infinity,
    showHidden: false,
    showFiles: true,
    exclude: [],
  },
): Promise<string[]> {
  const {
    maxDepth = Infinity,
    showHidden = false,
    showFiles = true,
    exclude = [],
  } = options;

  if (depth >= maxDepth) {
    return [];
  }

  try {
    const entries = await readDirectoryWithTypes(dirPath);

    // Filter entries based on options
    const filteredEntries = entries.filter((entry) => {
      // Skip hidden files/folders unless showHidden is true
      if (!showHidden && entry.name.startsWith(".")) {
        return false;
      }

      // Skip excluded patterns
      if (exclude.some((pattern) => entry.name.includes(pattern))) {
        return false;
      }

      // Skip files if showFiles is false
      if (!showFiles && !entry.isDirectory()) {
        return false;
      }

      return true;
    });

    const lines: string[] = [];

    for (let i = 0; i < filteredEntries.length; i++) {
      const entry = filteredEntries[i]!;
      const isLast = i === filteredEntries.length - 1;
      const isDirectory = entry.isDirectory();

      // Determine the prefix for this entry
      const currentPrefix = isLast ? TREE_CHARS.LAST_BRANCH : TREE_CHARS.BRANCH;
      const nextPrefix = isLast ? TREE_CHARS.SPACE : TREE_CHARS.VERTICAL;

      // Add the current entry
      const icon = options.showFiles ? (isDirectory ? "📁" : "📄") : "";
      lines.push(`${prefix}${currentPrefix}${icon} ${entry.name}`);

      // Recursively add children for directories
      if (isDirectory) {
        const childPath = path.join(dirPath, entry.name);
        const childLines = await buildTree(
          childPath,
          prefix + nextPrefix,
          depth + 1,
          options,
        );
        lines.push(...childLines);
      }
    }

    return lines;
  } catch (error) {
    logError(`Error reading directory ${dirPath}: ${error}`);
    return [];
  }
}

// Main function to generate and display the tree
async function run(dirPath: string, options: TreeOptions): Promise<void> {
  // Validate the directory exists
  const isValid = await validateDirectory(dirPath);
  if (!isValid) {
    throw new Error(
      `Directory '${dirPath}' does not exist or is not accessible`,
    );
  }

  console.log(`📁 ${dirPath}`);
  const treeLines = await buildTree(dirPath, "", 0, options);

  if (treeLines.length === 0) {
    console.log("   (empty directory)");
  } else {
    treeLines.forEach((line) => console.log(line));
  }
}

export function dirTreeCommand(program: Command): void {
  program
    .command("dir-tree")
    .description("Generate a tree view of a directory structure")
    .argument("[path]", "Directory path to display", ".")
    .option("-d, --max-depth <number>", "Maximum depth to traverse", "Infinity")
    .option("-H, --show-hidden", "Show hidden files and directories")
    .option("-f, --show-files", "Show files (default: false)")
    .option(
      "-e, --exclude <patterns...>",
      "Exclude files/directories matching patterns",
    )
    .action(async (path: string, options: Record<string, unknown>) => {
      try {
        await run(path, optionsSchema.parse(options));
      } catch (error) {
        logError(`Failed to generate tree: ${error}`);
        process.exit(1);
      }
    });
}
