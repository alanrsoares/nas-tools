import type { MovePlan, MovePlanItem } from "@nas-tools/core";

export function formatBytes(bytes: number): string {
  if (!bytes) return "—";
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  return `${Math.round(bytes / 1024 ** 2)} MB`;
}

export function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function mediaLabel(mediaType: MovePlanItem["mediaType"]) {
  const labels: Record<MovePlanItem["mediaType"], string> = {
    audiobook: "Audiobook",
    movie: "Movie",
    music: "Music",
    tv: "TV",
    unknown: "Unsupported",
  };
  return labels[mediaType];
}

export function settingLabel(key: string) {
  const labels: Record<string, string> = {
    audiobookDir: "Audiobooks",
    backupDir: "Backup",
    movieDir: "Movies",
    musicDir: "Music",
    stagingDir: "Download Staging",
    tvDir: "TV",
  };
  return labels[key] ?? key;
}

export function summarizePlan(items: MovePlanItem[]) {
  const included = items.filter((i) => i.included && i.issues.length === 0).length;
  const needsCorrection = items.filter((i) => i.included && i.issues.length > 0).length;
  const excluded = items.filter((i) => !i.included).length;
  const cuePairTotal = items.reduce((sum, item) => sum + (item.cueAudioPairs ?? 0), 0);
  return { total: items.length, included, needsCorrection, excluded, cuePairTotal };
}

export function updatePlanItem(plan: MovePlan, item: MovePlanItem): MovePlan {
  return {
    ...plan,
    items: plan.items.map((candidate) => (candidate.id === item.id ? item : candidate)),
  };
}

export function parseSseChunk(chunk: string, onEvent: (data: unknown) => void): void {
  if (!chunk.startsWith("data: ")) return;
  const raw = chunk.slice(6);
  try {
    onEvent(JSON.parse(raw));
  } catch (e) {
    console.error("Failed to parse stream data:", raw, e);
  }
}

export async function readSseStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onEvent: (data: unknown) => void,
): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value);
    const lines = buffer.split("\n\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      parseSseChunk(line, onEvent);
    }
  }
}
