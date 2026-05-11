import * as path from "node:path";
import { Command } from "commander";
import { err, ok, ResultAsync } from "neverthrow";
import pc from "picocolors";
import { match } from "ts-pattern";
import { z } from "zod";

import { fail, formatError, parseWith, safeAsync } from "../lib/fp.js";
import { exists, logError, readDirectoryWithTypes } from "../lib/utils.js";

const optionsSchema = z.object({
  maxDepth: z.string().transform((val, ctx) => {
    if (val === "Infinity") {
      return Infinity;
    }

    const parsed = Number.parseInt(val, 10);
    if (Number.isNaN(parsed) || parsed < 0) {
      ctx.addIssue({
        code: "custom",
        message: "maxDepth must be Infinity or a non-negative integer",
      });
      return z.NEVER;
    }

    return parsed;
  }),
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
  directory: pc.blue,
  file: pc.white,
  hidden: pc.gray,
  executable: pc.green,
  symlink: pc.cyan,
  special: pc.magenta,
  archive: pc.red,
  image: pc.yellow,
  video: pc.magenta,
  audio: pc.cyan,
} as const;

type FileCategory = keyof typeof colors;

const hasExtension = (name: string, extensions: string[]): boolean =>
  extensions.some((ext) => name.toLowerCase().endsWith(ext));

type ColoredCategory = Exclude<
  FileCategory,
  "hidden" | "file" | "directory" | "symlink"
>;

const extensionsByCategory = {
  archive: [".zip", ".tar", ".gz", ".bz2", ".xz", ".rar", ".7z", ".tgz"],
  audio: [".mp3", ".flac", ".wav", ".aac", ".ogg", ".m4a", ".wma"],
  executable: [".exe", ".sh", ".bat", ".cmd", ".com", ".app"],
  image: [".jpg", ".jpeg", ".png", ".gif", ".bmp"],
  special: [
    ".json",
    ".xml",
    ".yaml",
    ".yml",
    ".toml",
    ".ini",
    ".conf",
    ".config",
  ],
  video: [".mp4", ".avi", ".mkv", ".mov", ".wmv", ".flv", ".webm", ".m4v"],
} as const satisfies Record<ColoredCategory, string[]>;

type ExtensionCategory = keyof typeof extensionsByCategory;

const extensionTypes = Object.keys(extensionsByCategory) as ExtensionCategory[];

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

  return match({ entry, isHidden })
    .with({ isHidden: true }, () => colors.hidden(name))
    .when(
      ({ entry }) => entry.isDirectory(),
      () => colors.directory(name),
    )
    .when(
      ({ entry }) => Boolean(entry.isSymbolicLink?.()),
      () => colors.symlink(name),
    )
    .otherwise(() => {
      const category = extensionTypes.find((type) =>
        hasExtension(name, extensionsByCategory[type]),
      );

      return category ? colors[category](name) : colors.file(name);
    });
}

// Recursively build the tree structure
function buildTree(
  dirPath: string,
  prefix: string = "",
  depth: number = 0,
  options: CommandOptions,
): ResultAsync<string[], ReturnType<typeof fail>> {
  const {
    maxDepth = Infinity,
    showHidden = false,
    showFiles = true,
    exclude = [],
  } = options;

  if (depth >= maxDepth) {
    return ResultAsync.fromSafePromise(Promise.resolve([] as string[]));
  }

  return safeAsync(
    () => readDirectoryWithTypes(dirPath),
    `Error reading directory ${dirPath}`,
  ).andThen((entries) => {
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

    return ResultAsync.fromSafePromise(
      filteredEntries.reduce(async (linesPromise, entry, index) => {
        const lines = await linesPromise;
        const isLast = index === filteredEntries.length - 1;
        const isDirectory = entry.isDirectory();

        const currentPrefix = isLast
          ? TREE_CHARS.LAST_BRANCH
          : TREE_CHARS.BRANCH;
        const nextPrefix = isLast ? TREE_CHARS.SPACE : TREE_CHARS.VERTICAL;

        const icon = options.showFiles ? (isDirectory ? "📁" : "📄") : "";
        const isHidden = entry.name.startsWith(".");
        const coloredName = getFileColor(entry, isHidden);
        lines.push(`${prefix}${currentPrefix}${icon} ${coloredName}`);

        if (!isDirectory) {
          return lines;
        }

        const childPath = path.join(dirPath, entry.name);
        const childLines = await buildTree(
          childPath,
          prefix + nextPrefix,
          depth + 1,
          options,
        ).unwrapOr([]);

        lines.push(...childLines);
        return lines;
      }, Promise.resolve(lines)),
    );
  });
}

// Main function to generate and display the tree
function run(
  dirPath: string,
  options: CommandOptions,
): ResultAsync<void, ReturnType<typeof fail>> {
  return safeAsync(() => exists(dirPath), `Failed to access ${dirPath}`)
    .andThen((isValid) =>
      isValid
        ? ok<void, ReturnType<typeof fail>>(undefined)
        : ok<void, ReturnType<typeof fail>>(undefined).andThen(() =>
            err(
              fail(
                `Directory '${dirPath}' does not exist or is not accessible`,
              ),
            ),
          ),
    )
    .andThen(() => buildTree(dirPath, "", 0, options))
    .map((treeLines) => {
      console.log(`📁 ${pc.blue(dirPath)}`);

      if (treeLines.length === 0) {
        console.log("   (empty directory)");
      } else {
        treeLines.forEach((line) => console.log(line));
      }
    });
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
      const result = await parseWith(
        optionsSchema,
        options,
        "Invalid dir-tree options",
      ).asyncAndThen((parsedOptions) => run(path, parsedOptions));

      result.match(
        () => undefined,
        (error) => {
          logError(`Failed to generate tree: ${formatError(error)}`);
          process.exit(1);
        },
      );
    });
}
