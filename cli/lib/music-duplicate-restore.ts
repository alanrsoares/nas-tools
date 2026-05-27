import path from "node:path";
import { type AlbumFolder, normalize } from "@nas-tools/core";

export type DuplicateRestoreAlbum = Pick<AlbumFolder, "path" | "trackCount" | "release">;

export type DuplicateRestorePlanStatus = "false-positive" | "confirmed-duplicate" | "conflict";

export type DuplicateRestorePlan = {
  status: DuplicateRestorePlanStatus;
  duplicatePath: string;
  restorePath: string;
  album: string;
  artist: string;
  reason: string;
  matchingActivePaths: string[];
};

export type DuplicateConflictAudit = {
  status: "safe-delete" | "same-tracks-different-files" | "different-release" | "needs-review";
  duplicatePath: string;
  restorePath: string;
  reason: string;
};

export type DuplicateDeletePlanStatus = "confirmed-duplicate" | "safe-conflict";

export type DuplicateDeletePlan = {
  status: DuplicateDeletePlanStatus;
  duplicatePath: string;
  restorePath: string;
  album: string;
  artist: string;
  reason: string;
  matchingActivePaths: string[];
};

type ExistingPathLookup = (targetPath: string) => boolean;

export function planDuplicateRestores(input: {
  root: string;
  duplicatesRoot: string;
  activeAlbums: DuplicateRestoreAlbum[];
  duplicateAlbums: DuplicateRestoreAlbum[];
  exists: ExistingPathLookup;
}): DuplicateRestorePlan[] {
  const activeByFingerprint = new Map<string, DuplicateRestoreAlbum[]>();

  for (const album of input.activeAlbums) {
    const key = fingerprintKey(album);
    if (!key) continue;
    const group = activeByFingerprint.get(key) ?? [];
    group.push(album);
    activeByFingerprint.set(key, group);
  }

  return input.duplicateAlbums.map((album) => {
    const restorePath = restoreTargetPath(input.root, input.duplicatesRoot, album.path);
    const key = fingerprintKey(album);
    const matches = key ? (activeByFingerprint.get(key) ?? []) : [];

    if (matches.length > 0) {
      return {
        status: "confirmed-duplicate",
        duplicatePath: album.path,
        restorePath,
        album: album.release.album,
        artist: album.release.artist,
        reason: "active library has same artist and track-duration fingerprint",
        matchingActivePaths: matches.map((match) => match.path),
      };
    }

    if (input.exists(restorePath)) {
      return {
        status: "conflict",
        duplicatePath: album.path,
        restorePath,
        album: album.release.album,
        artist: album.release.artist,
        reason: "restore target already exists",
        matchingActivePaths: [],
      };
    }

    return {
      status: "false-positive",
      duplicatePath: album.path,
      restorePath,
      album: album.release.album,
      artist: album.release.artist,
      reason: album.release.fingerprint
        ? "no active album has same artist and track-duration fingerprint"
        : "duplicate album has no fingerprint match in active library",
      matchingActivePaths: [],
    };
  });
}

export function restoreTargetPath(
  root: string,
  duplicatesRoot: string,
  duplicatePath: string,
): string {
  const relative = path.relative(duplicatesRoot, duplicatePath);
  return path.join(root, relative);
}

export function planDuplicateDeletes(input: {
  restorePlans: DuplicateRestorePlan[];
  conflictAudits: DuplicateConflictAudit[];
  deleteConfirmed: boolean;
  deleteSafeConflicts: boolean;
}): DuplicateDeletePlan[] {
  const deletes: DuplicateDeletePlan[] = [];

  if (input.deleteConfirmed) {
    deletes.push(
      ...input.restorePlans
        .filter((plan) => plan.status === "confirmed-duplicate")
        .map((plan) => ({
          status: "confirmed-duplicate" as const,
          duplicatePath: plan.duplicatePath,
          restorePath: plan.restorePath,
          album: plan.album,
          artist: plan.artist,
          reason: plan.reason,
          matchingActivePaths: plan.matchingActivePaths,
        })),
    );
  }

  if (input.deleteSafeConflicts) {
    const plansByPath = new Map(input.restorePlans.map((plan) => [plan.duplicatePath, plan]));
    deletes.push(
      ...input.conflictAudits
        .filter((audit) => audit.status === "safe-delete")
        .map((audit) => {
          const plan = plansByPath.get(audit.duplicatePath);
          return {
            status: "safe-conflict" as const,
            duplicatePath: audit.duplicatePath,
            restorePath: audit.restorePath,
            album: plan?.album ?? path.basename(audit.duplicatePath),
            artist: plan?.artist ?? "Unknown Artist",
            reason: audit.reason,
            matchingActivePaths: plan?.matchingActivePaths ?? [],
          };
        }),
    );
  }

  return dedupeDeletes(deletes);
}

function dedupeDeletes(plans: DuplicateDeletePlan[]): DuplicateDeletePlan[] {
  const seen = new Set<string>();
  return plans.filter((plan) => {
    if (seen.has(plan.duplicatePath)) return false;
    seen.add(plan.duplicatePath);
    return true;
  });
}

function fingerprintKey(album: DuplicateRestoreAlbum): string | undefined {
  const fingerprint = album.release.fingerprint;
  if (!fingerprint) return undefined;
  return [normalize(album.release.artist), fingerprint].join("::");
}
