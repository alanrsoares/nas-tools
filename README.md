# NAS Tools CLI

A command-line interface for managing music files, downloads, and file operations on your NAS.

## Installation

### Local Development Installation

#### Using npm (Recommended)

```bash
# Clone the repository
git clone <repository-url>
cd nas-tools

# Install dependencies
npm install

# Build the project
npm run build

# Install globally
npm install -g .
```

#### Using Bun

```bash
# Clone the repository
git clone <repository-url>
cd nas-tools

# Install dependencies
bun install

# Build the project
bun run build

# Option 1: Install globally with npm (most reliable)
npm install -g .

# Option 2: Use Bun's link feature for development
bun link
```

### Usage

After installation, you can use the `nas-tools` command:

```bash
# Show help
nas-tools --help

# Show available commands
nas-tools --help
```

## Commands

### dir-tree

Generate a tree view of a directory structure.

```bash
nas-tools dir-tree [path] [options]
```

**Options:**

- `-d, --max-depth <number>` - Maximum depth to traverse (default: "Infinity")
- `-H, --show-hidden` - Show hidden files and directories
- `-f, --show-files` - Show files (default: true)
- `-e, --exclude <patterns...>` - Exclude files/directories matching patterns

**Example:**

```bash
nas-tools dir-tree /path/to/directory --max-depth 3 --show-hidden
```

### download

Download a file from a URL.

```bash
nas-tools download <url> [options]
```

**Options:**

- `-d, --dest <path>` - Destination directory (default: "/volmain/Download/ignore")
- `-r, --referer <url>` - Referer header
- `-c, --cookie <string>` - Cookie header
- `-u, --ua <string>` - User-Agent header
- `--retries <number>` - Number of retries (default: "3")
- `--timeout <ms>` - Timeout in milliseconds (default: "30000")

**Example:**

```bash
nas-tools download https://example.com/file.zip --dest ./downloads --retries 5
```

### fix-unsplit-cue

Scan for unsplit CUE/Audio pairs (FLAC/WAV) and split them using bash functions.

```bash
nas-tools fix-unsplit-cue <folder_path> [options]
```

**Options:**

- `--dry-run` - Preview pairs without splitting files
- `-i, --ignore-failed` - Skip directories that contain an empty \_\_temp_split folder
- `-y, --yes` - Assume "yes" to all confirmations

**Example:**

```bash
nas-tools fix-unsplit-cue /path/to/music --yes
```

### move-completed

Monitor Transmission download completion directory and organize completed music downloads into the music library structure.

```bash
nas-tools move-completed [options]
```

**Options:**

- `-s, --source-dir <path>` - Source directory to monitor (default: "/volmain/Download/Transmission/complete/")
- `-t, --target-dir <path>` - Target music library directory (default: "/volmain/Public/FLAC/")
- `-b, --backup-dir <path>` - Backup directory (default: "/volmain/Download/Transmission/backup/")
- `--dry-run` - Preview changes without making them
- `-i, --interactive` - Prompt for artist name when inference fails

**Example:**

```bash
nas-tools move-completed --dry-run --interactive
```

Move operations refuse to mutate the source if the backup cannot be created first. Existing backup names are preserved by creating a numbered backup folder.

### doctor

Report ADM/Entware paths, app prerequisites, and tool availability.

```bash
nas-tools doctor [--json]
```

### downloads triage

Inspect completed/incomplete download folders for stale work, junk files, and large music-pack import candidates.

```bash
nas-tools downloads triage [--json] [--stale-days 14]
```

### downloads clean-transmission

Remove completed Transmission torrent records whose files have already been moved out of the complete folder. Defaults to dry-run. Removal requires `--no-dry-run --yes` and never deletes local data from Transmission.

```bash
nas-tools downloads clean-transmission --dry-run --json
nas-tools downloads clean-transmission --no-dry-run --yes
```

Use `TRANSMISSION_RPC_PASSWORD` or `--password` for authenticated RPC.

### music-audit

Audit the FLAC library for CUE/audio pairs, empty folders, Apple metadata junk, and likely alphabet-bucket mistakes.

```bash
nas-tools music-audit [--json] [--root /volume1/Public/FLAC]
```

### cue triage

Classify CUE/audio directories before splitting.

```bash
nas-tools cue triage [--json] [--root /volume1/Public/FLAC] [--max-depth 4] [--limit 25] [--include-files]
```

### cue temp-split triage

Classify `__temp_split` leftovers before retrying or cleaning failed splits.

```bash
nas-tools cue temp-split triage [--json] [--root /volume1/Public/FLAC] [--max-depth 4] [--limit 25] [--include-files]
```

### cue temp-split clean

Remove only empty `__temp_split` directories. Defaults to dry-run; deletion requires both `--no-dry-run` and `--yes`.

```bash
nas-tools cue temp-split clean [--json] [--root /volume1/Public/FLAC]
nas-tools cue temp-split clean --no-dry-run --yes
```

### nas clean

Find safe cleanup candidates. Defaults to dry-run; deletion requires both `--no-dry-run` and `--yes`.

```bash
nas-tools nas clean [--json] [--root /volume1/Download]
nas-tools nas clean --no-dry-run --yes [--backup-dir /volume1/Download/Transmission/backup/nas-clean]
```

Deletion candidates are copied to the backup directory before removal. If the backup copy fails, that candidate is skipped.

## Development

### Building

```bash
npm run build
```

### Development Mode

```bash
npm run dev
```

### Scripts

The original scripts are still available for direct execution:

```bash
npm run fix-unsplit-cue
npm run move-completed
npm run dir-tree
npm run download
```

## Requirements

- Node.js 18+
- npm or bun
- TypeScript 5.9+

## License

ISC
