import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import {
  type AlbumFolder,
  getAlbumInfo,
  identifyAlbumCandidates,
  type WalkEntry,
  walk,
} from "@nas-tools/core";
import type { Command } from "commander";
import { parseFile } from "music-metadata";
import { ResultAsync } from "neverthrow";
import pc from "picocolors";
import { z } from "zod";

import { type fail, formatError, parseWith } from "../lib/fp.js";
import { planDuplicateDeletes, planDuplicateRestores } from "../lib/music-duplicate-restore.js";
import { NAS_PATHS } from "../lib/report.js";
import { logError } from "../lib/utils.js";

const optionsSchema = z.object({
  root: z.string().optional().default(NAS_PATHS.flac),
  duplicatesRoot: z.string().optional(),
  apply: z.boolean().optional().default(false),
  auditConflicts: z.boolean().optional().default(false),
  deleteConfirmed: z.boolean().optional().default(false),
  deleteSafeConflicts: z.boolean().optional().default(false),
  mergeConflicts: z.boolean().optional().default(false),
  restoreFalsePositives: z.boolean().optional().default(true),
  json: z.boolean().optional().default(false),
  maxDepth: z.coerce.number().int().min(1).optional().default(8),
});

type CommandOptions = z.infer<typeof optionsSchema>;

async function applyRestorePlan(
  options: CommandOptions,
  duplicatesRoot: string,
  plans: ReturnType<typeof planDuplicateRestores>,
  deletePlans: ReturnType<typeof planDuplicateDeletes>,
  mergePlans: MergeConflictPlan[],
): Promise<void> {
  const toRestore = options.restoreFalsePositives
    ? plans.filter((plan) => plan.status === "false-positive")
    : [];
  if (!options.apply) {
    console.log(
      pc.bold(
        `\nDry run: ${toRestore.length + actionableMergePlans(mergePlans).length} folders would be restored, ${deletePlans.length} folders would be deleted, ${reviewMergePlans(mergePlans).length} merge items need review.`,
      ),
    );
    console.log(pc.cyan("Use --apply to execute restore/delete actions."));
    return;
  }

  for (const plan of toRestore) {
    await mkdir(path.dirname(plan.restorePath), { recursive: true });
    await rename(plan.duplicatePath, plan.restorePath);
    console.log(pc.green(`Restored: ${plan.restorePath}`));
  }

  for (const plan of actionableMergePlans(mergePlans)) {
    assertInsideDuplicatesRoot(plan.duplicatePath, duplicatesRoot);
    await mkdir(path.dirname(plan.targetPath), { recursive: true });
    await rename(plan.duplicatePath, plan.targetPath);
    console.log(pc.green(`Merged: ${plan.duplicatePath} → ${plan.targetPath}`));
  }

  for (const plan of deletePlans) {
    assertInsideDuplicatesRoot(plan.duplicatePath, duplicatesRoot);
    await rm(plan.duplicatePath, { recursive: true });
    console.log(pc.green(`Deleted duplicate: ${plan.duplicatePath}`));
  }

  for (const conflict of plans.filter((plan) => plan.status === "conflict")) {
    await pruneEmptyDirectories(conflict.duplicatePath, duplicatesRoot);
  }
}

async function executeRestore(
  options: CommandOptions,
  duplicatesRoot: string,
  activeAlbums: AlbumFolder[],
  duplicateAlbums: AlbumFolder[],
): Promise<void> {
  const existingPaths = new Set<string>();
  for (const album of duplicateAlbums) {
    const target = path.join(options.root, path.relative(duplicatesRoot, album.path));
    if (await pathExists(target)) existingPaths.add(target);
  }

  const plans = planDuplicateRestores({
    root: options.root,
    duplicatesRoot,
    activeAlbums,
    duplicateAlbums,
    exists: (targetPath) => existingPaths.has(targetPath),
  });

  const shouldAuditConflicts = options.auditConflicts || options.deleteSafeConflicts;
  const conflictAudits = shouldAuditConflicts
    ? await auditConflicts(plans.filter((plan) => plan.status === "conflict"))
    : [];
  const deletePlans = planDuplicateDeletes({
    restorePlans: plans,
    conflictAudits,
    deleteConfirmed: options.deleteConfirmed,
    deleteSafeConflicts: options.deleteSafeConflicts,
  });
  const mergePlans = options.mergeConflicts
    ? await planConflictMerges(plans.filter((plan) => plan.status === "conflict"))
    : [];

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          root: options.root,
          duplicatesRoot,
          activeAlbums: activeAlbums.length,
          duplicateAlbums: duplicateAlbums.length,
          plans,
          conflictAudits,
          deletePlans,
          mergePlans,
        },
        null,
        2,
      ),
    );
    return;
  }

  printReport(
    activeAlbums.length,
    duplicateAlbums.length,
    plans,
    conflictAudits,
    deletePlans,
    mergePlans,
  );
  await applyRestorePlan(options, duplicatesRoot, plans, deletePlans, mergePlans);
}

function run(options: CommandOptions): ResultAsync<void, ReturnType<typeof fail>> {
  const duplicatesRoot = options.duplicatesRoot ?? path.join(options.root, "_duplicates");

  if (!options.json) {
    console.log(pc.cyan(`Scanning active library: ${options.root}`));
    console.log(pc.cyan(`Scanning duplicate tree: ${duplicatesRoot}`));
  }

  return ResultAsync.combine([
    readAlbums(options.root, options.root, options.maxDepth, false),
    readAlbums(duplicatesRoot, duplicatesRoot, options.maxDepth, true),
  ])
    .mapErr((error) => ({ type: "fail", message: error.message }) as const)
    .andThen(([activeAlbums, duplicateAlbums]) =>
      ResultAsync.fromPromise(
        executeRestore(options, duplicatesRoot, activeAlbums, duplicateAlbums),
        (cause) => ({ type: "fail", message: String(cause) }) as const,
      ),
    );
}

function readAlbums(
  scanRoot: string,
  libraryRoot: string,
  maxDepth: number,
  includeDuplicates: boolean,
): ResultAsync<AlbumFolder[], { message: string }> {
  return walk(scanRoot, { maxDepth })
    .mapErr((error) => ({ message: error.message }))
    .andThen((entries) => {
      const candidates = includeDuplicates
        ? identifyDuplicateAlbumCandidates(entries, libraryRoot)
        : identifyAlbumCandidates(entries, libraryRoot);
      const candidateFolders = [...new Set(candidates.map((album) => album.path))];

      return ResultAsync.fromPromise(
        (async () => {
          const albums: AlbumFolder[] = [];
          for (const folder of candidateFolders) {
            const maybeAlbum = await getAlbumInfo(folder).unwrapOr(undefined);
            if (maybeAlbum?.isJust) albums.push(maybeAlbum.value);
          }
          return albums;
        })(),
        (cause) => ({ message: String(cause) }),
      );
    });
}

function identifyDuplicateAlbumCandidates(entries: WalkEntry[], root: string): AlbumFolder[] {
  const folderStats = new Map<string, { count: number; size: number }>();
  for (const entry of entries) {
    if (entry.isDirectory || !isMusicFile(entry.name)) continue;
    const dir = inferDuplicateAlbumRoot(entry.path, root);
    const stats = folderStats.get(dir) ?? { count: 0, size: 0 };
    stats.count++;
    stats.size += entry.size;
    folderStats.set(dir, stats);
  }

  return [...folderStats.entries()].map(([folderPath, stats]) => ({
    path: folderPath,
    trackCount: stats.count,
    totalSize: stats.size,
    sampleRate: 0,
    bitsPerSample: 0,
    bitrate: 0,
    release: {
      id: path.basename(folderPath),
      artist: "Unknown Artist",
      album: path.basename(folderPath),
      trackCount: stats.count,
    },
  }));
}

function inferDuplicateAlbumRoot(filePath: string, root: string): string {
  const fileDir = path.dirname(filePath);
  const relativeDir = path.relative(root, fileDir);
  const parts = relativeDir.split(path.sep).filter(Boolean);
  const first = parts[0];
  const second = parts[1];
  const third = parts[2];
  if (!first || !second) return fileDir;
  if (!isRange(first)) return path.join(root, first, second);
  if (!third || isDiscFolder(third)) return path.join(root, first, second);
  return path.join(root, first, second, third);
}

function printRestorePlan(
  plan: {
    artist: string;
    album: string;
    duplicatePath: string;
    restorePath: string;
    reason: string;
  },
  label: string,
  color: (s: string) => string,
): void {
  console.log(color(`\n[${label}] ${plan.artist} - ${plan.album}`));
  console.log(`  from: ${plan.duplicatePath}`);
  console.log(`  to:   ${plan.restorePath}`);
  console.log(`  why:  ${plan.reason}`);
}

function printDeletePlans(deletePlans: ReturnType<typeof planDuplicateDeletes>): void {
  for (const plan of deletePlans) {
    console.log(pc.green(`\n[DELETE:${plan.status}] ${plan.artist} - ${plan.album}`));
    console.log(`  path: ${plan.duplicatePath}`);
    console.log(`  why:  ${plan.reason}`);
    for (const match of plan.matchingActivePaths) console.log(`  kept: ${match}`);
  }
}

function printConflictAudits(conflictAudits: ConflictAudit[]): void {
  for (const audit of conflictAudits) {
    const color = audit.status === "safe-delete" ? pc.green : pc.yellow;
    console.log(color(`\n[AUDIT:${audit.status}] ${audit.duplicatePath}`));
    console.log(`  target: ${audit.restorePath}`);
    console.log(`  files:  ${audit.matchedFiles}/${audit.duplicateFiles} duplicate files matched`);
    console.log(`  why:    ${audit.reason}`);
    for (const metadataMatch of audit.metadataMatches) console.log(`  match:  ${metadataMatch}`);
  }
}

function printReport(
  activeAlbums: number,
  duplicateAlbums: number,
  plans: ReturnType<typeof planDuplicateRestores>,
  conflictAudits: ConflictAudit[],
  deletePlans: ReturnType<typeof planDuplicateDeletes>,
  mergePlans: MergeConflictPlan[],
): void {
  const falsePositives = plans.filter((plan) => plan.status === "false-positive");
  const confirmed = plans.filter((plan) => plan.status === "confirmed-duplicate");
  const conflicts = plans.filter((plan) => plan.status === "conflict");

  console.log(pc.bold("Duplicate restore plan"));
  console.log(`Active albums: ${activeAlbums}`);
  console.log(`Duplicate albums: ${duplicateAlbums}`);
  console.log(`False positives: ${falsePositives.length}`);
  console.log(`Confirmed duplicates: ${confirmed.length}`);
  console.log(`Conflicts: ${conflicts.length}`);
  console.log(`Delete candidates: ${deletePlans.length}`);
  console.log(`Merge restores: ${actionableMergePlans(mergePlans).length}`);
  console.log(`Merge reviews: ${reviewMergePlans(mergePlans).length}`);

  for (const plan of falsePositives) printRestorePlan(plan, "RESTORE", pc.yellow);
  for (const plan of conflicts) printRestorePlan(plan, "CONFLICT", pc.red);
  printDeletePlans(deletePlans);

  for (const plan of mergePlans) {
    const color = plan.action === "review" ? pc.yellow : pc.green;
    console.log(color(`\n[MERGE:${plan.action}] ${plan.duplicatePath}`));
    console.log(`  to:  ${plan.targetPath}`);
    console.log(`  why: ${plan.reason}`);
  }

  printConflictAudits(conflictAudits);
}

type ConflictAudit = {
  status: "safe-delete" | "same-tracks-different-files" | "different-release" | "needs-review";
  duplicatePath: string;
  restorePath: string;
  duplicateFiles: number;
  targetFiles: number;
  matchedFiles: number;
  reason: string;
  metadataMatches: string[];
};

function countMatchedHashes(
  duplicateFiles: HashedMusicFile[],
  targetFiles: HashedMusicFile[],
): number {
  const targetCounts = new Map<string, number>();
  for (const file of targetFiles) {
    targetCounts.set(file.hash, (targetCounts.get(file.hash) ?? 0) + 1);
  }
  let matched = 0;
  for (const file of duplicateFiles) {
    const count = targetCounts.get(file.hash) ?? 0;
    if (count <= 0) continue;
    matched++;
    targetCounts.set(file.hash, count - 1);
  }
  return matched;
}

async function auditOneConflict(
  conflict: ReturnType<typeof planDuplicateRestores>[number],
): Promise<ConflictAudit> {
  const duplicateFiles = await collectMusicFileHashes(conflict.duplicatePath);
  const duplicateSizes = new Set(duplicateFiles.map((file) => file.size));
  const targetFiles = await collectMusicFileHashes(conflict.restorePath, duplicateSizes);
  const matchedFiles = countMatchedHashes(duplicateFiles, targetFiles);
  const isExactSubset = duplicateFiles.length > 0 && matchedFiles === duplicateFiles.length;
  const metadataMatches = isExactSubset
    ? []
    : await findMetadataMatches(conflict.duplicatePath, conflict.restorePath);
  const status: ConflictAudit["status"] = isExactSubset
    ? "safe-delete"
    : metadataMatches.length > 0
      ? "same-tracks-different-files"
      : "different-release";
  return {
    status,
    duplicatePath: conflict.duplicatePath,
    restorePath: conflict.restorePath,
    duplicateFiles: duplicateFiles.length,
    targetFiles: targetFiles.length,
    matchedFiles,
    reason: isExactSubset
      ? "all duplicate music files are byte-identical to files already under target"
      : metadataMatches.length > 0
        ? "track count and rounded durations match target album, but files differ"
        : "no byte-identical files and no target album with same duration fingerprint",
    metadataMatches,
  };
}

async function auditConflicts(
  conflicts: ReturnType<typeof planDuplicateRestores>,
): Promise<ConflictAudit[]> {
  const audits: ConflictAudit[] = [];
  for (const conflict of conflicts) {
    audits.push(await auditOneConflict(conflict));
  }
  return audits;
}

type MetadataFingerprint = {
  path: string;
  key: string;
};

type MergeConflictPlan = {
  action: "restore" | "restore-variant" | "review";
  duplicatePath: string;
  targetPath: string;
  reason: string;
};

function actionableMergePlans(plans: MergeConflictPlan[]): MergeConflictPlan[] {
  return plans.filter((plan) => plan.action === "restore" || plan.action === "restore-variant");
}

function reviewMergePlans(plans: MergeConflictPlan[]): MergeConflictPlan[] {
  return plans.filter((plan) => plan.action === "review");
}

async function planConflictMerges(
  conflicts: ReturnType<typeof planDuplicateRestores>,
): Promise<MergeConflictPlan[]> {
  const mergePlans: MergeConflictPlan[] = [];

  for (const conflict of conflicts) {
    const duplicateAlbums = await collectMetadataFingerprints(conflict.duplicatePath);
    const targetAlbums = await collectMetadataFingerprints(conflict.restorePath);
    const targetKeys = new Set(targetAlbums.map((album) => album.key));

    for (const duplicateAlbum of duplicateAlbums) {
      const relativeAlbumPath = path.relative(conflict.duplicatePath, duplicateAlbum.path);
      const targetPath = path.join(conflict.restorePath, relativeAlbumPath);

      if (targetKeys.has(duplicateAlbum.key)) {
        mergePlans.push({
          action: "review",
          duplicatePath: duplicateAlbum.path,
          targetPath,
          reason: "target subtree has same track-duration fingerprint but bytes differ",
        });
        continue;
      }

      if (!(await pathExists(targetPath))) {
        mergePlans.push({
          action: "restore",
          duplicatePath: duplicateAlbum.path,
          targetPath,
          reason: "leaf album missing under restore target",
        });
        continue;
      }

      mergePlans.push({
        action: "restore-variant",
        duplicatePath: duplicateAlbum.path,
        targetPath: await nextAvailablePath(`${targetPath} [duplicate-merge]`),
        reason: "leaf album target exists with different track-duration fingerprint",
      });
    }
  }

  return dedupeMergePlans(mergePlans);
}

function dedupeMergePlans(plans: MergeConflictPlan[]): MergeConflictPlan[] {
  const seen = new Set<string>();
  return plans.filter((plan) => {
    if (seen.has(plan.duplicatePath)) return false;
    seen.add(plan.duplicatePath);
    return true;
  });
}

async function nextAvailablePath(basePath: string): Promise<string> {
  if (!(await pathExists(basePath))) return basePath;
  for (let index = 2; index < 1000; index++) {
    const candidate = `${basePath} ${index}`;
    if (!(await pathExists(candidate))) return candidate;
  }
  throw new Error(`Could not find available target path for ${basePath}`);
}

async function findMetadataMatches(duplicatePath: string, restorePath: string): Promise<string[]> {
  const duplicateFingerprints = await collectMetadataFingerprints(duplicatePath);
  const targetFingerprints = await collectMetadataFingerprints(restorePath);
  const targetByKey = new Map<string, string[]>();

  for (const fingerprint of targetFingerprints) {
    const paths = targetByKey.get(fingerprint.key) ?? [];
    paths.push(fingerprint.path);
    targetByKey.set(fingerprint.key, paths);
  }

  return duplicateFingerprints.flatMap((fingerprint) => targetByKey.get(fingerprint.key) ?? []);
}

async function collectMetadataFingerprints(root: string): Promise<MetadataFingerprint[]> {
  const musicFiles = await collectMusicFilePaths(root);
  const albumRoots = new Map<string, string[]>();

  for (const filePath of musicFiles) {
    const albumRoot = inferAuditAlbumRoot(root, filePath);
    const files = albumRoots.get(albumRoot) ?? [];
    files.push(filePath);
    albumRoots.set(albumRoot, files);
  }

  const fingerprints: MetadataFingerprint[] = [];
  for (const [albumRoot, files] of albumRoots.entries()) {
    const durations: number[] = [];
    for (const filePath of files.sort()) {
      try {
        const metadata = await parseFile(filePath);
        durations.push(Math.round(metadata.format.duration ?? 0));
      } catch (_error) {
        durations.push(0);
      }
    }

    fingerprints.push({
      path: albumRoot,
      key: [durations.length, ...durations.sort((a, b) => a - b)].join(":"),
    });
  }

  return fingerprints;
}

async function collectMusicFilePaths(root: string): Promise<string[]> {
  const files: string[] = [];

  async function visit(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await visit(entryPath);
        continue;
      }
      if (entry.isFile() && isMusicFile(entry.name)) files.push(entryPath);
    }
  }

  await visit(root);
  return files.sort();
}

function inferAuditAlbumRoot(root: string, filePath: string): string {
  const fileDir = path.dirname(filePath);
  const relativeDir = path.relative(root, fileDir);
  const parts = relativeDir.split(path.sep).filter(Boolean);
  const first = parts[0];
  const second = parts[1];

  if (!first) return root;
  if (isDiscFolder(first)) return root;
  if (!second || isDiscFolder(second)) return path.join(root, first);
  return path.join(root, first, second);
}

type HashedMusicFile = {
  hash: string;
  size: number;
};

async function visitForHashes(
  dir: string,
  allowedSizes: ReadonlySet<number> | undefined,
  files: HashedMusicFile[],
): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await visitForHashes(entryPath, allowedSizes, files);
      continue;
    }
    if (!entry.isFile() || !isMusicFile(entry.name)) continue;
    const fileStat = await stat(entryPath).catch(() => undefined);
    if (!fileStat || (allowedSizes && !allowedSizes.has(fileStat.size))) continue;
    const content = await readFile(entryPath);
    files.push({ hash: createHash("sha256").update(content).digest("hex"), size: fileStat.size });
  }
}

async function collectMusicFileHashes(
  root: string,
  allowedSizes?: ReadonlySet<number>,
): Promise<HashedMusicFile[]> {
  const files: HashedMusicFile[] = [];
  await visitForHashes(root, allowedSizes, files);
  return files;
}

async function pathExists(targetPath: string): Promise<boolean> {
  return stat(targetPath)
    .then(() => true)
    .catch(() => false);
}

function assertInsideDuplicatesRoot(targetPath: string, duplicatesRoot: string): void {
  const resolvedTarget = path.resolve(targetPath);
  const resolvedRoot = path.resolve(duplicatesRoot);
  const relativeTarget = path.relative(resolvedRoot, resolvedTarget);
  if (relativeTarget.startsWith("..") || path.isAbsolute(relativeTarget) || relativeTarget === "") {
    throw new Error(`Refusing to delete outside duplicate tree: ${targetPath}`);
  }
}

async function pruneEmptyDirectories(root: string, duplicatesRoot: string): Promise<void> {
  assertInsideDuplicatesRoot(root, duplicatesRoot);
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (entry.isDirectory())
      await pruneEmptyDirectories(path.join(root, entry.name), duplicatesRoot);
  }
  await rm(root, { recursive: false }).catch(() => undefined);
}

function isMusicFile(name: string): boolean {
  return /\.(flac|mp3|m4a|wav|ogg|wv)$/i.test(name);
}

function isRange(part: string | undefined): boolean {
  return Boolean(part && /^(?:A-D|E-F|G-I|J-M|N-Q|R-T|U-Z)$/.test(part));
}

function isDiscFolder(part: string | undefined): boolean {
  return Boolean(part && /^(?:disc|cd|vol|volume|part|side|record|lp)\.?\s*\d*$/i.test(part));
}

export default function musicDuplicateRestoreCommand(program: Command): void {
  program
    .command("music-duplicate-restore")
    .description("Restore albums from _duplicates when no active duplicate remains")
    .option("--root <path>", "Music library root", NAS_PATHS.flac)
    .option("--duplicates-root <path>", "Duplicate tree root")
    .option("--max-depth <number>", "Traversal depth", "8")
    .option("--apply", "Actually restore false positives", false)
    .option("--audit-conflicts", "Hash conflict folders against existing targets", false)
    .option("--delete-confirmed", "Delete confirmed duplicate folders from _duplicates", false)
    .option(
      "--merge-conflicts",
      "Restore leaf albums from conflict folders into existing targets",
      false,
    )
    .option("--no-restore-false-positives", "Skip restore actions when applying deletes")
    .option(
      "--delete-safe-conflicts",
      "Delete conflict folders whose music files are byte-identical under the target",
      false,
    )
    .option("--json", "Print JSON report", false)
    .action(async (options: Record<string, unknown>) => {
      const result = await parseWith(
        optionsSchema,
        options,
        "Invalid music-duplicate-restore options",
      ).asyncAndThen(run);

      result.match(
        () => undefined,
        (error) => {
          logError(`Music duplicate restore failed: ${formatError(error)}`);
          process.exit(1);
        },
      );
    });
}
