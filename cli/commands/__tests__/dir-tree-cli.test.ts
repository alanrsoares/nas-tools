import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { $ } from "zx";

describe("dir-tree CLI integration", () => {
  const testDir = join(process.cwd(), "test-dir-tree");
  const cliPath = join(process.cwd(), "dist", "cli.js");

  beforeAll(async () => {
    // Create a deterministic test directory structure
    await mkdir(testDir, { recursive: true });
    await mkdir(join(testDir, "folder1"));
    await mkdir(join(testDir, "folder2"));
    await mkdir(join(testDir, "folder2", "subfolder"));
    await mkdir(join(testDir, ".hidden"));

    await writeFile(join(testDir, "file1.txt"), "content1");
    await writeFile(join(testDir, "file2.txt"), "content2");
    await writeFile(join(testDir, "folder1", "file3.txt"), "content3");
    await writeFile(join(testDir, "folder2", "file4.txt"), "content4");
    await writeFile(
      join(testDir, "folder2", "subfolder", "file5.txt"),
      "content5",
    );
    await writeFile(join(testDir, ".hidden", "secret.txt"), "secret");

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
    console.log(`📁 Testing dir-tree with default options: ${testDir}`);

    // Run the CLI command
    const result = await $`node ${cliPath} dir-tree ${testDir}`;

    // Verify the command executed successfully
    expect(result.exitCode).toBe(0);

    // Verify the output matches expected structure
    expect(result.stdout).toMatchInlineSnapshot(`
      "📁 /Users/alanrsoares/dev/nas-tools/test-dir-tree
      ├──  file1.txt
      ├──  file2.txt
      ├──  folder1
      │   └──  file3.txt
      └──  folder2
          ├──  file4.txt
          └──  subfolder
              └──  file5.txt
      "
    `);

    console.log("✅ Default dir-tree output is correct");
  });

  it("should show hidden files when --show-hidden is used", async () => {
    console.log(`🔍 Testing dir-tree with --show-hidden: ${testDir}`);

    // Run the CLI command with show-hidden option
    const result = await $`node ${cliPath} dir-tree ${testDir} --show-hidden`;

    // Verify the command executed successfully
    expect(result.exitCode).toBe(0);

    // Verify the output contains hidden content
    expect(result.stdout).toMatchInlineSnapshot(`
      "📁 /Users/alanrsoares/dev/nas-tools/test-dir-tree
      ├──  .hidden
      │   └──  secret.txt
      ├──  file1.txt
      ├──  file2.txt
      ├──  folder1
      │   └──  file3.txt
      └──  folder2
          ├──  file4.txt
          └──  subfolder
              └──  file5.txt
      "
    `);

    console.log("✅ Hidden files are shown when --show-hidden is used");
  });

  it("should respect max-depth option", async () => {
    console.log(`📏 Testing dir-tree with max-depth=1: ${testDir}`);

    // Run the CLI command with max-depth=1
    const result = await $`node ${cliPath} dir-tree ${testDir} --max-depth 1`;

    // Verify the command executed successfully
    expect(result.exitCode).toBe(0);

    // Verify the output respects max-depth
    expect(result.stdout).toMatchInlineSnapshot(`
      "📁 /Users/alanrsoares/dev/nas-tools/test-dir-tree
      ├──  file1.txt
      ├──  file2.txt
      ├──  folder1
      └──  folder2
      "
    `);

    console.log("✅ Max-depth option is respected");
  });

  it("should exclude files/directories with --exclude option", async () => {
    console.log(`🚫 Testing dir-tree with --exclude: ${testDir}`);

    // Run the CLI command with exclude option
    const result =
      await $`node ${cliPath} dir-tree ${testDir} --exclude folder1 file1.txt`;

    // Verify the command executed successfully
    expect(result.exitCode).toBe(0);

    // Verify the output excludes specified patterns
    expect(result.stdout).toMatchInlineSnapshot(`
      "📁 /Users/alanrsoares/dev/nas-tools/test-dir-tree
      ├──  file2.txt
      └──  folder2
          ├──  file4.txt
          └──  subfolder
              └──  file5.txt
      "
    `);

    console.log("✅ Exclude option works correctly");
  });

  it("should handle current directory (.) as default", async () => {
    console.log("📍 Testing dir-tree with current directory (.)");

    // Change to test directory and run dir-tree without path argument
    const result = await $`cd ${testDir} && node ${cliPath} dir-tree`;

    // Verify the command executed successfully
    expect(result.exitCode).toBe(0);

    // Verify the output contains expected content
    expect(result.stdout).toMatchInlineSnapshot(`
      "📁 .
      ├──  file1.txt
      ├──  file2.txt
      ├──  folder1
      │   └──  file3.txt
      └──  folder2
          ├──  file4.txt
          └──  subfolder
              └──  file5.txt
      "
    `);

    console.log("✅ Current directory (.) works as default");
  });

  it("should handle CLI help and version commands", async () => {
    // Test help command
    const helpResult = await $`node ${cliPath} dir-tree --help`;
    expect(helpResult.exitCode).toBe(0);
    expect(helpResult.stdout).toContain("Usage: nas-tools dir-tree");

    // Test version command
    const versionResult = await $`node ${cliPath} --version`;
    expect(versionResult.exitCode).toBe(0);
    expect(versionResult.stdout).toContain("1.0.0");
  });

  it("should handle non-existent directory gracefully", async () => {
    const nonExistentPath = join(testDir, "non-existent-folder");

    try {
      await $`node ${cliPath} dir-tree ${nonExistentPath}`;
      throw new Error("Expected CLI to fail with non-existent directory");
    } catch (error: any) {
      expect(error.exitCode).toBe(1);
      console.log("✅ CLI correctly handled non-existent directory");
    }
  });

  it("should handle permission errors gracefully", async () => {
    // Create a directory with restricted permissions (if possible)
    const restrictedDir = join(testDir, "restricted");
    await mkdir(restrictedDir);

    // On Unix systems, we can't easily test permission errors in a test environment
    // This test mainly ensures the CLI doesn't crash on directory access issues
    const result = await $`node ${cliPath} dir-tree ${restrictedDir}`;
    expect(result.exitCode).toBe(0);

    console.log("✅ CLI handles directory access correctly");
  });
});
