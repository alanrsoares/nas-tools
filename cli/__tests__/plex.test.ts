import { describe, expect, it } from "bun:test";

import { chooseMusicSection, parsePlexSections, parsePlexToken } from "../commands/plex.js";

describe("Plex command helpers", () => {
  it("parses PlexOnlineToken from Preferences.xml", () => {
    expect(parsePlexToken('<Preferences PlexOnlineToken="abc123" />')).toBe("abc123");
  });

  it("parses music library sections from Plex XML", () => {
    const sections = parsePlexSections(`
      <MediaContainer>
        <Directory key="1" type="movie" title="Movies" />
        <Directory key="2" type="artist" title="Music" />
      </MediaContainer>
    `);

    expect(sections).toEqual([
      { key: "1", type: "movie", title: "Movies" },
      { key: "2", type: "artist", title: "Music" },
    ]);
  });

  it("chooses the requested music section case-insensitively", () => {
    expect(
      chooseMusicSection(
        [
          { key: "1", type: "movie", title: "Movies" },
          { key: "2", type: "artist", title: "Music" },
        ],
        "music",
      ),
    ).toEqual({ key: "2", type: "artist", title: "Music" });
  });
});
