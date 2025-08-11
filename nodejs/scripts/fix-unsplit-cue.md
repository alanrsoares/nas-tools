# Fix Unsplit CUE Files Script

## Overview

This script scans directories for unsplit CUE/Audio file pairs (FLAC or WAV) and provides an interactive interface to split them using bash functions.

## Usage

```bash
tsx fix-unsplit-cue.ts <folder_path>
```

## Arguments

- `folder_path` (required): The root directory to scan for unsplit CUE/Audio pairs

## How It Works

### 1. Directory Scanning

The script recursively scans the specified folder and its subdirectories to find CUE/Audio file pairs that meet the following criteria:

- A `.cue` file exists with a matching audio file (same basename)
- Supported audio formats: `.flac` and `.wav`
- Both files are in the same directory
- The files are accessible and readable

### 2. Interactive Confirmation

Before processing any files, the script:

- Displays a summary of all found CUE/Audio pairs
- Shows the directory path, CUE filename, and audio filename for each pair
- Prompts for user confirmation to proceed with splitting

### 3. File Processing

For each confirmed pair, the script:

- Changes to the target directory
- Sources the bash functions from `/home/admin/dev/nas-tools/bash/functions.sh`
- Executes the `split_cue_audio` bash function on the CUE file
- Prompts for cleanup confirmation to remove original files and move split tracks
- If cleanup is confirmed, runs the `cleanup_temp_split` bash function

### 4. Safety Features

- **Fail-fast behavior**: Stops processing on the first failure
- **Individual file confirmation**: Prompts for confirmation before processing each file
- **Directory contents display**: Shows folder contents before processing each pair
- **Error handling**: Gracefully handles inaccessible directories and file operations

## Dependencies

- **zx**: For shell command execution and script running
- **inquirer**: For interactive command-line prompts
- **fs/promises**: For file system operations
- **path**: For path manipulation
- **tiny-invariant**: For runtime assertions

## Bash Functions

The script relies on bash functions defined in `/home/admin/dev/nas-tools/bash/functions.sh`:

- `split_cue_audio`: Handles the actual splitting of CUE/Audio files (FLAC or WAV)
- `cleanup_temp_split`: Cleans up original files and moves split tracks

## Supported Audio Formats

- **FLAC** (`.flac`): Lossless audio compression
- **WAV** (`.wav`): Uncompressed audio format

The script automatically detects the audio format and uses the appropriate processing method.

## Output

The script provides detailed console output including:

- Scanning progress and results
- File pair summaries
- Processing status for each file
- Final summary with success/failure counts
- Error messages for failed operations

## Error Handling

- Invalid or non-existent directory paths
- Inaccessible directories during scanning
- Failed file operations during processing
- Missing or corrupted CUE/Audio files
- Bash function execution failures

## Exit Codes

- `0`: Successful execution (all files processed or user cancelled)
- `1`: Error occurred during processing (fail-fast behavior)
