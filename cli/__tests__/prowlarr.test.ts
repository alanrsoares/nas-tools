import { describe, expect, it } from "bun:test";
import { getDefaultCategorySet } from "../commands/prowlarr.js";
import { env } from "../lib/env.js";

describe("Prowlarr categories", () => {
  it("resolves default category sets correctly", () => {
    expect(getDefaultCategorySet("MUSIC")).toBe(env.PROWLARR_CATEGORY_SET_MUSIC);
    expect(getDefaultCategorySet("MOVIES")).toBe(env.PROWLARR_CATEGORY_SET_MOVIES);
    expect(getDefaultCategorySet("TV")).toBe(env.PROWLARR_CATEGORY_SET_TV);
    expect(getDefaultCategorySet("AUDIOBOOK")).toBe(env.PROWLARR_CATEGORY_SET_AUDIOBOOK);
    expect(getDefaultCategorySet("EBOOK")).toBe(env.PROWLARR_CATEGORY_SET_EBOOK);
  });

  it("throws error for unknown category sets", () => {
    expect(() => getDefaultCategorySet("UNKNOWN")).toThrow(
      "Unknown category set: UNKNOWN. Define PROWLARR_CATEGORY_SET_UNKNOWN in environment to use it.",
    );
  });
});
