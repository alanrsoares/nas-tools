import { describe, expect, it } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { getOrElse } from "@onrails/maybe";

import {
  createMovePlanDraft,
  inferArtistNameFromFolder,
  type NasPathConfig,
} from "../src/index.js";

describe("inferArtistNameFromFolder", () => {
  it("infers artist from common release folder names", () => {
    expect(getOrElse(inferArtistNameFromFolder("Boris - 2005 - Pink [FLAC]"), "missing")).toBe(
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
      ebookDir: join(root, "Ebooks"),
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

  it("includes loose media files at the staging root", async () => {
    const root = await Bun.$`mktemp -d`.text().then((value) => value.trim());
    const config: NasPathConfig = {
      stagingDir: join(root, "complete"),
      musicDir: join(root, "FLAC"),
      tvDir: join(root, "TV"),
      movieDir: join(root, "Movies"),
      audiobookDir: join(root, "Audiobooks"),
      ebookDir: join(root, "Ebooks"),
      backupDir: join(root, "backup"),
    };

    await Promise.all(Object.values(config).map((dir) => mkdir(dir, { recursive: true })));
    await writeFile(join(config.stagingDir, "Stray Dog (1949) 1080p BluRay.mkv"), "not real mkv");

    const result = await createMovePlanDraft(config).unwrapOr(undefined);

    expect(result?.items).toHaveLength(1);
    expect(result?.items[0]?.mediaType).toBe("movie");
    expect(result?.items[0]?.included).toBe(true);
    expect(result?.items[0]?.targetPath).toBe(
      join(config.movieDir, "Stray Dog (1949) 1080p BluRay.mkv"),
    );
  });

  it("surfaces unsupported items as excluded instead of dropping them", async () => {
    const root = await Bun.$`mktemp -d`.text().then((value) => value.trim());
    const config: NasPathConfig = {
      stagingDir: join(root, "complete"),
      musicDir: join(root, "FLAC"),
      tvDir: join(root, "TV"),
      movieDir: join(root, "Movies"),
      audiobookDir: join(root, "Audiobooks"),
      ebookDir: join(root, "Ebooks"),
      backupDir: join(root, "backup"),
    };

    await Promise.all(Object.values(config).map((dir) => mkdir(dir, { recursive: true })));
    const ebooks = join(config.stagingDir, "Nietzsche, Friedrich");
    await mkdir(ebooks, { recursive: true });
    await writeFile(join(ebooks, "Genealogy of Morals.epub"), "not real epub");

    const result = await createMovePlanDraft(config).unwrapOr(undefined);

    expect(result?.items).toHaveLength(1);
    expect(result?.items[0]?.mediaType).toBe("ebook");
    expect(result?.items[0]?.status).toBe("included");
    expect(result?.items[0]?.included).toBe(true);
    expect(result?.items[0]?.targetPath).toBe(
      join(config.ebookDir, "Nietzsche, Friedrich"),
    );
  });

  it("surfaces unsupported items as excluded instead of dropping them", async () => {
    const root = await Bun.$`mktemp -d`.text().then((value) => value.trim());
    const config: NasPathConfig = {
      stagingDir: join(root, "complete"),
      musicDir: join(root, "FLAC"),
      tvDir: join(root, "TV"),
      movieDir: join(root, "Movies"),
      audiobookDir: join(root, "Audiobooks"),
      ebookDir: join(root, "Ebooks"),
      backupDir: join(root, "backup"),
    };

    await Promise.all(Object.values(config).map((dir) => mkdir(dir, { recursive: true })));
    const unsupported = join(config.stagingDir, "unsupported-item");
    await mkdir(unsupported, { recursive: true });
    await writeFile(join(unsupported, "somefile.zip"), "not real zip");

    const result = await createMovePlanDraft(config).unwrapOr(undefined);

    expect(result?.items).toHaveLength(1);
    expect(result?.items[0]?.mediaType).toBe("unknown");
    expect(result?.items[0]?.status).toBe("excluded");
    expect(result?.items[0]?.included).toBe(false);
    expect(result?.items[0]?.issues[0]?.code).toBe("UNSUPPORTED_MEDIA_TYPE");
  });
});
