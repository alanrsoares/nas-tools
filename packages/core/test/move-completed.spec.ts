import { describe, expect, it } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  createMovePlanDraft,
  inferArtistNameFromFolder,
  type NasPathConfig,
} from "../src/index.js";

describe("inferArtistNameFromFolder", () => {
  it("infers artist from common release folder names", () => {
    expect(inferArtistNameFromFolder("Boris - 2005 - Pink [FLAC]").unwrapOr("missing")).toBe(
      "Boris",
    );
  });
});

describe("createMovePlanDraft", () => {
  it("creates a draft move plan from staging folders", async () => {
    const root = await Bun.$`mktemp -d`.text().then((value) => value.trim());
    const config: NasPathConfig = {
      stagingDir: join(root, "complete"),
      musicDir: join(root, "FLAC"),
      tvDir: join(root, "TV"),
      movieDir: join(root, "Movies"),
      audiobookDir: join(root, "Audiobooks"),
      backupDir: join(root, "backup"),
    };

    await Promise.all(Object.values(config).map((dir) => mkdir(dir, { recursive: true })));
    const album = join(config.stagingDir, "Boris - 2005 - Pink [FLAC]");
    await mkdir(album, { recursive: true });
    await writeFile(join(album, "01 Pink.flac"), "not real flac");

    const result = await createMovePlanDraft(config).unwrapOr(undefined);

    expect(result?.status).toBe("draft");
    expect(result?.items).toHaveLength(1);
    expect(result?.items[0]?.artistName).toBe("Boris");
  });
});
