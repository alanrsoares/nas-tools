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

function collectVariantHints(metadata: VariantMetadata & { haystack: string }): {
  labels: string[];
  confidence: "high" | "medium" | "low";
  reasons: string[];
} {
  const labels: string[] = [];
  const reasons: string[] = [];
  const add = (label: string, reason: string) => {
    if (!labels.includes(label)) labels.push(label);
    reasons.push(reason);
  };

  const releaseYear = metadata.date?.match(/\b(19|20)\d{2}\b/)?.[0];
  const originalYear = metadata.originalDate?.match(/\b(19|20)\d{2}\b/)?.[0];
  const remasterYear = releaseYear && releaseYear !== originalYear ? releaseYear : undefined;

  if (/\bshm(?:-cd)?\b/i.test(metadata.haystack)) add("SHM-CD", "folder/tag mentions SHM-CD");
  else if (/\b(blu-?spec)\b/i.test(metadata.haystack))
    add("Blu-spec CD", "folder/tag mentions Blu-spec");
  else if (
    /\b(japan(?:ese)?|jp|jpn|obi)\b/i.test(metadata.haystack) ||
    metadata.releaseCountry === "JP"
  ) {
    add("Japanese Edition", "folder/tag or release country indicates Japan");
  }

  if (/\bmfsl\b|mobile fidelity/i.test(metadata.haystack)) add("MFSL", "folder/tag mentions MFSL");
  if (/\bsacd\b/i.test(metadata.haystack)) add("SACD", "folder/tag mentions SACD");
  if (/hi-?res|high resolution/i.test(metadata.haystack))
    add("Hi-Res", "folder/tag mentions hi-res");
  if (/\bdeluxe\b/i.test(metadata.haystack)) add("Deluxe Edition", "folder/tag mentions deluxe");
  if (/\bexpanded\b/i.test(metadata.haystack))
    add("Expanded Edition", "folder/tag mentions expanded");
  if (/\banniversary\b/i.test(metadata.haystack))
    add("Anniversary Edition", "folder/tag mentions anniversary");
  if (/\b(remaster(?:ed)?)\b/i.test(metadata.haystack)) {
    add(remasterYear ? `${remasterYear} Remaster` : "Remaster", "folder/tag mentions remaster");
  }
  if (/\bremix\b/i.test(metadata.haystack))
    add(remasterYear ? `${remasterYear} Remix` : "Remix", "folder/tag mentions remix");
  if (/\bmono\b/i.test(metadata.haystack)) add("Mono", "folder/tag mentions mono");
  if (/\bstereo\b/i.test(metadata.haystack)) add("Stereo", "folder/tag mentions stereo");
  if (/\b(vinyl|lp rip)\b/i.test(metadata.haystack)) add("Vinyl", "folder/tag mentions vinyl");

  const confidence =
    metadata.musicBrainzAlbumId || metadata.musicBrainzReleaseGroupId ? "high" : "medium";
  return { labels, confidence: labels.length === 0 ? "low" : confidence, reasons };
}
