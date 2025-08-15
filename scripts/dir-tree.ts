import { Command } from "commander";
import * as path from "path";
import {
  readDirectoryWithTypes,
  logError,
  validateDirectory,
} from "./utils.js";

interface TreeOptions {
  maxDepth?: number;
  showHidden?: boolean;
  showFiles?: boolean;
  exclude?: string[];
}

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
  options: TreeOptions = {}
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
          options
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
async function generateTree(
  targetPath: string,
  options: TreeOptions = {}
): Promise<void> {
  // Validate the target path
  if (!(await validateDirectory(targetPath))) {
    process.exit(1);
  }

  // Resolve the absolute path
  const absolutePath = path.resolve(targetPath);

  // Display the root path
  console.log(`${absolutePath}/`);

  // Generate and display the tree
  const treeLines = await buildTree(absolutePath, "", 0, options);

  if (treeLines.length === 0) {
    console.log("(empty directory)");
  } else {
    console.log(treeLines.join("\n"));
  }
}

async function run(targetPath: string, options: TreeOptions) {
  try {
    await generateTree(targetPath, options);
  } catch (error) {
    logError(`Failed to generate directory tree: ${error}`);
    process.exit(1);
  }
}

const program = new Command("dir-tree")
  .description("Prints a tree of the directory structure")
  .argument(
    "[path]",
    "Directory path to display (default: current directory)",
    "."
  )
  .option("-d, --max-depth <number>", "Maximum depth to traverse", "10")
  .option("-a, --all", "Show hidden files and directories")
  .option("-f, --files", "Show files (default: false)", false)
  .option("-D, --directories-only", "Show only directories")
  .option("-e, --exclude <patterns>", "Exclude patterns (comma-separated)")
  .action(async (targetPath: string, options: Record<string, unknown>) => {
    await run(targetPath, {
      maxDepth: parseInt(String(options.maxDepth ?? "10")),
      showHidden: Boolean(options.all),
      showFiles: !Boolean(options.directoriesOnly),
      exclude: options.exclude
        ? String(options.exclude)
            .split(",")
            .map((s) => s.trim())
        : [],
    });
  });

await program.parseAsync(process.argv);
