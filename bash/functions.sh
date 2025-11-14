#! /bin/bash

# CUE/Audio splitting and cleanup functions
# 
# Functions available:
# - split_cue_audio: Split a single CUE/Audio pair (FLAC or WAV) with optional cleanup
# - cleanup_temp_split: Cleanup function for temporary split directories
# - scan_recursive_cue_audio: Scan directories for unsplit CUE/Audio pairs
#
# Usage examples:
#   split_cue_audio path/to/album.cue                    # Split with prompted cleanup
#   cleanup_temp_split path/to/album.cue                 # Manual cleanup

# Validate input parameters
validate_cue_input() {
  if [ -z "$1" ]; then
    echo "Usage: split_cue_audio path/to/album.cue"
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

# Find audio file (FLAC or WAV) in directory
find_audio_file() {
  local audio_file
  
  # Look for FLAC first, then WAV
  audio_file="$(ls | grep -iE '\.flac$' | head -n1)"
  if [ -f "$audio_file" ]; then
    echo "$audio_file"
    return 0
  fi
  
  audio_file="$(ls | grep -iE '\.wav$' | head -n1)"
  if [ -f "$audio_file" ]; then
    echo "$audio_file"
    return 0
  fi
  
  echo "❌ No FLAC or WAV file found in $(pwd)"
  return 1
}

# Get audio file format for processing
get_audio_format() {
  local audio_file="$1"
  if [[ "$audio_file" =~ \.flac$ ]]; then
    echo "flac"
  elif [[ "$audio_file" =~ \.wav$ ]]; then
    echo "wav"
  else
    echo "unknown"
  fi
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

# Split the audio file using cue sheet
split_audio_file() {
  local cue_file="$1"
  local audio_file="$2"
  local out_dir="$3"
  local audio_format="$4"
  
  # Set UTF-8 locale to handle non-ASCII characters in filenames
  export LANG=en_US.UTF-8
  export LC_ALL=en_US.UTF-8
  
  echo "🔄 Splitting '$audio_file' using '$cue_file'..."
  cuebreakpoints "$cue_file" | shnsplit -f "$cue_file" -o "$audio_format" -t "%n. %t" -d "$out_dir" "$audio_file"
}

# Tag the split files with metadata
tag_split_files() {
  local cue_file="$1"
  local out_dir="$2"
  
  if command -v cuetag >/dev/null 2>&1; then
    echo "🏷️ Tagging split tracks..."
    cuetag "$cue_file" "$out_dir"/*.flac "$out_dir"/*.wav
  else
    echo "⚠️ cuetag not found, skipping metadata tagging."
  fi
}

# Cleanup after successful split - moves split files to original location and removes temp directory
cleanup_temp_split() {
  local cue_path="$1"
  local directory
  local cue_file
  local audio_file
  local temp_dir
  
  # Extract directory and filename from cue path
  directory="$(dirname "$cue_path")"
  cue_file="$(basename "$cue_path")"
  
  # Find corresponding audio file
  cd "$directory" || return 1
  audio_file="$(find_audio_file)"
  if [ $? -ne 0 ]; then
    echo "❌ Could not find corresponding audio file for $cue_file"
    return 1
  fi
  
  # Set temp directory path
  temp_dir="$directory/__temp_split"
  
  echo "🧹 Cleaning up temporary files..."
  
  # Move split audio files to the original directory
  if [ -d "$temp_dir" ]; then
    for split_audio_file in "$temp_dir"/*.flac "$temp_dir"/*.wav; do
      if [ -f "$split_audio_file" ]; then
        mv "$split_audio_file" "$directory/"
        echo "📁 Moved $(basename "$split_audio_file") to original directory"
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
  
  # Remove the original cue and audio files
  if [ -f "$cue_path" ]; then
    rm "$cue_path"
    echo "🗑️ Removed original cue file: $cue_file"
  fi
  
  if [ -f "$directory/$audio_file" ]; then
    rm "$directory/$audio_file"
    echo "🗑️ Removed original audio file: $audio_file"
  fi
  
  # Remove the temp directory
  if [ -d "$temp_dir" ]; then
    rm -rf "$temp_dir"
    echo "🗑️ Removed temporary directory: $temp_dir"
  fi
  
  echo "✅ Cleanup completed successfully"
}

# Main function - orchestrates the entire process
split_cue_audio() {
  # Set UTF-8 locale at the start to handle non-ASCII characters
  export LANG=en_US.UTF-8
  export LC_ALL=en_US.UTF-8
  
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
  
  # Find audio file
  local audio_file
  audio_file="$(find_audio_file)"
  if [ $? -ne 0 ]; then
    return 1
  fi
  
  # Get audio format
  local audio_format
  audio_format="$(get_audio_format "$audio_file")"
  
  # Check dependencies
  if ! check_dependencies; then
    return 1
  fi
  
  # Create output directory
  local out_dir="__temp_split"
  mkdir -p "$out_dir"
  
  # Split the file
  split_audio_file "$cue_file" "$audio_file" "$out_dir" "$audio_format"
  
  # Tag the files
  tag_split_files "$cue_file" "$out_dir"
  
  echo "✅ Done. Split tracks are in: $out_dir"
}

# Legacy function name for backward compatibility
split_cue_flac() {
  echo "⚠️  'split_cue_flac' is deprecated. Use 'split_cue_audio' instead."
  split_cue_audio "$@"
}

   