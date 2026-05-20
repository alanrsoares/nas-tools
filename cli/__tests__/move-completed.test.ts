import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import {
  inferArtistNameFromFolder,
  scanMediaItems,
} from "../commands/move-completed.js";

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

describe("move-completed artist inference", () => {
  it("sanitizes control characters from inferred artist names", () => {
    const artist = inferArtistNameFromFolder(
      "Baden Powell\u0000 - The Legendary MPS Albums [2CD] 2008 [flac]",
    );

    expect(artist.unwrapOr("missing")).toBe("Baden Powell");
  });

  it("infers artists from dated release folder names", () => {
    const artist = inferArtistNameFromFolder(
      "Gentle Giant - 2019 - Unburied Treasure (29CD + Blu-ray Box Set Snapper Music)",
    );

    expect(artist.unwrapOr("missing")).toBe("Gentle Giant");
  });

  it("strips common bracketed release tags from artist-only folder names", () => {
    const artist = inferArtistNameFromFolder("The National [Vinyl]");

    expect(artist.unwrapOr("missing")).toBe("The National");
  });
});
