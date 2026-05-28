# AGENTS.md

Guidance for coding agents working in this repo. Keep changes small, typed, and verified against the CLI behavior.

## Project Shape

- This is a Bun + TypeScript ESM CLI. Source lives under `cli/`; compiled output lives under `dist/`.
- The public executable is `dist/cli/index.js`. Tests should invoke that path, not `dist/cli`, because stale legacy build artifacts may also exist under `dist/`.
- Commands are auto-discovered from `cli/commands/*` by `cli/index.ts`; command modules should default-export a registration function that accepts a Commander `Command`.
- `bash/functions.sh` is an operational helper used by `fix-unsplit-cue`. Do not hard-code user-specific absolute paths to it. Use package-relative lookup or `NAS_TOOLS_BASH_FUNCTIONS_PATH`.

## Functional Error Style

- Prefer railway-style workflows inside command implementations:
  - Use `Result` / `ResultAsync` from `@onrails/result` for fallible logic (`asyncAfter` / `runParsedCommand` in `cli/lib/fp.ts` lift sync `Result` into `ResultAsync` at command boundaries).
  - Prefer `pipe` / `flow` from `@onrails/result` and `@onrails/result/pipe` for multi-step sync pipelines and reusable parsers (see onrails `RECIPES.md`).
  - Use helpers in `cli/lib/fp.ts` (`safe`, `safeAsync`, `parseWith`, `fail`, `formatError`) instead of ad hoc `try/catch`.
  - Use `Maybe` from `@onrails/maybe` for optional values when absence is part of normal control flow.
  - Use `@onrails/pattern` for multi-branch domain decisions where it improves clarity.
- Keep `process.exit` and `process.exitCode` at the Commander action boundary or final command outcome boundary. Inner functions should return typed results, not terminate the process.
- Avoid mixing raw thrown errors, `null`, and booleans into new command pipelines unless interacting with existing Node/Bun APIs. Convert those boundaries into typed results early.
- Zod parsing should happen at CLI boundaries through `parseWith`. Avoid unsafe transforms that can produce `NaN`; prefer `z.coerce.number().int()` plus bounds.

## NAS Safety

- Treat file moves, deletes, cue splitting, and cleanup as high-risk. Preserve dry-run behavior where it exists.
- Do not make broad filesystem changes outside the user-provided source/target paths.
- For downloads, never trust remote filenames directly. Keep path sanitization and `path.join`; reject or strip path separators.
- For library organization, preserve current behavior of continuing past per-album failures unless the command already intentionally fails fast.

## Tests And Verification

- Run `bun run build` after TypeScript changes.
- Run `bun test` before finishing. The package script intentionally targets `cli` tests, but a direct `bun test` may still discover old tests in `dist`; make sure the final command you report is the one you ran.
- Snapshot tests must not bake in machine-specific absolute paths. Normalize dynamic paths in tests.
- The download tests hit the network. If they fail from DNS/network instability, report that clearly rather than weakening the command behavior.

## Dependency And Artifact Hygiene

- Dependency upgrades are acceptable when requested, but keep `package.json` and `bun.lock` consistent by running `bun install`.
- Do not edit generated `dist/` files manually. Build output can change via `bun run build`, but source changes belong in `cli/`.
- Avoid adding new abstraction libraries; this repo already standardizes on `@onrails/result`, `@onrails/maybe`, `@onrails/pattern`, and `zod`.

## Git

- Preserve unrelated user changes. Check `git status --short` before committing.
- If asked to commit, use a normal commit message with no co-author trailers unless explicitly requested.
