import { describe, expect, it } from "bun:test";

import { planAlbumVariant } from "../lib/music-variants.js";

describe("music variant planning", () => {
  it("proposes Japanese edition suffix from folder and release country", () => {
    const plan = planAlbumVariant({
      path: "/library/A-D/Boris/Pink [Japan SHM-CD]",
      album: "Pink",
      releaseCountry: "JP",
      musicBrainzAlbumId: "release-id",
    });

    expect(plan.status).toBe("propose");
    expect(plan.proposedAlbum).toBe("Pink (SHM-CD)");
    expect(plan.confidence).toBe("high");
  });

  it("proposes dated remaster suffix when release date differs from original date", () => {
    const plan = planAlbumVariant({
      path: "/library/A-D/Artist/Album 2009 Remaster",
      album: "Album",
      date: "2009-09-09",
      originalDate: "1970-01-01",
    });

    expect(plan.status).toBe("propose");
    expect(plan.proposedAlbum).toBe("Album (2009 Remaster)");
  });

  it("does not propose when album title already has variant suffix", () => {
    const plan = planAlbumVariant({
      path: "/library/A-D/Artist/Album 2009 Remaster",
      album: "Album (2009 Remaster)",
      date: "2009",
      originalDate: "1970",
    });

    expect(plan.status).toBe("already-tagged");
    expect(plan.proposedAlbum).toBe("Album (2009 Remaster)");
  });

  it("ignores ordinary albums", () => {
    const plan = planAlbumVariant({
      path: "/library/A-D/Artist/Album",
      album: "Album",
    });

    expect(plan.status).toBe("no-variant");
  });
});
