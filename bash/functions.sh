#! /bin/bash

# CUE/FLAC splitting and cleanup functions
# 
# Functions available:
# - split_cue_flac: Split a single CUE/FLAC pair with optional cleanup
# - cleanup_temp_split: Cleanup function for temporary split directories
# - scan_recursive_cue_flac: Scan directories for unsplit CUE/FLAC pairs
#
# Usage examples:
#   split_cue_flac path/to/album.cue                    # Split with prompted cleanup
#   cleanup_temp_split path/to/album.cue                 # Manual cleanup

# Validate input parameters
validate_cue_input() {
  if [ -z "$1" ]; then
    echo "Usage: split_cue_flac path/to/album.cue"
    return 1
  fi
  return 0
}

# Setup working directory and file paths
setup_environment() {
  local cue_path="$1"
  local cue_dir
  local cue_file
  local basename
  
  cue_dir="$(dirname "$cue_path")"
  cue_file="$(basename "$cue_path")"
  basename="${cue_file%.*}"
  
  cd "$cue_dir" || return 1
  
  echo "$cue_dir:$cue_file:$basename"
}

# Find FLAC file in directory
find_flac_file() {
  local flac_file
  
  flac_file="$(ls | grep -iE '\.flac$' | head -n1)"
  if [ ! -f "$flac_file" ]; then
    echo "❌ No FLAC file found in $(pwd)"
    return 1
  fi
  
  echo "$flac_file"
}

# Check if required tools are available
check_dependencies() {
  if ! command -v flac >/dev/null 2>&1; then
    echo "❌ 'flac' encoder not found. Please run: opkg install flac"
    return 1
  fi
  
  if ! command -v cuebreakpoints >/dev/null 2>&1; then
    echo "❌ 'cuebreakpoints' not found. Please install cuetools"
    return 1
  fi
  
  if ! command -v shnsplit >/dev/null 2>&1; then
    echo "❌ 'shnsplit' not found. Please install shntool"
    return 1
  fi
  
  return 0
}

# Split the FLAC file using cue sheet
split_flac_file() {
  local cue_file="$1"
  local flac_file="$2"
  local out_dir="$3"
  
  echo "🔄 Splitting '$flac_file' using '$cue_file'..."
  cuebreakpoints "$cue_file" | shnsplit -f "$cue_file" -o flac -t "%n. %t" -d "$out_dir" "$flac_file"
}

# Tag the split files with metadata
tag_split_files() {
  local cue_file="$1"
  local out_dir="$2"
  
  if command -v cuetag >/dev/null 2>&1; then
    echo "🏷️ Tagging split tracks..."
    cuetag "$cue_file" "$out_dir"/*.flac
  else
    echo "⚠️ cuetag not found, skipping metadata tagging."
  fi
}

# Cleanup after successful split - moves split files to original location and removes temp directory
cleanup_temp_split() {
  local cue_path="$1"
  local directory
  local cue_file
  local flac_file
  local temp_dir
  
  # Extract directory and filename from cue path
  directory="$(dirname "$cue_path")"
  cue_file="$(basename "$cue_path")"
  
  # Find corresponding FLAC file
  cd "$directory" || return 1
  flac_file="$(find_flac_file)"
  if [ $? -ne 0 ]; then
    echo "❌ Could not find corresponding FLAC file for $cue_file"
    return 1
  fi
  
  # Set temp directory path
  temp_dir="$directory/__temp_split"
  
  echo "🧹 Cleaning up temporary files..."
  
  # Move split FLAC files to the original directory
  if [ -d "$temp_dir" ]; then
    for split_flac_file in "$temp_dir"/*.flac; do
      if [ -f "$split_flac_file" ]; then
        mv "$split_flac_file" "$directory/"
        echo "📁 Moved $(basename "$split_flac_file") to original directory"
      fi
    done
  fi
  
  # Move split CUE files to the original directory
  if [ -d "$temp_dir" ]; then
    for split_cue_file in "$temp_dir"/*.cue; do
      if [ -f "$split_cue_file" ]; then
        mv "$split_cue_file" "$directory/"
        echo "📁 Moved $(basename "$split_cue_file") to original directory"
      fi
    done
  fi
  
  # Remove the original cue and flac files
  if [ -f "$cue_path" ]; then
    rm "$cue_path"
    echo "🗑️ Removed original cue file: $cue_file"
  fi
  
  if [ -f "$directory/$flac_file" ]; then
    rm "$directory/$flac_file"
    echo "🗑️ Removed original flac file: $flac_file"
  fi
  
  # Remove the temp directory
  if [ -d "$temp_dir" ]; then
    rm -rf "$temp_dir"
    echo "🗑️ Removed temporary directory: $temp_dir"
  fi
  
  echo "✅ Cleanup completed successfully"
}

# Main function - orchestrates the entire process
split_cue_flac() {
  # Validate input
  if ! validate_cue_input "$1"; then
    return 1
  fi
  
  # Setup environment
  local env_info
  env_info="$(setup_environment "$1")"
  if [ $? -ne 0 ]; then
    return 1
  fi
  
  # Parse environment info
  local cue_dir cue_file basename
  IFS=':' read -r cue_dir cue_file basename <<< "$env_info"
  
  # Find FLAC file
  local flac_file
  flac_file="$(find_flac_file)"
  if [ $? -ne 0 ]; then
    return 1
  fi
  
  # Check dependencies
  if ! check_dependencies; then
    return 1
  fi
  
  # Create output directory
  local out_dir="__temp_split"
  mkdir -p "$out_dir"
  
  # Split the file
  split_flac_file "$cue_file" "$flac_file" "$out_dir"
  
  # Tag the files
  tag_split_files "$cue_file" "$out_dir"
  
  echo "✅ Done. Split tracks are in: $out_dir"
}

   