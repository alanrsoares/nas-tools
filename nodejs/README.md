# NAS Tools - Node.js Scripts

This directory contains Node.js scripts for managing NAS tools, specifically for handling CUE/FLAC file operations.

## Scripts

### fix-unsplit-cue.ts

A TypeScript script that scans directories for unsplit CUE/FLAC pairs and automatically splits them into individual tracks.

#### Features

- Scans a given folder recursively for CUE/FLAC file pairs
- Identifies files that are not yet split (single FLAC file with matching CUE file)
- Splits the FLAC file into individual tracks using the CUE sheet
- Automatically cleans up the original files after successful splitting
- Provides a summary and confirmation prompt before processing

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
5. **Processing**: For each pair:
   - Creates a temporary `__temp_split` directory
   - Splits the FLAC file using `cuebreakpoints` and `shnsplit`
   - Tags the split files with metadata using `cuetag` (if available)
   - Moves the split CUE file to the original directory
   - Removes the original CUE and FLAC files
   - Cleans up the temporary directory
6. **Summary**: Displays a final summary of successful and failed operations

#### Example Output

```
🔍 Checking dependencies...
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

🔄 Splitting 'album1.flac' using 'album1.cue'...
🏷️ Tagged split tracks with metadata
✅ Successfully processed: album1.cue

🔄 Splitting 'album2.flac' using 'album2.cue'...
🏷️ Tagged split tracks with metadata
✅ Successfully processed: album2.cue

🔄 Splitting 'album3.flac' using 'album3.cue'...
🏷️ Tagged split tracks with metadata
✅ Successfully processed: album3.cue

📊 Summary:
✅ Successfully processed: 3
❌ Failed: 0
📁 Total: 3
```

#### Error Handling

- **Missing Dependencies**: The script checks for required tools and exits with an error if any are missing
- **File System Errors**: Handles permission issues and missing files gracefully
- **Split Failures**: Continues processing other files even if one fails
- **Cleanup Failures**: Reports cleanup errors but doesn't stop the entire process

#### Technical Details

- Built with TypeScript and uses the `zx` library for shell interactions
- Uses `inquirer.js` for user-friendly prompts and confirmations
- Compatible with BusyBox containers (uses minimal shell commands)
- Translates logic from the bash functions in `../bash/functions.sh`
- Uses async/await for all file system and shell operations
- Provides detailed error messages and progress indicators
- Extracted constants and utility functions for better maintainability

#### Installation

```bash
# Install dependencies
npm install

# The script is ready to use
npm run fix-unsplit-cue <folder_path>
```
