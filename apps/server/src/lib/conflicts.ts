import { access } from "node:fs/promises";
import type { Deps } from "../types/deps.js";
import { parseEventItemId } from "./schemas.js";

export type ConflictEntry = {
  itemId: string;
  albumName: string;
  conflictingFiles: string[];
  sourcePath: string;
};

const RESOLVED_EVENT_TYPES = new Set(["conflict_skipped", "merge_replaced", "merge_kept"]);

type JobEvent = ReturnType<Deps["execution"]["getJobEvents"]>[number];

async function resolveConflictEntry(
  e: JobEvent,
  resolvedItemIds: Set<string>,
  plan: ReturnType<Deps["repos"]["plans"]["load"]>,
): Promise<ConflictEntry | null> {
  if (e.type !== "item_failed") return null;
  const match = e.message.match(/Merge conflict — files already exist in target: (.+)$/);
  if (!match) return null;
  const itemId = parseEventItemId(e.data);
  if (!itemId || resolvedItemIds.has(itemId)) return null;
  const item = plan?.items.find((i) => i.id === itemId);
  if (!item) return null;
  const sourceExists = await access(item.sourcePath)
    .then(() => true)
    .catch(() => false);
  if (!sourceExists) return null;
  const albumName = e.message.replace(/^Failed: /, "").replace(/ — Merge conflict.*$/, "");
  return {
    itemId,
    albumName,
    conflictingFiles: (match[1] ?? "").split(", ").filter(Boolean),
    sourcePath: item.sourcePath,
  };
}

export async function buildConflictsList(
  deps: Deps,
  jobId: string,
  planId: string | undefined | null,
): Promise<ConflictEntry[]> {
  const events = deps.execution.getJobEvents(jobId);
  const resolvedItemIds = new Set(
    events
      .filter((e) => RESOLVED_EVENT_TYPES.has(e.type))
      .map((e) => parseEventItemId(e.data))
      .filter((id): id is string => id !== undefined),
  );
  const plan = planId ? deps.repos.plans.load(planId) : undefined;
  const entries = await Promise.all(
    events.map((e) => resolveConflictEntry(e, resolvedItemIds, plan)),
  );
  return entries.filter((c): c is ConflictEntry => c !== null);
}
