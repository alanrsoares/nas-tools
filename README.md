# NAS Tools - Node.js Scripts

This directory contains Node.js scripts for managing and organizing music files on the NAS.

## Scripts

### fix-unsplit-cue.ts

Scans directories for unsplit CUE/FLAC file pairs and provides an interactive interface to split them using bash functions.

**Usage:**

```bash
npm run fix-unsplit-cue <folder_path>
# or
npx tsx scripts/fix-unsplit-cue.ts <folder_path>
```

**Features:**

- Recursively scans directories for CUE/FLAC pairs
- Interactive confirmation before processing
- Uses bash functions for splitting and cleanup
- Fail-fast error handling
- Detailed progress reporting

### move-completed.ts

Monitors the Transmission download completion directory and automatically organizes completed music downloads into the appropriate FLAC library structure.

**Usage:**

```bash
npm run move-completed [options]
# or
npx tsx scripts/move-completed.ts [options]
```

**Options:**

- `--source-dir <path>` - Source directory to monitor (default: `/volmain/Download/Transmission/complete/`)
- `--target-dir <path>` - Target FLAC library directory (default: `/volmain/Public/FLAC/`)
- `--backup-dir <path>` - Backup directory (default: `/volmain/Download/Transmission/backup/`)
- `--dry-run` - Preview changes without making them
- `--interactive` - Prompt for artist name when inference fails
- `--help` - Show help message

**Features:**

- Artist name inference from folder names and metadata
- Automatic alphabetical subfolder organization (A-D, E-F, G-I, J-M, N-Q, R-T, U-Z)
- Conflict resolution for duplicate albums
- Backup creation before moving files
- Interactive mode for manual artist name input
- Dry-run mode for safe testing
- Comprehensive error handling and logging

**Examples:**

```bash
# Basic usage with default paths
npm run move-completed

# Custom directories with dry-run
npm run move-completed -- --dry-run --source-dir /path/to/downloads --target-dir /path/to/music

# Interactive mode for manual artist name input
npm run move-completed -- --interactive
```

## Dependencies

- **zx**: Shell command execution and script running
- **inquirer**: Interactive command-line prompts
- **music-metadata**: Reading music file metadata
- **tiny-invariant**: Runtime assertions
- **tsx**: TypeScript execution

## Installation

```bash
npm install
```

## Development

The scripts are written in TypeScript and use tsx for execution. To run them during development:

```bash
npx tsx scripts/script-name.ts [arguments]
```

## Documentation

Each script has detailed documentation in its corresponding `.md` file:

- [fix-unsplit-cue.md](scripts/fix-unsplit-cue.md)
- [move-completed.md](scripts/move-completed.md)
