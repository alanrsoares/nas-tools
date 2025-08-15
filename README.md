# NAS Tools CLI

A command-line interface for managing music files, downloads, and file operations on your NAS.

## Installation

### Local Development Installation

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
