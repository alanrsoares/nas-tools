import { describe, expect, it } from "bun:test";
import { type PlaylistState, playlistReducer } from "../src/features/player/playlistReducer.js";

const empty: PlaylistState = { list: [], idx: -1 };
const loaded: PlaylistState = { list: ["a.flac", "b.flac", "c.flac"], idx: 1 };

describe("playlistReducer", () => {
  describe("play", () => {
    it("sets list and idx", () => {
      const s = playlistReducer(empty, { type: "play", tracks: ["x.flac", "y.flac"], startIdx: 0 });
      expect(s).toEqual({ list: ["x.flac", "y.flac"], idx: 0 });
    });
  });

  describe("next", () => {
    it("advances idx", () => {
      const s = playlistReducer(loaded, { type: "next" });
      expect(s.idx).toBe(2);
    });

    it("does not advance past end", () => {
      const atEnd: PlaylistState = { list: ["a.flac"], idx: 0 };
      const s = playlistReducer(atEnd, { type: "next" });
      expect(s.idx).toBe(0);
    });
  });

  describe("prev", () => {
    it("moves back when early in track", () => {
      const s = playlistReducer(loaded, { type: "prev", positionMs: 1000 });
      expect(s.idx).toBe(0);
    });

    it("stays at same track when position > 3s", () => {
      const s = playlistReducer(loaded, { type: "prev", positionMs: 5000 });
      expect(s.idx).toBe(1);
    });

    it("stays at first track when already at start", () => {
      const atStart: PlaylistState = { list: ["a.flac", "b.flac"], idx: 0 };
      const s = playlistReducer(atStart, { type: "prev", positionMs: 0 });
      expect(s.idx).toBe(0);
    });
  });

  describe("advance", () => {
    it("moves to next track", () => {
      const s = playlistReducer(loaded, { type: "advance" });
      expect(s.idx).toBe(2);
    });

    it("resets to -1 when at end", () => {
      const atEnd: PlaylistState = { list: ["a.flac", "b.flac"], idx: 1 };
      const s = playlistReducer(atEnd, { type: "advance" });
      expect(s.idx).toBe(-1);
    });
  });

  describe("enqueue", () => {
    it("appends tracks without changing idx", () => {
      const s = playlistReducer(loaded, { type: "enqueue", tracks: ["d.flac"] });
      expect(s.list).toEqual(["a.flac", "b.flac", "c.flac", "d.flac"]);
      expect(s.idx).toBe(1);
    });
  });

  describe("clear", () => {
    it("resets to empty state", () => {
      expect(playlistReducer(loaded, { type: "clear" })).toEqual(empty);
    });
  });
});
