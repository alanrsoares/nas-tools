# NAS Tools - Node.js Scripts

This directory contains Node.js scripts for managing NAS tools, specifically for handling CUE/FLAC file operations.

## Scripts

### fix-unsplit-cue.ts

A TypeScript script that scans directories for unsplit CUE/FLAC pairs and delegates the splitting and cleanup to the bash functions in `../bash/functions.sh`.

#### Features

- Scans a given folder recursively for CUE/FLAC file pairs
- Identifies files that are not yet split (single FLAC file with matching CUE file)
- Delegates splitting and cleanup to the bash `split_cue_flac` function
- Provides a summary and confirmation prompt before processing
- Serial processing with fail-fast behavior

#### Prerequisites

The following tools must be installed on the system:

- `flac` - FLAC encoder
- `cuebreakpoints` - From cuetools package
- `shnsplit` - From shntool package
- `cuetag` - From cuetools package (optional, for metadata tagging)

The script also requires Node.js dependencies which are automatically installed via npm.

#### Usage

```bash
# Run the script
npm run fix-unsplit-cue <folder_path>

# Example
npm run fix-unsplit-cue /path/to/music/collection
```

#### How it works

1. **Scanning**: The script recursively scans the given directory for folders containing matching CUE and FLAC files
2. **Detection**: It identifies pairs where the CUE file name matches the FLAC file name (without extension)
3. **Validation**: It checks if the directory is already split (multiple FLAC files indicate it's already processed)
4. **Confirmation**: Displays a summary of found pairs and prompts for user confirmation
5. **Processing**: For each pair (stops on first failure):
   - Changes to the directory containing the files
   - Sources the bash functions from `../bash/functions.sh`
   - Calls `split_cue_flac` with the CUE file path
   - The bash function handles splitting, tagging, and prompted cleanup
   - **If any step fails, processing stops immediately**
6. **Summary**: Displays a final summary of successful and failed operations, including skipped files

#### Example Output

```
🔍 Scanning '/path/to/music' for unsplit cue/flac pairs...

📋 Found 3 unsplit cue/flac pairs:

📂 Directory: /path/to/music/album1
  📁 CUE: album1.cue
  🎵 FLAC: album1.flac

📂 Directory: /path/to/music/album2
  📁 CUE: album2.cue
  🎵 FLAC: album2.flac

📂 Directory: /path/to/music/album3
  📁 CUE: album3.cue
  🎵 FLAC: album3.flac

? Do you want to proceed with splitting these files? (Y/n)

🔄 Processing files...

🔄 Processing: album1.cue
✅ Done. Split tracks are in: __temp_split

🧹 Do you want to cleanup original files and move split tracks to original directory? (y/N): y
✅ Done. Split tracks are in original directory, original files removed.
✅ Successfully processed: album1.cue

🔄 Processing: album2.cue
❌ Failed to process album2.cue: Split failed
🛑 Stopping processing due to failure.

📊 Summary:
✅ Successfully processed: 1
❌ Failed: 1
📁 Total: 3
⏭️ Skipped: 1 remaining files
```

#### Error Handling

- **File System Errors**: Handles permission issues and missing files gracefully
- **Split Failures**: **Stops processing on first failure** to prevent cascading errors
- **File Encoding Issues**: Properly handles filenames with special characters using zx's automatic shell escaping
- **File Validation**: Validates that files exist and are readable before attempting to process them
- **Process Directory Changes**: Handles failures when changing working directories during processing
- **Fail-Fast Behavior**: Stops processing immediately when any file fails to prevent data corruption

#### Technical Details

- Built with TypeScript and uses the `zx` library for shell interactions
- Uses `inquirer.js` for user-friendly prompts and confirmations
- **Bash Integration**: Delegates all splitting and cleanup logic to `../bash/functions.sh`
- Compatible with BusyBox containers (uses minimal shell commands)
- Uses async/await for all file system and shell operations
- Provides detailed error messages and progress indicators
- **Serial Processing**: Processes files one at a time to avoid conflicts and resource issues
- **Automatic Shell Escaping**: Uses zx's built-in shell escaping for special characters
- **File Validation**: Validates file existence and readability before processing

#### Installation

```bash
# Install dependencies
npm install

# The script is ready to use
npm run fix-unsplit-cue <folder_path>
```
