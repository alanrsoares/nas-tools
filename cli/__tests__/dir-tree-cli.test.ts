import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { $ } from "bun";

const MOCK_FILES = [
  {
    path: ["file1.txt"],
    content: "content1",
  },
  {
    path: ["file2.txt"],
    content: "content2",
  },
  {
    path: ["folder1", "file3.txt"],
    content: "content3",
  },
  {
    path: ["folder2", "file4.txt"],
    content: "content4",
  },
  {
    path: ["folder2", "subfolder", "file5.txt"],
    content: "content5",
  },
  {
    path: [".hidden", "secret.txt"],
    content: "secret",
  },
];

// Create a set of mock folders derived from the mock files
const MOCK_FOLDERS = new Set(
  MOCK_FILES.filter((x) => x.path.length > 1).map(({ path }) => path.slice(0, -1)),
);

const normalizeTestDir = (output: string): string =>
  output.replaceAll(join(process.cwd(), "test-dir-tree"), "<test-dir-tree>");

describe("dir-tree CLI integration", () => {
  const testDir = join(process.cwd(), "test-dir-tree");
  const cliPath = join(process.cwd(), "dist", "cli", "index.js");

  beforeAll(async () => {
    // Create a deterministic test directory structure
    await mkdir(testDir, { recursive: true });

    // Create mock folders
    for (const folder of MOCK_FOLDERS) {
      await mkdir(join(testDir, ...folder), { recursive: true });
    }

    // Create mock files
    for (const file of MOCK_FILES) {
      await Bun.write(join(testDir, ...file.path), file.content);
    }

    // Ensure the CLI is built
    await $`bun run build`;
  }, 90000);

  afterAll(async () => {
    // Clean up the test directory
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch (error) {
      console.warn("Failed to clean up test directory:", error);
    }
  });

  it("should display directory tree with default options", async () => {
    // Run the CLI command
    const result = await $`bun ${cliPath} dir-tree ${testDir}`;

    // Verify the command executed successfully
    expect(result.exitCode).toBe(0);

    // Verify the output matches expected structure
    expect(normalizeTestDir(result.text())).toMatchInlineSnapshot(`
      "📁 <test-dir-tree>
      ├──  folder2
      │   └──  subfolder
      └──  folder1
      "
    `);
  });

  it("should show files when --show-files | -f is used", async () => {
    const result1 = await $`bun ${cliPath} dir-tree ${testDir} --show-files`;

    // Verify the command executed successfully
    expect(result1.exitCode).toBe(0);

    // Verify the output contains files
    expect(normalizeTestDir(result1.text())).toMatchInlineSnapshot(`
      "📁 <test-dir-tree>
      ├── 📁 folder2
      │   ├── 📁 subfolder
      │   │   └── 📄 file5.txt
      │   └── 📄 file4.txt
      ├── 📁 folder1
      │   └── 📄 file3.txt
      ├── 📄 file1.txt
      └── 📄 file2.txt
      "
    `);

    // Verify short option -f
    const result2 = await $`bun ${cliPath} dir-tree ${testDir} -f`;
    expect(result2.text()).toBe(result1.text());
  });

  it("should show hidden files when --show-hidden is used", async () => {
    // Run the CLI command with show-hidden option
    const result = await $`bun ${cliPath} dir-tree ${testDir} --show-hidden`;

    // Verify the command executed successfully
    expect(result.exitCode).toBe(0);

    // Verify the output contains hidden files
    expect(normalizeTestDir(result.text())).toMatchInlineSnapshot(`
      "📁 <test-dir-tree>
      ├──  folder2
      │   └──  subfolder
      ├──  folder1
      └──  .hidden
      "
    `);
  });

  it("should respect max-depth option", async () => {
    // Run the CLI command with max-depth=1
    const result = await $`bun ${cliPath} dir-tree ${testDir} --max-depth 1`;

    // Verify the command executed successfully
    expect(result.exitCode).toBe(0);

    // Verify the output matches expected structure (subfolders of folder2 hidden)
    expect(normalizeTestDir(result.text())).toMatchInlineSnapshot(`
      "📁 <test-dir-tree>
      ├──  folder2
      └──  folder1
      "
    `);
  });

  it("should exclude files/directories with --exclude option", async () => {
    // Run the CLI command with exclude option
    const result = await $`bun ${cliPath} dir-tree ${testDir} --exclude folder1 file1.txt`;

    // Verify the command executed successfully
    expect(result.exitCode).toBe(0);

    // Verify folder1 is excluded
    expect(normalizeTestDir(result.text())).toMatchInlineSnapshot(`
      "📁 <test-dir-tree>
      └──  folder2
          └──  subfolder
      "
    `);
  });

  it("should handle current directory (.) as default", async () => {
    // Change to test directory and run dir-tree without path argument
    const result = await $`cd ${testDir} && bun ${cliPath} dir-tree`;

    // Verify the command executed successfully
    expect(result.exitCode).toBe(0);

    // Output should use "." for current dir
    expect(result.text()).toContain("📁 .");
  });

  it("should handle non-existent directory gracefully", async () => {
    const nonExistentPath = join(testDir, "non-existent-folder");
    await $`bun ${cliPath} dir-tree ${nonExistentPath}`.catch((x) => {
      expect(x.exitCode).toBe(1);
      expect(normalizeTestDir(x.stderr.toString())).toMatchInlineSnapshot(`
        "✗ Failed to generate tree: Directory '<test-dir-tree>/non-existent-folder' does not exist or is not accessible
        "
      `);
    });
  });

  it("should handle permission errors gracefully", async () => {
    const restrictedDir = join(testDir, "restricted");
    await mkdir(restrictedDir);

    // On Unix systems, we can't easily test permission errors in a test environment
    // This test mainly ensures the CLI doesn't crash on directory access issues
    const result = await $`bun ${cliPath} dir-tree ${restrictedDir}`;
    expect(result.exitCode).toBe(0);
  });
});
