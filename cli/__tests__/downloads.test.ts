import { describe, expect, it } from "bun:test";

import {
  findMovedCompletedTorrents,
  mapTransmissionPath,
  type TransmissionTorrent,
} from "../commands/downloads.js";
import { isUnsafeFile } from "../lib/report.js";

const torrent = (overrides: Partial<TransmissionTorrent>): TransmissionTorrent => ({
  id: 1,
  name: "Album",
  percentDone: 1,
  downloadDir: "/downloads/complete",
  files: [{ name: "Album/01.flac" }],
  ...overrides,
});

describe("Transmission cleanup", () => {
  it("maps container complete paths to host complete paths", () => {
    expect(
      mapTransmissionPath("/downloads/complete", "Artist/Album/01.flac", {
        completeDir: "/volume1/Download/Transmission/complete",
      }),
    ).toBe("/volume1/Download/Transmission/complete/Artist/Album/01.flac");
  });

  it("selects only complete torrents with all files missing", async () => {
    const existingPath = "/volume1/Download/Transmission/complete/Keep/01.flac";
    const candidates = await findMovedCompletedTorrents(
      [
        torrent({ id: 1, name: "Moved", files: [{ name: "Moved/01.flac" }] }),
        torrent({ id: 2, name: "Incomplete", percentDone: 0.5 }),
        torrent({ id: 3, name: "Keep", files: [{ name: "Keep/01.flac" }] }),
      ],
      {
        completeDir: "/volume1/Download/Transmission/complete",
        pathExistsFn: async (path) => path === existingPath,
      },
    );

    expect(candidates.map((candidate) => candidate.id)).toEqual([1]);
    expect(candidates[0]?.missingFiles).toBe(1);
  });
});

describe("isUnsafeFile", () => {
  it("returns true for unsafe executable and script extensions", () => {
    expect(isUnsafeFile("malware.exe")).toBe(true);
    expect(isUnsafeFile("script.sh")).toBe(true);
    expect(isUnsafeFile("malicious.bat")).toBe(true);
    expect(isUnsafeFile("virus.scr")).toBe(true);
    expect(isUnsafeFile("shortcut.lnk")).toBe(true);
    expect(isUnsafeFile("setup.msi")).toBe(true);
  });

  it("returns false for safe media and data extensions", () => {
    expect(isUnsafeFile("song.flac")).toBe(false);
    expect(isUnsafeFile("movie.mkv")).toBe(false);
    expect(isUnsafeFile("album.cue")).toBe(false);
    expect(isUnsafeFile("read.me")).toBe(false);
    expect(isUnsafeFile("text.txt")).toBe(false);
  });
});
