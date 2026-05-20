---
name: nas-tools
description: Use when operating or extending the local nas-tools CLI for Transmission downloads, Plex library hygiene, FLAC/CUE workflows, NAS housekeeping, or ADM/Entware diagnostics. Also use when a user asks to sort downloads, clean Transmission, audit music, split CUE files, or add a nas-tools command.
---

# nas-tools

Use this repo as the source of truth for NAS automation. The CLI is Bun + TypeScript ESM. Source lives in `cli/`; generated output lives in `dist/`.

## Consumer Commands

- `nas-tools move-completed --yes`: move completed Transmission downloads into Plex library folders. Must back up before moving or deleting originals.
- `nas-tools downloads triage --json`: inspect complete/incomplete Transmission folders for stale work, junk, and import candidates.
- `nas-tools downloads clean-transmission --dry-run --json`: list completed Transmission torrent records whose files are no longer in the complete folder.
- `nas-tools downloads clean-transmission --no-dry-run --yes`: remove those torrent records from Transmission with local-data deletion disabled.
- `nas-tools plex scan-music`: trigger a Plex refresh for the music library section.
- `nas-tools plex scan-music --dry-run --json`: preview the selected Plex music section without triggering a scan.
- `nas-tools music-audit --json`: audit FLAC library structure and import hygiene.
- `nas-tools cue triage --json`: classify CUE/audio folders before splitting.
- `nas-tools cue temp-split clean --no-dry-run --yes`: remove only safe empty `__temp_split` leftovers.
- `nas-tools doctor --json`: report NAS path and prerequisite status.

## Safety Rules

- Treat moves, deletes, CUE splitting, and torrent cleanup as high-risk.
- Prefer dry-run first. Mutating cleanup commands require explicit confirmation flags such as `--yes` and often `--no-dry-run`.
- Transmission cleanup must remove torrent records only, not library data. Use `delete-local-data=false` in RPC calls.
- Do not hard-code secrets. For Transmission RPC, prefer `TRANSMISSION_RPC_USERNAME` and `TRANSMISSION_RPC_PASSWORD`; CLI flags may override for one-off runs.
- Preserve user/library files unless the command explicitly backs them up or proves they are safe cleanup candidates.

## Development Workflow

- Add commands under `cli/commands/`; command modules default-export a function accepting Commander `Command`.
- Keep command logic typed and testable. Export pure helpers for path mapping, classification, and safety decisions.
- Use `Result` / `ResultAsync` plus helpers in `cli/lib/fp.ts` for fallible workflows.
- Use `printReport` from `cli/lib/report.ts` for JSON/human report output.
- Run `bun run build` after TypeScript edits.
- Run `bun test` before finishing.
