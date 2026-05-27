export type VariantMetadata = {
  path: string;
  album: string;
  releaseCountry?: string | undefined;
  date?: string | undefined;
  originalDate?: string | undefined;
  catalogNumber?: string | undefined;
  barcode?: string | undefined;
  releaseType?: readonly string[] | undefined;
  musicBrainzAlbumId?: string | undefined;
  musicBrainzReleaseGroupId?: string | undefined;
};

export type VariantPlanStatus = "propose" | "already-tagged" | "no-variant";

export type VariantPlan = {
  status: VariantPlanStatus;
  path: string;
  currentAlbum: string;
  proposedAlbum: string;
  baseAlbum: string;
  variant: string;
  confidence: "high" | "medium" | "low";
  reasons: string[];
};

const variantTokenPattern =
  /\b(japan(?:ese)?|jp|jpn|shm(?:-cd)?|blu-?spec|obi|remaster(?:ed)?|remix|deluxe|expanded|anniversary|collector|special edition|bonus|mono|stereo|sacd|mfsl|mobile fidelity|hi-?res|high resolution|vinyl)\b/i;

export function planAlbumVariant(metadata: VariantMetadata): VariantPlan {
  const currentAlbum = metadata.album.trim();
  const baseAlbum = stripKnownVariantSuffix(currentAlbum);
  const haystack = [
    metadata.path,
    currentAlbum,
    metadata.catalogNumber,
    metadata.releaseType?.join(" "),
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ");

  const hints = collectVariantHints({ ...metadata, haystack });
  const variant = hints.labels.join("; ");
  const alreadyTagged = baseAlbum !== currentAlbum && variantTokenPattern.test(currentAlbum);

  if (hints.labels.length === 0) {
    return {
      status: "no-variant",
      path: metadata.path,
      currentAlbum,
      proposedAlbum: currentAlbum,
      baseAlbum: currentAlbum,
      variant: "",
      confidence: "low",
      reasons: [],
    };
  }

  const proposedAlbum = alreadyTagged ? currentAlbum : `${baseAlbum} (${variant})`;
  return {
    status: alreadyTagged ? "already-tagged" : "propose",
    path: metadata.path,
    currentAlbum,
    proposedAlbum,
    baseAlbum,
    variant,
    confidence: hints.confidence,
    reasons: hints.reasons,
  };
}

function stripKnownVariantSuffix(album: string): string {
  const stripped = album.replace(/\s*[[(]([^\])]+)[\])]\s*$/i, (suffix, content: string) =>
    variantTokenPattern.test(content) ? "" : suffix,
  );
  return stripped.trim() || album.trim();
}

type HintResult = { label: string; reason: string };

function detectEditionHint(metadata: VariantMetadata & { haystack: string }): HintResult | null {
  if (/\bshm(?:-cd)?\b/i.test(metadata.haystack))
    return { label: "SHM-CD", reason: "folder/tag mentions SHM-CD" };
  if (/\b(blu-?spec)\b/i.test(metadata.haystack))
    return { label: "Blu-spec CD", reason: "folder/tag mentions Blu-spec" };
  if (/\b(japan(?:ese)?|jp|jpn|obi)\b/i.test(metadata.haystack) || metadata.releaseCountry === "JP")
    return { label: "Japanese Edition", reason: "folder/tag or release country indicates Japan" };
  return null;
}

const staticFormatPatterns: Array<[RegExp, string, string]> = [
  [/\bmfsl\b|mobile fidelity/i, "MFSL", "folder/tag mentions MFSL"],
  [/\bsacd\b/i, "SACD", "folder/tag mentions SACD"],
  [/hi-?res|high resolution/i, "Hi-Res", "folder/tag mentions hi-res"],
  [/\bdeluxe\b/i, "Deluxe Edition", "folder/tag mentions deluxe"],
  [/\bexpanded\b/i, "Expanded Edition", "folder/tag mentions expanded"],
  [/\banniversary\b/i, "Anniversary Edition", "folder/tag mentions anniversary"],
  [/\bmono\b/i, "Mono", "folder/tag mentions mono"],
  [/\bstereo\b/i, "Stereo", "folder/tag mentions stereo"],
  [/\b(vinyl|lp rip)\b/i, "Vinyl", "folder/tag mentions vinyl"],
];

function detectFormatHints(haystack: string, remasterYear: string | undefined): HintResult[] {
  const results: HintResult[] = staticFormatPatterns
    .filter(([pattern]) => pattern.test(haystack))
    .map(([, label, reason]) => ({ label, reason }));
  if (/\b(remaster(?:ed)?)\b/i.test(haystack))
    results.push({
      label: remasterYear ? `${remasterYear} Remaster` : "Remaster",
      reason: "folder/tag mentions remaster",
    });
  if (/\bremix\b/i.test(haystack))
    results.push({
      label: remasterYear ? `${remasterYear} Remix` : "Remix",
      reason: "folder/tag mentions remix",
    });
  return results;
}

function collectVariantHints(metadata: VariantMetadata & { haystack: string }): {
  labels: string[];
  confidence: "high" | "medium" | "low";
  reasons: string[];
} {
  const releaseYear = metadata.date?.match(/\b(19|20)\d{2}\b/)?.[0];
  const originalYear = metadata.originalDate?.match(/\b(19|20)\d{2}\b/)?.[0];
  const remasterYear = releaseYear && releaseYear !== originalYear ? releaseYear : undefined;

  const edition = detectEditionHint(metadata);
  const formats = detectFormatHints(metadata.haystack, remasterYear);
  const all = [...(edition ? [edition] : []), ...formats];

  const labels: string[] = [];
  const reasons: string[] = [];
  for (const { label, reason } of all) {
    if (!labels.includes(label)) labels.push(label);
    reasons.push(reason);
  }

  const confidence =
    metadata.musicBrainzAlbumId || metadata.musicBrainzReleaseGroupId ? "high" : "medium";
  return { labels, confidence: labels.length === 0 ? "low" : confidence, reasons };
}
