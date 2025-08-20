import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { $ } from "bun";
import { afterAll, beforeAll, describe, expect, it } from "bun:test";

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
  MOCK_FILES.filter((x) => x.path.length > 1).map(({ path }) =>
    path.slice(0, -1),
  ),
);

describe("dir-tree CLI integration", () => {
  const testDir = join(process.cwd(), "test-dir-tree");
  const cliPath = join(process.cwd(), "dist", "cli");

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
  });

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
    const result = await $`node ${cliPath} dir-tree ${testDir}`;

    // Verify the command executed successfully
    expect(result.exitCode).toBe(0);

    // Verify the output matches expected structure
    expect(result.text()).toMatchInlineSnapshot(`
      "📁 /Users/alanrsoares/dev/nas-tools/test-dir-tree
      ├──  folder1
      └──  folder2
          └──  subfolder
      "
    `);
  });

  it("should show files when --show-files | -f is used", async () => {
    const result1 = await $`node ${cliPath} dir-tree ${testDir} --show-files`;

    // Verify the command executed successfully
    expect(result1.exitCode).toBe(0);

    // Verify the output contains files
    expect(result1.text()).toMatchInlineSnapshot(`
      "📁 /Users/alanrsoares/dev/nas-tools/test-dir-tree
      ├── 📄 file1.txt
      ├── 📄 file2.txt
      ├── 📁 folder1
      │   └── 📄 file3.txt
      └── 📁 folder2
          ├── 📄 file4.txt
          └── 📁 subfolder
              └── 📄 file5.txt
      "
    `);

    // -f is equivalent to --show-files
    const result2 = await $`node ${cliPath} dir-tree ${testDir} -f`;

    // Verify the output does not contain files
    expect(result2.text()).toBe(result1.text());
  });

  it("should show hidden files when --show-hidden is used", async () => {
    // Run the CLI command with show-hidden option
    const result = await $`node ${cliPath} dir-tree ${testDir} --show-hidden`;

    // Verify the command executed successfully
    expect(result.exitCode).toBe(0);

    // Verify the output contains hidden content
    expect(result.text()).toMatchInlineSnapshot(`
      "📁 /Users/alanrsoares/dev/nas-tools/test-dir-tree
      ├──  .hidden
      ├──  folder1
      └──  folder2
          └──  subfolder
      "
    `);
  });

  it("should respect max-depth option", async () => {
    // Run the CLI command with max-depth=1
    const result = await $`node ${cliPath} dir-tree ${testDir} --max-depth 1`;

    // Verify the command executed successfully
    expect(result.exitCode).toBe(0);

    // Verify the output respects max-depth
    expect(result.text()).toMatchInlineSnapshot(`
      "📁 /Users/alanrsoares/dev/nas-tools/test-dir-tree
      ├──  folder1
      └──  folder2
      "
    `);
  });

  it("should exclude files/directories with --exclude option", async () => {
    // Run the CLI command with exclude option
    const result =
      await $`node ${cliPath} dir-tree ${testDir} --exclude folder1 file1.txt`;

    // Verify the command executed successfully
    expect(result.exitCode).toBe(0);

    // Verify the output excludes specified patterns
    expect(result.text()).toMatchInlineSnapshot(`
      "📁 /Users/alanrsoares/dev/nas-tools/test-dir-tree
      └──  folder2
          └──  subfolder
      "
    `);
  });

  it("should handle current directory (.) as default", async () => {
    // Change to test directory and run dir-tree without path argument
    const result = await $`cd ${testDir} && node ${cliPath} dir-tree`;

    // Verify the command executed successfully
    expect(result.exitCode).toBe(0);

    // Verify the output contains expected content
    expect(result.text()).toMatchInlineSnapshot(`
      "📁 .
      ├──  folder1
      └──  folder2
          └──  subfolder
      "
    `);
  });

  it("should handle non-existent directory gracefully", async () => {
    const nonExistentPath = join(testDir, "non-existent-folder");
    await $`node ${cliPath} dir-tree ${nonExistentPath}`.catch((x) => {
      expect(x.exitCode).toBe(1);
      expect(x.stderr.toString()).toMatchInlineSnapshot(`
        "✗ Directory '/Users/alanrsoares/dev/nas-tools/test-dir-tree/non-existent-folder' does not exist or is not accessible
        ✗ Failed to generate tree: Error: Directory '/Users/alanrsoares/dev/nas-tools/test-dir-tree/non-existent-folder' does not exist or is not accessible
        "
      `);
    });
  });

  it("should handle permission errors gracefully", async () => {
    // Create a directory with restricted permissions (if possible)
    const restrictedDir = join(testDir, "restricted");
    await mkdir(restrictedDir);

    // On Unix systems, we can't easily test permission errors in a test environment
    // This test mainly ensures the CLI doesn't crash on directory access issues
    const result = await $`node ${cliPath} dir-tree ${restrictedDir}`;
    expect(result.exitCode).toBe(0);
  });
});
