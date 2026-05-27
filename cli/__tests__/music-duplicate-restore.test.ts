import { describe, expect, it } from "bun:test";

import {
  type DuplicateRestoreAlbum,
  planDuplicateDeletes,
  planDuplicateRestores,
  restoreTargetPath,
} from "../lib/music-duplicate-restore.js";

const root = "/library";
const duplicatesRoot = "/library/_duplicates";

function album(input: {
  path: string;
  artist: string;
  album: string;
  fingerprint?: string;
}): DuplicateRestoreAlbum {
  return {
    path: input.path,
    trackCount: 10,
    release: {
      id: `${input.artist}-${input.album}`,
      artist: input.artist,
      album: input.album,
      trackCount: 10,
      fingerprint: input.fingerprint,
    },
  };
}

describe("music duplicate restore planner", () => {
  it("maps duplicate paths back to the active library tree", () => {
    expect(restoreTargetPath(root, duplicatesRoot, "/library/_duplicates/A-D/Artist/Album")).toBe(
      "/library/A-D/Artist/Album",
    );
  });

  it("plans restore when no active album has the same fingerprint", () => {
    const plans = planDuplicateRestores({
      root,
      duplicatesRoot,
      activeAlbums: [
        album({
          path: "/library/A-D/Artist/Other Album",
          artist: "Artist",
          album: "Other Album",
          fingerprint: "10t-1,2,3",
        }),
      ],
      duplicateAlbums: [
        album({
          path: "/library/_duplicates/A-D/Artist/Lost Album",
          artist: "Artist",
          album: "Lost Album",
          fingerprint: "10t-4,5,6",
        }),
      ],
      exists: () => false,
    });

    expect(plans[0]?.status).toBe("false-positive");
    expect(plans[0]?.restorePath).toBe("/library/A-D/Artist/Lost Album");
  });

  it("keeps confirmed duplicates in the duplicate tree", () => {
    const plans = planDuplicateRestores({
      root,
      duplicatesRoot,
      activeAlbums: [
        album({
          path: "/library/A-D/Artist/Album",
          artist: "The Artist",
          album: "Album",
          fingerprint: "10t-1,2,3",
        }),
      ],
      duplicateAlbums: [
        album({
          path: "/library/_duplicates/A-D/Artist/Album",
          artist: "Artist",
          album: "Album",
          fingerprint: "10t-1,2,3",
        }),
      ],
      exists: () => false,
    });

    expect(plans[0]?.status).toBe("confirmed-duplicate");
    expect(plans[0]?.matchingActivePaths).toEqual(["/library/A-D/Artist/Album"]);
  });

  it("does not overwrite an existing restore target", () => {
    const plans = planDuplicateRestores({
      root,
      duplicatesRoot,
      activeAlbums: [],
      duplicateAlbums: [
        album({
          path: "/library/_duplicates/A-D/Artist/Album",
          artist: "Artist",
          album: "Album",
          fingerprint: "10t-1,2,3",
        }),
      ],
      exists: () => true,
    });

    expect(plans[0]?.status).toBe("conflict");
  });
  it("plans delete for confirmed duplicates only when requested", () => {
    const plans = planDuplicateRestores({
      root,
      duplicatesRoot,
      activeAlbums: [
        album({
          path: "/library/A-D/Artist/Album",
          artist: "Artist",
          album: "Album",
          fingerprint: "10t-1,2,3",
        }),
      ],
      duplicateAlbums: [
        album({
          path: "/library/_duplicates/A-D/Artist/Album",
          artist: "Artist",
          album: "Album",
          fingerprint: "10t-1,2,3",
        }),
      ],
      exists: () => false,
    });

    const deletes = planDuplicateDeletes({
      restorePlans: plans,
      conflictAudits: [],
      deleteConfirmed: true,
      deleteSafeConflicts: false,
    });

    expect(deletes).toEqual([
      {
        status: "confirmed-duplicate",
        duplicatePath: "/library/_duplicates/A-D/Artist/Album",
        restorePath: "/library/A-D/Artist/Album",
        album: "Album",
        artist: "Artist",
        reason: "active library has same artist and track-duration fingerprint",
        matchingActivePaths: ["/library/A-D/Artist/Album"],
      },
    ]);
  });

  it("plans delete for safe conflict audits", () => {
    const plans = planDuplicateRestores({
      root,
      duplicatesRoot,
      activeAlbums: [],
      duplicateAlbums: [
        album({
          path: "/library/_duplicates/A-D/Artist/Album",
          artist: "Artist",
          album: "Album",
          fingerprint: "10t-1,2,3",
        }),
      ],
      exists: () => true,
    });

    const deletes = planDuplicateDeletes({
      restorePlans: plans,
      conflictAudits: [
        {
          status: "safe-delete",
          duplicatePath: "/library/_duplicates/A-D/Artist/Album",
          restorePath: "/library/A-D/Artist/Album",
          reason: "all duplicate music files are byte-identical to files already under target",
        },
      ],
      deleteConfirmed: false,
      deleteSafeConflicts: true,
    });

    expect(deletes[0]?.status).toBe("safe-conflict");
    expect(deletes[0]?.duplicatePath).toBe("/library/_duplicates/A-D/Artist/Album");
  });

  it("does not delete unsafe conflict audits", () => {
    const deletes = planDuplicateDeletes({
      restorePlans: [],
      conflictAudits: [
        {
          status: "different-release",
          duplicatePath: "/library/_duplicates/A-D/Artist/Album",
          restorePath: "/library/A-D/Artist/Album",
          reason: "no byte-identical files and no target album with same duration fingerprint",
        },
      ],
      deleteConfirmed: false,
      deleteSafeConflicts: true,
    });

    expect(deletes).toEqual([]);
  });
});
