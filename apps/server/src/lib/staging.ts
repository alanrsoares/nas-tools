import { readdir } from "node:fs/promises";
import { join } from "node:path";

export async function getStagingStatus(stagingDir: string) {
  const entries = await readdir(stagingDir, { withFileTypes: true }).catch(() => []);
  const items = entries.filter((e) => (e.isDirectory() || e.isFile()) && !e.name.startsWith("."));
  const cueChecks = await Promise.all(
    items.map(async (entry) => {
      if (entry.isDirectory()) {
        const sub = await readdir(join(stagingDir, entry.name)).catch(() => [] as string[]);
        return sub.some((f) => f.toLowerCase().endsWith(".cue"));
      }
      return entry.name.toLowerCase().endsWith(".cue");
    }),
  );
  const preview = items
    .slice(0, 5)
    .map((e, i) => ({ name: e.name, hasCue: cueChecks[i] ?? false }));
  return { total: items.length, withCue: cueChecks.filter(Boolean).length, preview };
}
