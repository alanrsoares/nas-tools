import * as path from "node:path";
import { Command } from "commander";
import pc from "picocolors";
import { z } from "zod";

import {
  logError,
  readDirectoryWithTypes,
  validateDirectory,
} from "../lib/utils.js";

const optionsSchema = z.object({
  maxDepth: z
    .string()
    .transform((val) => (val === "Infinity" ? Infinity : parseInt(val))),
  showHidden: z.boolean().optional().default(false),
  showFiles: z.boolean().optional().default(false),
  exclude: z.array(z.string()).optional().default([]),
});

type CommandOptions = z.infer<typeof optionsSchema>;

// Tree characters for display
const TREE_CHARS = {
  BRANCH: "├── ",
  LAST_BRANCH: "└── ",
  VERTICAL: "│   ",
  SPACE: "    ",
} as const;

// Color functions for different file types
const colors = {
  directory: (name: string) => pc.blue(name),
  file: (name: string) => name,
  hidden: (name: string) => pc.gray(name),
  executable: (name: string) => pc.green(name),
  symlink: (name: string) => pc.cyan(name),
  special: (name: string) => pc.magenta(name),
  archive: (name: string) => pc.red(name),
  image: (name: string) => pc.yellow(name),
  video: (name: string) => pc.magenta(name),
  audio: (name: string) => pc.cyan(name),
} as const;

// Helper function to determine file color
function getFileColor(
  entry: {
    name: string;
    isDirectory: () => boolean;
    isSymbolicLink?: () => boolean;
    isFile?: () => boolean;
  },
  isHidden: boolean,
): string {
  const name = entry.name;

  if (isHidden) {
    return colors.hidden(name);
  }

  if (entry.isDirectory()) {
    return colors.directory(name);
  }

  // Check if it's a symlink (if the API supports it)
  if (entry.isSymbolicLink && entry.isSymbolicLink()) {
    return colors.symlink(name);
  }

  // Check if it's executable (common executable extensions)
  const executableExtensions = [".exe", ".sh", ".bat", ".cmd", ".com", ".app"];
  const isExecutable = executableExtensions.some((ext) =>
    name.toLowerCase().endsWith(ext),
  );

  if (isExecutable) {
    return colors.executable(name);
  }

  // Check for archive files
  const archiveExtensions = [
    ".zip",
    ".tar",
    ".gz",
    ".bz2",
    ".xz",
    ".rar",
    ".7z",
    ".tgz",
  ];
  const isArchive = archiveExtensions.some((ext) =>
    name.toLowerCase().endsWith(ext),
  );

  if (isArchive) {
    return colors.archive(name);
  }

  // Check for image files
  const imageExtensions = [
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".bmp",
    ".svg",
    ".webp",
    ".ico",
  ];
  const isImage = imageExtensions.some((ext) =>
    name.toLowerCase().endsWith(ext),
  );

  if (isImage) {
    return colors.image(name);
  }

  // Check for video files
  const videoExtensions = [
    ".mp4",
    ".avi",
    ".mkv",
    ".mov",
    ".wmv",
    ".flv",
    ".webm",
    ".m4v",
  ];
  const isVideo = videoExtensions.some((ext) =>
    name.toLowerCase().endsWith(ext),
  );

  if (isVideo) {
    return colors.video(name);
  }

  // Check for audio files
  const audioExtensions = [
    ".mp3",
    ".flac",
    ".wav",
    ".aac",
    ".ogg",
    ".m4a",
    ".wma",
  ];
  const isAudio = audioExtensions.some((ext) =>
    name.toLowerCase().endsWith(ext),
  );

  if (isAudio) {
    return colors.audio(name);
  }

  // Check for special files (config files, etc.)
  const specialExtensions = [
    ".json",
    ".xml",
    ".yaml",
    ".yml",
    ".toml",
    ".ini",
    ".conf",
    ".config",
  ];
  const isSpecial = specialExtensions.some((ext) =>
    name.toLowerCase().endsWith(ext),
  );

  if (isSpecial) {
    return colors.special(name);
  }

  return colors.file(name);
}

// Recursively build the tree structure
async function buildTree(
  dirPath: string,
  prefix: string = "",
  depth: number = 0,
  options: CommandOptions,
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

      // Add the current entry with colors
      const icon = options.showFiles ? (isDirectory ? "📁" : "📄") : "";
      const isHidden = entry.name.startsWith(".");
      const coloredName = getFileColor(entry, isHidden);
      lines.push(`${prefix}${currentPrefix}${icon} ${coloredName}`);

      if (!isDirectory) {
        continue;
      }

      // Recursively add children for directories
      const childPath = path.join(dirPath, entry.name);
      const childLines = await buildTree(
        childPath,
        prefix + nextPrefix,
        depth + 1,
        options,
      );

      lines.push(...childLines);
    }

    return lines;
  } catch (error) {
    logError(`Error reading directory ${dirPath}: ${error}`);
    return [];
  }
}

// Main function to generate and display the tree
async function run(dirPath: string, options: CommandOptions): Promise<void> {
  // Validate the directory exists
  const isValid = await validateDirectory(dirPath);
  if (!isValid) {
    throw new Error(
      `Directory '${dirPath}' does not exist or is not accessible`,
    );
  }

  console.log(`📁 ${pc.blue(dirPath)}`);
  const treeLines = await buildTree(dirPath, "", 0, options);

  if (treeLines.length === 0) {
    console.log("   (empty directory)");
  } else {
    treeLines.forEach((line) => console.log(line));
  }
}

export default function dirTreeCommand(program: Command): void {
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
