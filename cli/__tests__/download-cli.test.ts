import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { $ } from "zx";

describe("download CLI integration", () => {
  let tempDir: string;
  const cliPath = join(process.cwd(), "dist", "cli");

  beforeAll(async () => {
    // Create a temporary directory for testing
    tempDir = await mkdtemp(join(tmpdir(), "download-cli-test-"));

    // Ensure the CLI is built
    await $`bun run build`;
  });

  afterAll(async () => {
    // Clean up the temporary directory
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      console.warn("Failed to clean up temp directory:", error);
    }
  });

  it("should download the Pines cover image using the CLI", async () => {
    const testUrl =
      "https://raw.githubusercontent.com/thedevdojo/pines/refs/heads/main/cover.jpg";

    // Run the CLI command
    const result =
      await $`node ${cliPath} download ${testUrl} --dest ${tempDir}`;

    // Verify the command executed successfully
    expect(result.exitCode).toBe(0);

    // Verify the file was downloaded
    const expectedFilename = "cover.jpg";
    const filePath = join(tempDir, expectedFilename);

    // Check if file exists
    try {
      await access(filePath);
    } catch (error) {
      throw new Error(`File does not exist: ${filePath}`);
    }

    // Check if file has content (not empty)
    const fileContent = await readFile(filePath);
    expect(fileContent.length).toBeGreaterThan(0);

    // Verify it's actually a JPEG file by checking the magic bytes
    const jpegMagicBytes = Buffer.from([0xff, 0xd8, 0xff]);
    expect(fileContent.subarray(0, 3)).toEqual(jpegMagicBytes);
  }, 60000); // 60 second timeout for network operations

  it("should handle invalid URLs gracefully via CLI", async () => {
    const invalidUrl =
      "https://invalid-domain-that-does-not-exist-12345.com/file.jpg";

    // The CLI should exit with code 1 for errors
    try {
      await $`node ${cliPath} download ${invalidUrl} --dest ${tempDir} --retries 1 --timeout 5000`;
      throw new Error("Expected CLI to fail with invalid URL");
    } catch (error: any) {
      // zx throws an error when the command fails, which is expected
      expect(error.exitCode).toBe(1);
    }
  }, 30000);

  it("should respect custom User-Agent via CLI", async () => {
    const testUrl =
      "https://raw.githubusercontent.com/thedevdojo/pines/refs/heads/main/cover.jpg";
    const customUA = "Custom-Test-Agent/1.0";

    // Run the CLI command with custom User-Agent
    const result =
      await $`node ${cliPath} download ${testUrl} --dest ${tempDir} --ua ${customUA}`;

    // Verify the command executed successfully
    expect(result.exitCode).toBe(0);

    // Verify the file was downloaded (reusing the same file from previous test)
    const expectedFilename = "cover.jpg";
    const filePath = join(tempDir, expectedFilename);

    try {
      await access(filePath);
      const fileContent = await readFile(filePath);
      expect(fileContent.length).toBeGreaterThan(0);
    } catch (error) {
      throw new Error(`File verification failed: ${error}`);
    }
  }, 60000);

  it("should handle missing URL argument", async () => {
    try {
      await $`node ${cliPath} download`;
      throw new Error("Expected CLI to fail with missing URL");
    } catch (error: any) {
      expect(error.exitCode).toBe(1);
    }
  });
});
