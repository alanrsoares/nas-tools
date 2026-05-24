# NAS Tools Cockpit Plan

NAS Tools Cockpit is a LAN-accessible, no-auth v1 workspace for operating NAS Tools workflows. It is a fully integrated cockpit, not a thin web wrapper around terminal commands.

## Decisions

- First workflow: `move-completed`.
- First workflow includes real file operations behind Dry Run and Confirmation.
- Users can edit the Move Plan before Confirmation, including manual artist correction and item exclusion.
- Backup is mandatory before real moves.
- CUE splitting is a default-on toggle; Dry Run reports planned split work only.
- No extra cleanup workflow in v1.
- One active file-operation Job globally.
- Job cancellation is cooperative: queued jobs can cancel immediately, running jobs stop before the next item, and no rollback is attempted.
- CLI behavior remains broadly compatible, with stable command flags/defaults and no intentional breaking changes.
- If CLI breaking changes become necessary, update the `transmission-sorter` skill in the same change because it depends on `nas-tools move-completed --yes`, download commands, env loading, backup behavior, and bucket names.

## Architecture

- Root becomes a Bun workspace.
- Packages:
  - `@nas-tools/core`: shared workflows, schemas, domain types, and Result pipelines.
  - `@nas-tools/cli`: Commander CLI and compatibility bin.
  - `@nas-tools/server`: Elysia API, Drizzle persistence, jobs, SSE, and production static serving.
  - `@nas-tools/web`: Vite React Cockpit with shadcn components.
- Server stack: Elysia + Eden/Treaty + Drizzle + SQLite.
- Web stack: Vite + React + TanStack Router + TanStack Query + shadcn.
- TanStack Query wraps Eden calls.
- Forms use plain React state by default; TanStack Form + Zod only for complex forms.
- Local React state first; no TanStack Store in v1.
- Production server serves built Vite assets and API from one process.
- Development uses one `bun run dev` that starts Elysia and Vite as two processes.
- Default server bind: `HOST=0.0.0.0`, `PORT=8788`.
- Default database path: `~/.local/share/nas-tools/cockpit.sqlite`, overridable by `NAS_TOOLS_DB_PATH`.
- Checked-in Drizzle migrations auto-run on server startup.
- Eden-only API in v1; no OpenAPI generation.

## Railway-Oriented Domain Design

Core workflows follow Railway Oriented Programming:

- Core functions return `Result` or `ResultAsync`; business logic does not throw.
- Async fallible functions return `ResultAsync`, not `Promise<Result>`.
- IO exceptions are mapped at boundaries into tagged domain errors.
- `Maybe` represents expected absence, such as an artist that has not been inferred yet.
- Required absence converts explicitly into `Result` errors.
- Validation returns structured issues and accumulates row/path issues where useful.
- API handlers terminate pipelines and convert results/errors into DTOs.
- UI renders structured domain errors; it does not parse log strings.

Example pipeline:

```ts
scanStagingArea(config)
  .andThen(classifyMediaItems)
  .andThen(inferMovePlan)
  .andThen(validateCorrections)
  .andThen(confirmMovePlan)
  .andThen(enqueueJob);
```

## Persistence

Use SQLite with Drizzle and drizzle-kit.

Schema shape:

- `settings`: saved NAS Path Configuration.
- `move_plans`: id, status, createdAt, updatedAt, config snapshot.
- `move_plan_items`: id, planId, status, mediaType, sourcePath, targetPath, artistName, albumName, isNewArtist, included.
- `jobs`: id, type, status, planId, counts, timestamps.
- `job_events`: jobId, per-job seq, type, level, message, data JSON, createdAt.

Use UUID IDs via `crypto.randomUUID()`.

Use per-job integer `seq` for Job events.

Store both human `message` and structured `data` for Job events.

## Move Plan Lifecycle

- `scan` creates a persisted draft Move Plan.
- The draft Move Plan is editable in Cockpit.
- Confirmation performs strict all-or-nothing validation.
- Every selected source path must still exist at Confirmation.
- Target parent directories must exist or be creatable.
- Backup directory must be valid.
- Target conflicts are resolved before Confirmation and final target paths are frozen in the confirmed snapshot.
- If a selected item fails validation, Confirmation fails with row-level issues and no Job starts.
- Execution reads the confirmed snapshot only.
- If a target conflict appears after Confirmation but before execution, that item fails; the Job does not silently choose a new target.
- Execution continues past per-item failures.

## Status Vocabularies

Job status:

```ts
type JobStatus =
  | "queued"
  | "running"
  | "canceling"
  | "canceled"
  | "completed"
  | "completed_with_failures"
  | "failed"
  | "interrupted";
```

Move Plan item status:

```ts
type MovePlanItemStatus =
  | "included"
  | "excluded"
  | "needs_correction"
  | "invalid";
```

Media type remains compatible with the current CLI:

```ts
type MediaType = "tv" | "audiobook" | "music" | "movie";
```

## API Shape

Action-oriented REST through Elysia/Eden:

```txt
GET  /api/config
PUT  /api/config

POST /api/move-completed/scan
POST /api/move-completed/plans
GET  /api/move-completed/plans/:id
POST /api/move-completed/plans/:id/confirm

GET  /api/jobs
GET  /api/jobs/:id
GET  /api/jobs/:id/events
GET  /api/jobs/:id/events/stream
POST /api/jobs/:id/cancel
```

SSE is v1 transport for live Job events. Persisted event reads remain available for replay and fallback.

API/UI errors use structured issues:

```ts
type FieldIssue = {
  path: string[];
  code: string;
  message: string;
};

type DomainIssue = {
  code: string;
  message: string;
  itemId?: string;
  severity: "info" | "warning" | "error";
};
```

## Cockpit UI

Build a utilitarian shadcn app shell, not a landing page.

Routes:

- `Staging`: first working route for `move-completed`.
- `Jobs`: job history and live event view.
- `Settings`: NAS Path Configuration.

Staging view:

- Shows Download Staging Area scan results.
- Shows detected media type.
- Shows inferred artist and target path.
- Allows manual artist correction for music.
- Allows item exclusion.
- Shows warning/error badges.
- Shows CUE split toggle, default on.
- Requires Confirmation before file operations.

Settings:

- Save requires all configured paths already exist and are directories.
- Validation accumulates path errors.
- No implicit directory creation from Settings in v1.

## Milestone 1 Scope

Included:

- Workspace split.
- Core `move-completed` plan and execute pipeline.
- SQLite/Drizzle job and plan persistence.
- Elysia API for config, scan, plan, confirm, jobs, cancellation, and SSE events.
- Vite shadcn shell with Staging, Jobs, and Settings.
- Existing `move-completed` CLI remains working.
- Core/server tests and CLI compatibility smoke test.

Excluded:

- Prowlarr search.
- Music audit UI.
- Auth.
- Service installer.
- Manual target path editing.
- File-level progress.
- Cleanup workflow.

## Testing

- `@nas-tools/core`: unit tests for scan, classify, infer, Move Plan validation, and execution behavior using temp dirs.
- `@nas-tools/server`: integration tests for routes using temp SQLite DB and temp NAS paths.
- `@nas-tools/cli`: smoke test invoking built CLI for `move-completed --dry-run`.
- `@nas-tools/web`: defer E2E/component tests until UI complexity warrants adding a frontend test runner.

## ADRs

- [0001 Persist Cockpit Jobs With SQLite And Drizzle](./adr/0001-persist-cockpit-jobs-with-sqlite-and-drizzle.md)
- [0002 Build Cockpit With Elysia Eden And Vite](./adr/0002-build-cockpit-with-elysia-eden-and-vite.md)
- [0003 Split Cockpit Into Workspace Packages](./adr/0003-split-cockpit-into-workspace-packages.md)

## Open Questions

- Exact root script names and build output paths.
- Whether `@nas-tools/cli` keeps `dist/cli/index.js` compatibility wrapper or moves to `dist/index.js` with root shim.
- Whether Cockpit Settings should support multiple named NAS profiles later.
- Whether no-auth LAN mode should become an ADR if it persists beyond v1.
