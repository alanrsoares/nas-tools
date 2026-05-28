import { access } from "node:fs/promises";
import type { MovePlan } from "@nas-tools/core";

import type { JobEventsRepo } from "../db/index.js";
import type { Deps } from "../types/deps.js";
import type { Maybe } from "./maybe.js";
import { andThen, compactMaybes, fromNullable, isNone, isSome, none, some } from "./maybe.js";
import { parseEventItemId } from "./schemas.js";

export type ConflictEntry = {
  itemId: string;
  albumName: string;
  conflictingFiles: string[];
  sourcePath: string;
};

type StoredJobEvent = ReturnType<JobEventsRepo["listAfter"]>[number];

const RESOLVED_EVENT_TYPES = new Set(["conflict_skipped", "merge_replaced", "merge_kept"]);

async function resolveConflictEntry(
  e: StoredJobEvent,
  resolvedItemIds: Set<string>,
  plan: Maybe<MovePlan>,
): Promise<Maybe<ConflictEntry>> {
  if (e.type !== "item_failed") return none();
  const match = e.message.match(/Merge conflict — files already exist in target: (.+)$/);
  if (!match) return none();

  const itemId = parseEventItemId(e.data);
  if (isNone(itemId) || resolvedItemIds.has(itemId.value)) return none();

  const item = andThen(plan, (loaded) =>
    fromNullable(loaded.items.find((i) => i.id === itemId.value)),
  );
  if (isNone(item)) return none();

  const sourceExists = await access(item.value.sourcePath)
    .then(() => true)
    .catch(() => false);
  if (!sourceExists) return none();

  const albumName = e.message.replace(/^Failed: /, "").replace(/ — Merge conflict.*$/, "");
  return some({
    itemId: itemId.value,
    albumName,
    conflictingFiles: (match[1] ?? "").split(", ").filter(Boolean),
    sourcePath: item.value.sourcePath,
  });
}

export async function buildConflictsList(
  deps: Deps,
  jobId: string,
  planId: string | null | undefined,
): Promise<ConflictEntry[]> {
  const events = deps.execution.getJobEvents(jobId);
  const resolvedItemIds = new Set(
    events
      .filter((e) => RESOLVED_EVENT_TYPES.has(e.type))
      .flatMap((e) => {
        const id = parseEventItemId(e.data);
        return isSome(id) ? [id.value] : [];
      }),
  );
  const plan = planId ? deps.repos.plans.load(planId) : none<MovePlan>();
  const entries = await Promise.all(
    events.map((e) => resolveConflictEntry(e, resolvedItemIds, plan)),
  );
  return compactMaybes(entries);
}
