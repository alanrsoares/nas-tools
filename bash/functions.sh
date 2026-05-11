#!/usr/bin/env bash

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

setup_utf8_locale() {
  if [ -z "${LANG:-}" ]; then
    export LANG=C.UTF-8
  fi

  if [ -z "${LC_ALL:-}" ]; then
    export LC_ALL="$LANG"
  fi
}

print_dependency_install_hint() {
  if command -v opkg >/dev/null 2>&1; then
    echo "Install with: opkg install flac cuetools shntool"
  elif command -v apt >/dev/null 2>&1; then
    echo "Install with: sudo apt install flac cuetools shntool"
  else
    echo "Install flac, cuetools, and shntool with your NAS package manager."
  fi
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
  local audio_files

  # Look for FLAC first, then WAV
  shopt -s nullglob nocaseglob
  audio_files=(*.flac)
  if [ "${#audio_files[@]}" -gt 0 ] && [ -f "${audio_files[0]}" ]; then
    echo "${audio_files[0]}"
    shopt -u nullglob nocaseglob
    return 0
  fi

  audio_files=(*.wav)
  if [ "${#audio_files[@]}" -gt 0 ] && [ -f "${audio_files[0]}" ]; then
    echo "${audio_files[0]}"
    shopt -u nullglob nocaseglob
    return 0
  fi

  shopt -u nullglob nocaseglob
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
    echo "❌ 'flac' encoder not found."
    print_dependency_install_hint
    return 1
  fi

  if ! command -v cuebreakpoints >/dev/null 2>&1; then
    echo "❌ 'cuebreakpoints' not found."
    print_dependency_install_hint
    return 1
  fi

  if ! command -v shnsplit >/dev/null 2>&1; then
    echo "❌ 'shnsplit' not found."
    print_dependency_install_hint
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
  
  setup_utf8_locale

  echo "🔄 Splitting '$audio_file' using '$cue_file'..."
  (set -o pipefail; cuebreakpoints "$cue_file" | shnsplit -f "$cue_file" -o "$audio_format" -t "%n. %t" -d "$out_dir" "$audio_file")
}

# Tag the split files with metadata
tag_split_files() {
  local cue_file="$1"
  local out_dir="$2"
  
  if command -v cuetag >/dev/null 2>&1; then
    echo "🏷️ Tagging split tracks..."
    cuetag "$cue_file" "$out_dir"/*.flac "$out_dir"/*.wav
  else
    tag_split_flacs_with_metaflac "$cue_file" "$out_dir"
  fi
}

cue_field() {
  local cue_file="$1"
  local track_no="$2"
  local field="$3"

  awk -v track_no="$track_no" -v field="$field" '
    function unquote(value) {
      sub(/^[[:space:]]*"*/, "", value)
      sub(/"*$/, "", value)
      return value
    }
    /^[[:space:]]*TRACK[[:space:]]+[0-9]+/ {
      current = $2 + 0
      next
    }
    current == track_no && $1 == field {
      value = $0
      sub("^[[:space:]]*" field "[[:space:]]+", "", value)
      print unquote(value)
      exit
    }
  ' "$cue_file"
}

cue_album_field() {
  local cue_file="$1"
  local field="$2"

  awk -v field="$field" '
    function unquote(value) {
      sub(/^[[:space:]]*"*/, "", value)
      sub(/"*$/, "", value)
      return value
    }
    /^[[:space:]]*TRACK[[:space:]]+[0-9]+/ {
      exit
    }
    $1 == field {
      value = $0
      sub("^[[:space:]]*" field "[[:space:]]+", "", value)
      print unquote(value)
      exit
    }
  ' "$cue_file"
}

tag_split_flacs_with_metaflac() {
  local cue_file="$1"
  local out_dir="$2"

  if ! command -v metaflac >/dev/null 2>&1; then
    echo "⚠️ cuetag/metaflac not found, skipping metadata tagging."
    return 0
  fi

  shopt -s nullglob
  local flac_files=("$out_dir"/*.flac)
  shopt -u nullglob

  if [ "${#flac_files[@]}" -eq 0 ]; then
    echo "⚠️ No split FLAC files found for metaflac tagging."
    return 0
  fi

  local album_title
  local album_artist
  album_title="$(cue_album_field "$cue_file" TITLE)"
  album_artist="$(cue_album_field "$cue_file" PERFORMER)"

  echo "🏷️ Tagging split FLAC tracks with metaflac..."
  for flac_file in "${flac_files[@]}"; do
    local file_name
    local track_no
    local track_title
    local track_artist

    file_name="$(basename "$flac_file")"
    track_no="${file_name%%.*}"

    if ! [[ "$track_no" =~ ^[0-9]+$ ]]; then
      echo "⚠️ Cannot infer track number from $file_name, skipping."
      continue
    fi

    track_title="$(cue_field "$cue_file" "$track_no" TITLE)"
    track_artist="$(cue_field "$cue_file" "$track_no" PERFORMER)"
    if [ -z "$track_artist" ]; then
      track_artist="$album_artist"
    fi

    metaflac --remove-tag=TITLE --remove-tag=ARTIST --remove-tag=ALBUM --remove-tag=ALBUMARTIST --remove-tag=TRACKNUMBER "$flac_file"
    [ -n "$track_title" ] && metaflac --set-tag="TITLE=$track_title" "$flac_file"
    [ -n "$track_artist" ] && metaflac --set-tag="ARTIST=$track_artist" "$flac_file"
    [ -n "$album_title" ] && metaflac --set-tag="ALBUM=$album_title" "$flac_file"
    [ -n "$album_artist" ] && metaflac --set-tag="ALBUMARTIST=$album_artist" "$flac_file"
    metaflac --set-tag="TRACKNUMBER=$track_no" "$flac_file"
  done
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
  
  if [ ! -d "$temp_dir" ]; then
    echo "❌ Temporary split directory not found: $temp_dir"
    return 1
  fi

  shopt -s nullglob
  local split_files=("$temp_dir"/*.flac "$temp_dir"/*.wav "$temp_dir"/*.cue)
  shopt -u nullglob

  if [ "${#split_files[@]}" -eq 0 ]; then
    echo "❌ No split files found in $temp_dir; refusing to delete originals."
    return 1
  fi

  echo "🧹 Cleaning up temporary files..."

  # Move split audio files to the original directory
  for split_file in "${split_files[@]}"; do
    if [ -e "$directory/$(basename "$split_file")" ]; then
      echo "❌ Destination already exists: $directory/$(basename "$split_file")"
      echo "❌ Refusing to overwrite or delete originals."
      return 1
    fi

    mv "$split_file" "$directory/" || {
      echo "❌ Failed moving $(basename "$split_file"); refusing to delete originals."
      return 1
    }
    echo "📁 Moved $(basename "$split_file") to original directory"
  done

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
  setup_utf8_locale

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
  if [ -d "$out_dir" ] && [ "$(find "$out_dir" -mindepth 1 -maxdepth 1 | head -n1)" ]; then
    echo "❌ Existing non-empty $out_dir found; refusing to overwrite previous split output."
    return 1
  fi

  mkdir -p "$out_dir"

  # Split the file
  split_audio_file "$cue_file" "$audio_file" "$out_dir" "$audio_format" || return 1

  # Tag the files
  tag_split_files "$cue_file" "$out_dir"

  echo "✅ Done. Split tracks are in: $out_dir"
}

# Legacy function name for backward compatibility
split_cue_flac() {
  echo "⚠️  'split_cue_flac' is deprecated. Use 'split_cue_audio' instead."
  split_cue_audio "$@"
}

   
