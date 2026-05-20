import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import { scanMediaItems } from "../commands/move-completed.js";

describe("move-completed media scanning", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "move-completed-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("detects music files nested inside a release folder", async () => {
    const releaseDir = join(tempDir, "Yes - Discography 1969-2021 FLAC");
    await mkdir(join(releaseDir, "Albums", "1972 - Close To The Edge"), {
      recursive: true,
    });
    await Bun.write(
      join(
        releaseDir,
        "Albums",
        "1972 - Close To The Edge",
        "01 - Close To The Edge.flac",
      ),
      "fake flac content",
    );

    const items = await scanMediaItems(tempDir).unwrapOr([]);

    expect(items).toHaveLength(1);
    expect(items[0]?.type).toBe("music");
    expect(items[0]?.name).toBe("Yes - Discography 1969-2021 FLAC");
    expect(items[0]?.musicFiles).toEqual([
      join("Albums", "1972 - Close To The Edge", "01 - Close To The Edge.flac"),
    ]);
  });
});
