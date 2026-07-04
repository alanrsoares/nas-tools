import { describe, expect, it } from "bun:test";
import { getOrElse, isNone } from "@onrails/maybe";
import {
  inferArtistNameFromFolder,
  parseReleaseFolderName,
  stripReleaseTags,
} from "../src/release-naming.js";

describe("stripReleaseTags", () => {
  it("strips bracketed format tags", () => {
    expect(stripReleaseTags("Boris - 2005 - Pink [FLAC]")).toBe("Boris - 2005 - Pink");
    expect(stripReleaseTags("Artist - Album [24bit]")).toBe("Artist - Album");
    expect(stripReleaseTags("Artist - Album (Web)")).toBe("Artist - Album");
  });

  it("leaves clean names unchanged", () => {
    expect(stripReleaseTags("Boris - Pink")).toBe("Boris - Pink");
  });

  it("strips multiple tags", () => {
    expect(stripReleaseTags("Artist - Album [FLAC][24bit]")).toBe("Artist - Album");
  });
});

describe("parseReleaseFolderName", () => {
  it("parses Artist - Year - Album pattern", () => {
    const result = parseReleaseFolderName("Boris - 2005 - Pink [FLAC]");
    expect(getOrElse(result, null)).toEqual({ artist: "Boris", album: "Pink" });
  });

  it("parses Artist - Album pattern", () => {
    const result = parseReleaseFolderName("Sunn O))) - Monoliths and Dimensions");
    expect(getOrElse(result, null)).toMatchObject({
      artist: "Sunn O)))",
      album: "Monoliths and Dimensions",
    });
  });

  it("returns none for bare year prefix", () => {
    const result = parseReleaseFolderName("2005 - Pink");
    expect(isNone(result)).toBe(true);
  });

  it("returns none for unrecognised pattern", () => {
    const result = parseReleaseFolderName("JustAFolderName");
    expect(isNone(result)).toBe(true);
  });
});

describe("inferArtistNameFromFolder", () => {
  it("infers artist from Artist - Year - Album", () => {
    expect(getOrElse(inferArtistNameFromFolder("Boris - 2005 - Pink [FLAC]"), "missing")).toBe(
      "Boris",
    );
  });

  it("infers artist from Artist - Album", () => {
    expect(getOrElse(inferArtistNameFromFolder("The National [Vinyl]"), "missing")).toBe(
      "The National",
    );
  });

  it("returns none for disc sub-folder", () => {
    expect(isNone(inferArtistNameFromFolder("Disc 1"))).toBe(true);
    expect(isNone(inferArtistNameFromFolder("CD2"))).toBe(true);
  });

  it("returns none for bare year prefix", () => {
    expect(isNone(inferArtistNameFromFolder("2005 - Pink"))).toBe(true);
  });
});
