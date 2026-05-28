import { ResultAsync } from "@onrails/result";

import type { fail } from "../fp.js";
import { pathExists, printReport } from "../report.js";
import { cleanTempSplitAtRoot, emptyTempSplitCleanReport } from "./clean.js";
import { buildReport, buildTempSplitReport, emptyReport, emptyTempSplitReport } from "./reports.js";
import { groupCueDirectories, scanCueDirectories, scanTempSplitDirectories } from "./scan.js";
import { checkTools } from "./tools.js";
import type { CueCleanOptions, CueCommandOptions } from "./types.js";

export function runCueTriage(
  options: CueCommandOptions,
): ResultAsync<void, ReturnType<typeof fail>> {
  return ResultAsync.fromSafePromise(
    (async () => {
      if (!(await pathExists(options.root))) {
        printReport(emptyReport(options.root), options.json);
        return;
      }

      const [tools, scans] = await Promise.all([
        checkTools(),
        scanCueDirectories(options.root, options.maxDepth),
      ]);
      const groups = groupCueDirectories(scans);
      const report = buildReport(options.root, tools, groups, options.limit, options.includeFiles);

      printReport(report, options.json);
    })(),
  );
}

export function runTempSplitTriage(
  options: CueCommandOptions,
): ResultAsync<void, ReturnType<typeof fail>> {
  return ResultAsync.fromSafePromise(
    (async () => {
      if (!(await pathExists(options.root))) {
        printReport(emptyTempSplitReport(options.root), options.json);
        return;
      }

      const groups = await scanTempSplitDirectories(options.root, options.maxDepth);
      const report = buildTempSplitReport(
        options.root,
        groups,
        options.limit,
        options.includeFiles,
      );

      printReport(report, options.json);
    })(),
  );
}

export function runTempSplitClean(
  options: CueCleanOptions,
): ResultAsync<void, ReturnType<typeof fail>> {
  return ResultAsync.fromSafePromise(
    (async () => {
      if (!(await pathExists(options.root))) {
        printReport(emptyTempSplitCleanReport(options.root, options.dryRun), options.json);
        return;
      }

      const report = await cleanTempSplitAtRoot(options);
      printReport(report, options.json);

      if (report.stats.failed > 0) {
        process.exitCode = 1;
      }
    })(),
  );
}
