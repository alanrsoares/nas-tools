# Move Completed Downloads Script

## Overview

This script monitors the Transmission download completion directory and automatically organizes completed music downloads into the appropriate FLAC library structure. It handles artist name inference, folder organization, and maintains the alphabetical subfolder structure.

## Usage

```bash
zx move-completed.ts [options]
```

## Arguments

- `--source-dir` (optional): Source directory to monitor (default: `/volmain/Download/Transmission/complete/`)
- `--target-dir` (optional): Target FLAC library directory (default: `/volmain/Public/FLAC/`)
- `--dry-run` (optional): Preview changes without making them
- `--interactive` (optional): Prompt for artist name when inference fails

## How It Works

### 1. Directory Monitoring

The script scans the specified source directory for new folder entries that represent completed downloads. It identifies folders that contain music files (FLAC, MP3, etc.) and determines if they represent albums.

### 2. Artist Name Inference

For each identified album folder, the script attempts to infer the artist name using multiple strategies:

- **Folder name parsing**: Extract artist name from common naming patterns
- **Metadata extraction**: Read artist information from music files
- **User prompting**: When inference fails, prompt the user for the correct artist name
- **Pattern matching**: Use common music naming conventions

### 3. Target Directory Determination

Based on the inferred artist name, the script determines the appropriate subfolder using the alphabetical range system:

- **A-D**: Artists starting with A, B, C, or D
- **E-F**: Artists starting with E or F
- **G-I**: Artists starting with G, H, or I
- **J-M**: Artists starting with J, K, L, or M
- **N-Q**: Artists starting with N, O, P, or Q
- **R-T**: Artists starting with R, S, or T
- **U-Z**: Artists starting with U, V, W, X, Y, or Z

### 4. File Organization

The script organizes the files according to the following rules:

- **New artist**: Creates a new artist folder in the appropriate alphabetical subfolder
- **Existing artist**: Adds the album to the existing artist folder
- **Conflict resolution**: Handles naming conflicts and duplicate albums
- **Metadata preservation**: Maintains file metadata and structure

### 5. Safety Features

- **Dry-run mode**: Preview all changes before execution
- **Backup creation**: Create backups of original files before moving
- **Conflict detection**: Identify and handle naming conflicts
- **Error recovery**: Graceful handling of file operation failures
- **Logging**: Detailed logging of all operations

## Dependencies

- **zx**: For shell command execution and script running
- **inquirer**: For interactive command-line prompts
- **fs/promises**: For file system operations
- **path**: For path manipulation
- **music-metadata**: For reading music file metadata
- **tiny-invariant**: For runtime assertions

## Configuration

The script uses the following default paths:

- **Source directory**: `/volmain/Download/Transmission/complete/`
- **Target directory**: `/volmain/Public/FLAC/`
- **Backup directory**: `/volmain/Download/Transmission/backup/`

## Artist Name Inference Strategies

### 1. Folder Name Patterns

The script recognizes common naming patterns:

- `Artist - Album (Year)` → Artist: "Artist"
- `Artist/Album` → Artist: "Artist"
- `Artist - Album` → Artist: "Artist"
- `Artist_Album` → Artist: "Artist"

### 2. Metadata Extraction

When folder name inference fails, the script:

- Scans for music files (FLAC, MP3, etc.)
- Extracts artist metadata from the first valid file
- Uses the most common artist name if multiple files exist

### 3. User Interaction

When both strategies fail:

- Displays folder contents and naming patterns
- Prompts user for the correct artist name
- Offers suggestions based on folder structure
- Allows manual correction and confirmation

## Output

The script provides detailed console output including:

- Scanning progress and results
- Artist name inference attempts
- Target directory calculations
- File operation status
- Conflict resolution details
- Final summary with success/failure counts

## Error Handling

- Invalid or non-existent directories
- Permission denied errors
- File system space issues
- Corrupted music files
- Metadata extraction failures
- Naming conflicts and duplicates

## Exit Codes

- `0`: Successful execution (all files processed or user cancelled)
- `1`: Error occurred during processing
- `2`: Configuration or dependency error

## Examples

### Basic Usage

```bash
zx move-completed.ts
```

### Custom Directories

```bash
zx move-completed.ts --source-dir /path/to/downloads --target-dir /path/to/music
```

### Dry Run Mode

```bash
zx move-completed.ts --dry-run
```

### Interactive Mode

```bash
zx move-completed.ts --interactive
```
