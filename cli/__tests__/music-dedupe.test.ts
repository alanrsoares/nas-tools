import { describe, expect, it } from "bun:test";
import { findDuplicates, identifyDedupeMoves, scoreAlbum, type AlbumFolder } from "@nas-tools/core";

describe("music-dedupe logic", () => {
  const root = "/library";
  const trashRoot = "/library/_duplicates";

  const albums: AlbumFolder[] = [
    {
      path: "/library/A-D/Artist1/Album1",
      trackCount: 10,
      totalSize: 300000000,
      bitsPerSample: 16,
      sampleRate: 44100,
      bitrate: 900000,
      release: { id: "artist1-album1", artist: "Artist 1", album: "Album 1" }
    },
    {
      path: "/library/A-D/Artist1/Album1 [24-96]",
      trackCount: 10,
      totalSize: 800000000,
      bitsPerSample: 24,
      sampleRate: 960000,
      bitrate: 2800000,
      release: { id: "artist1-album1", artist: "Artist 1", album: "Album 1" }
    },
    {
      path: "/library/E-F/Artist2/Album2",
      trackCount: 12,
      totalSize: 400000000,
      bitsPerSample: 16,
      sampleRate: 44100,
      bitrate: 850000,
      release: { id: "artist2-album2", artist: "Artist 2", album: "Album 2" }
    }
  ];

  it("calculates score correctly (24bit > 16bit)", () => {
    expect(scoreAlbum(albums[1])).toBeGreaterThan(scoreAlbum(albums[0]));
  });

  it("finds duplicates based on release ID", () => {
    const groups = findDuplicates(albums);
    expect(groups.size).toBe(1);
    expect(groups.has("artist1-album1")).toBe(true);
    expect(groups.get("artist1-album1")).toHaveLength(2);
  });

  it("identifies moves correctly (inferior quality to trash)", () => {
    const groups = findDuplicates(albums);
    const moves = identifyDedupeMoves(groups, root, trashRoot);

    expect(moves).toHaveLength(1);
    expect(moves[0].from).toBe("/library/A-D/Artist1/Album1");
    expect(moves[0].to).toBe("/library/_duplicates/A-D/Artist1/Album1");
    expect(moves[0].reason).toContain("16bit/44100Hz vs 24bit/960000Hz");
  });
});
