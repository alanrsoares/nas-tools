/**
 * Heuristic Plex/Plexamp compatibility assessment from torrent release names.
 * Verdicts:
 *  - ready: should direct-play on Plex/Plexamp
 *  - warn:  playable but needs work or a beefy client (CUE image, remux)
 *  - avoid: won't play (disc structures/images, formats Plexamp lacks)
 * Returns null when the name carries no recognizable signal.
 */

export type PlexFitLevel = "ready" | "warn" | "avoid";

export type PlexFit = {
  level: PlexFitLevel;
  label: string;
  detail: string;
};

export type MediaKind = "music" | "video";

const VIDEO_DISC =
  /\b(bdmv|(?:full|complete|untouched)[ ._-]?blu-?ray|blu-?ray[ ._-]?(?:avc|vc-?1)|bd(?:25|50|66|100)|dvd-?[59]|dvd-?r|iso)\b/i;
const VIDEO_REMUX = /\bremux\b/i;
const VIDEO_RIP = /\b(web-?dl|web-?rip|blu-?ray|bd-?rip|br-?rip|hdtv|hd-?rip)\b/i;
const VIDEO_CODEC = /\b(x26[45]|h[ ._-]?26[45]|hevc|av1)\b/i;
const VIDEO_LEGACY_CODEC = /\b(xvid|divx)\b/i;

const AUDIO_UNSUPPORTED = /\b(sacd|dsd(?:64|128|256|512)?|dsf|dff|ape|shn|tta|wavpack|wv)\b/i;
const AUDIO_CUE_IMAGE = /\b(cue|(?:flac|ape|wav)[ ._+-]{0,3}(?:img|image))\b/i;
const AUDIO_LOSSLESS = /\b(flac|alac|24[ ._-]?(?:bit|\/?\s?(?:44|48|88|96|176|192)))\b/i;
const AUDIO_LOSSY = /\b(mp3|aac|ogg|opus|320|v0)\b/i;

function assessVideo(title: string): PlexFit | null {
  if (VIDEO_DISC.test(title)) {
    return {
      level: "avoid",
      label: "Disc",
      detail: "Full disc structure or image (BDMV/ISO/DVD-R) — Plex won't play these directly.",
    };
  }
  if (VIDEO_REMUX.test(title)) {
    return {
      level: "warn",
      label: "Remux",
      detail:
        "Untouched remux — direct-plays on wired clients, but the bitrate can choke Wi-Fi or force heavy transcodes.",
    };
  }
  if (VIDEO_LEGACY_CODEC.test(title)) {
    return {
      level: "warn",
      label: "Legacy",
      detail: "XviD/DivX era encode — plays, but expect transcoding on most clients.",
    };
  }
  if (VIDEO_RIP.test(title) || VIDEO_CODEC.test(title)) {
    return {
      level: "ready",
      label: "Plex-ready",
      detail: "Standard encode (WEB-DL/BluRay rip) — should direct-play on Plex.",
    };
  }
  return null;
}

function assessMusic(title: string): PlexFit | null {
  if (AUDIO_UNSUPPORTED.test(title)) {
    return {
      level: "avoid",
      label: "No Plexamp",
      detail: "SACD/DSD/APE-family format — Plexamp can't play it without conversion.",
    };
  }
  if (AUDIO_CUE_IMAGE.test(title)) {
    return {
      level: "warn",
      label: "CUE",
      detail:
        "Single-file image with CUE sheet — run it through CUE Split before moving to the library.",
    };
  }
  if (AUDIO_LOSSLESS.test(title)) {
    return {
      level: "ready",
      label: "Plexamp-ready",
      detail: "Lossless tracks — plays as-is in Plexamp.",
    };
  }
  if (AUDIO_LOSSY.test(title)) {
    return {
      level: "ready",
      label: "Plexamp-ready",
      detail: "Lossy but fully supported format.",
    };
  }
  return null;
}

export function assessPlexFit(title: string, kind: MediaKind): PlexFit | null {
  return kind === "video" ? assessVideo(title) : assessMusic(title);
}

/** Gates the partial-download preview button — no point offering it on music torrents. */
export function isLikelyVideo(title: string): boolean {
  return (
    VIDEO_DISC.test(title) ||
    VIDEO_REMUX.test(title) ||
    VIDEO_RIP.test(title) ||
    VIDEO_CODEC.test(title) ||
    VIDEO_LEGACY_CODEC.test(title)
  );
}
