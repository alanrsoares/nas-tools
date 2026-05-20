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
# Prefer the cue basename when provided, because many album folders also
# contain already-split track files.
is_metadata_junk_file() {
  case "$1" in
    ._*) return 0 ;;
    .DS_Store) return 0 ;;
    *) return 1 ;;
  esac
}

find_audio_file() {
  local cue_basename="${1:-}"
  local audio_files
  local candidate

  if [ -n "$cue_basename" ]; then
    for candidate in "$cue_basename".flac "$cue_basename".wav "$cue_basename".wv; do
      if [ -f "$candidate" ] && ! is_metadata_junk_file "$candidate"; then
        echo "$candidate"
        return 0
      fi
    done
  fi

  # Look for FLAC first, then WAV, then WV
  shopt -s nullglob nocaseglob
  audio_files=(*.flac)
  for candidate in "${audio_files[@]}"; do
    if [ -f "$candidate" ] && ! is_metadata_junk_file "$candidate"; then
      if [ -n "$cue_basename" ] && [[ "$candidate" == [0-9]*.* ]]; then
        continue
      fi
      echo "$candidate"
      shopt -u nullglob nocaseglob
      return 0
    fi
  done

  audio_files=(*.wav)
  for candidate in "${audio_files[@]}"; do
    if [ -f "$candidate" ] && ! is_metadata_junk_file "$candidate"; then
      if [ -n "$cue_basename" ] && [[ "$candidate" == [0-9]*.* ]]; then
        continue
      fi
      echo "$candidate"
      shopt -u nullglob nocaseglob
      return 0
    fi
  done

  audio_files=(*.wv)
  for candidate in "${audio_files[@]}"; do
    if [ -f "$candidate" ] && ! is_metadata_junk_file "$candidate"; then
      if [ -n "$cue_basename" ] && [[ "$candidate" == [0-9]*.* ]]; then
        continue
      fi
      echo "$candidate"
      shopt -u nullglob nocaseglob
      return 0
    fi
  done

  shopt -u nullglob nocaseglob
  echo "❌ No FLAC, WAV or WV file found in $(pwd)"
  return 1
}

# Get audio file format for processing
get_audio_format() {
  local audio_file="$1"
  if [[ "$audio_file" =~ \.flac$ ]]; then
    echo "flac"
  elif [[ "$audio_file" =~ \.wav$ ]]; then
    echo "wav"
  elif [[ "$audio_file" =~ \.wv$ ]]; then
    echo "wv"
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
  set +e
  local cue_file="$1"
  local audio_file="$2"
  local out_dir="$3"
  local audio_format="$4"
  
  setup_utf8_locale

  echo "🔄 Splitting '$audio_file' using '$cue_file'..."

  cuebreakpoints "$cue_file" | shnsplit -f "$cue_file" -o "$audio_format" -t "%n. %t" -d "$out_dir" "$audio_file"
  local split_status=$?

  if [ $split_status -ne 0 ]; then
    echo "❌ shnsplit failed with exit code $split_status."
    return $split_status
  fi

  # Even if shnsplit returned 0, check if it actually created any tracks.
  # Some versions of shntool return 0 even when the encoder fails immediately.
  shopt -s nullglob
  local split_files=("$out_dir"/*."$audio_format")
  shopt -u nullglob
  
  if [ ${#split_files[@]} -eq 0 ]; then
    echo "❌ shnsplit finished but no split tracks were found in $out_dir."
    return 1
  fi

  return 0
}

sanitize_split_track_name() {
  local track_name="$1"

  track_name="${track_name//$'\r'/}"
  track_name="${track_name//$'\n'/}"
  track_name="${track_name//\"/}"
  track_name="${track_name//\//-}"
  track_name="${track_name//\\/-}"
  track_name="$(printf '%s' "$track_name" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')"

  printf '%s' "$track_name"
}

split_audio_file_with_ffmpeg() {
  local cue_file="$1"
  local audio_file="$2"
  local out_dir="$3"
  local split_points
  local track_count
  local duration
  local track_no
  local start
  local end
  local track_title
  local safe_title
  local output_file

  if ! command -v ffmpeg >/dev/null 2>&1; then
    echo "❌ 'ffmpeg' not found for split fallback."
    return 1
  fi

  if ! command -v ffprobe >/dev/null 2>&1; then
    echo "❌ 'ffprobe' not found for split fallback."
    return 1
  fi

  mapfile -t split_points < <(cuebreakpoints "$cue_file")
  duration="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$audio_file" 2>/dev/null)"

  if [ -z "$duration" ]; then
    echo "❌ Could not determine source duration for $audio_file."
    return 1
  fi

  track_count=$(( ${#split_points[@]} + 1 ))
  start="0"

  echo "🔄 Splitting with ffmpeg ($track_count tracks)..."
  for ((track_no = 1; track_no <= track_count; track_no++)); do
    if [ "$track_no" -le "${#split_points[@]}" ]; then
      local raw_end="${split_points[$((track_no - 1))]}"
      # Convert MM:SS.FF to seconds (FF is 1/75th of a second)
      end=$(echo "$raw_end" | awk -F'[:.]' '{ 
        if (NF==3) print $1*60 + $2 + $3/75; 
        else if (NF==2) print $1 + $2/75; 
        else print $0 
      }')
    else
      end="$duration"
    fi

    track_title="$(cue_field "$cue_file" "$track_no" TITLE)"
    if [ -z "$track_title" ]; then
      track_title="Track $track_no"
    fi

    safe_title="$(sanitize_split_track_name "$track_title")"
    output_file="$(printf '%02d. %s.flac' "$track_no" "$safe_title")"

    echo "  ✂️ Track $track_no: $output_file [$start -> $end]"
    if ! ffmpeg -v error -y -ss "$start" -to "$end" -i "$audio_file" -c:a flac "$out_dir/$output_file" >/dev/null 2>&1; then
      echo "❌ Failed cutting track $track_no with ffmpeg."
      return 1
    fi

    start="$end"
  done
}

# Tag the split files with metadata
tag_split_files() {
  local cue_file="$1"
  local out_dir="$2"
  
  shopt -s nullglob
  local split_files=("$out_dir"/*.flac "$out_dir"/*.wav)
  shopt -u nullglob
  
  if [ ${#split_files[@]} -eq 0 ]; then
    echo "⚠️ No split files found for tagging in $out_dir"
    return 0
  fi

  if command -v cuetag >/dev/null 2>&1; then
    echo "🏷️ Tagging split tracks..."
    cuetag "$cue_file" "${split_files[@]}"
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
      gsub(/\r/, "", value)
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
      gsub(/\r/, "", value)
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

audio_files_match() {
  local left="$1"
  local right="$2"

  if [ ! -f "$left" ] || [ ! -f "$right" ]; then
    return 1
  fi

  if cmp -s "$left" "$right"; then
    return 0
  fi

  if [[ "$left" =~ \.flac$ ]] && [[ "$right" =~ \.flac$ ]]; then
    if ! command -v md5sum >/dev/null 2>&1; then
      return 1
    fi

    local left_audio_hash
    local right_audio_hash
    left_audio_hash="$(flac -d --silent --stdout "$left" 2>/dev/null | md5sum | awk '{print $1}')" || return 1
    right_audio_hash="$(flac -d --silent --stdout "$right" 2>/dev/null | md5sum | awk '{print $1}')" || return 1

    [ "$left_audio_hash" = "$right_audio_hash" ]
    return $?
  fi

  return 1
}

# Cleanup after successful split - moves split files to original location and removes temp directory
cleanup_temp_split() {
  local cue_path="$1"
  local directory
  local cue_file
  local basename
  local audio_file
  local temp_dir
  
  # Extract directory and filename from cue path
  directory="$(dirname "$cue_path")"
  cue_file="$(basename "$cue_path")"
  basename="${cue_file%.*}"
  
  # Find corresponding audio file
  cd "$directory" || return 1
  audio_file="$(find_audio_file "$basename")"
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
    local destination
    destination="$directory/$(basename "$split_file")"

    if [ -e "$destination" ]; then
      if audio_files_match "$split_file" "$destination"; then
        rm "$split_file"
        echo "✅ Verified existing file: $(basename "$split_file")"
        continue
      fi

      echo "❌ Destination already exists and differs: $destination"
      echo "❌ Refusing to overwrite or delete originals."
      return 1
    fi

    mv "$split_file" "$destination" || {
      echo "❌ Failed moving $(basename "$split_file"); refusing to delete originals."
      return 1
    }
    echo "📁 Moved $(basename "$split_file") to original directory"
  done

  # Back up originals before deleting them.
  local backup_dir
  backup_dir="$directory/__original_backup"
  mkdir -p "$backup_dir" || {
    echo "❌ Failed creating original backup directory; refusing to delete originals."
    return 1
  }

  if [ -f "$cue_path" ]; then
    cp -p "$cue_path" "$backup_dir/$cue_file" || {
      echo "❌ Failed backing up $cue_file; refusing to delete originals."
      return 1
    }
  fi

  if [ -f "$directory/$audio_file" ]; then
    cp -p "$directory/$audio_file" "$backup_dir/$audio_file" || {
      echo "❌ Failed backing up $audio_file; refusing to delete originals."
      return 1
    }
  fi

  # Remove the original cue and audio files only after backups exist.
  if [ -f "$cue_path" ]; then
    rm "$cue_path"
    echo "🗑️ Removed original cue file: $cue_file"
  fi
  
  if [ -f "$directory/$audio_file" ]; then
    rm "$directory/$audio_file"
    echo "🗑️ Removed original audio file: $audio_file"
  fi
  
  # Remove the temp directory only if it is empty after moving split files.
  if [ -d "$temp_dir" ]; then
    rmdir "$temp_dir" && echo "🗑️ Removed temporary directory: $temp_dir"
  fi
  
  echo "✅ Cleanup completed successfully"
}

# Main function - orchestrates the entire process
split_cue_audio() {
  # Save current set -e state
  local errexit_state
  errexit_state="$(set +o | grep errexit)"
  set +e
  
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
  audio_file="$(find_audio_file "$basename")"
  if [ $? -ne 0 ]; then
    return 1
  fi
  
  # Get audio format
  local audio_format
  audio_format="$(get_audio_format "$audio_file")"

  # Pre-convert WV to FLAC via ffmpeg if wvunpack is unavailable
  local wv_converted=""
  if [ "$audio_format" = "wv" ] && ! command -v wvunpack >/dev/null 2>&1; then
    if ! command -v ffmpeg >/dev/null 2>&1; then
      echo "❌ Neither wvunpack nor ffmpeg found; cannot split WV files."
      return 1
    fi
    local flac_audio="${audio_file%.wv}.flac"
    echo "⚠️ wvunpack not found; converting WV → FLAC via ffmpeg..."
    if ! ffmpeg -v error -y -i "$audio_file" -c:a flac "$flac_audio"; then
      echo "❌ WV → FLAC conversion failed."
      return 1
    fi
    echo "✅ Converted: $(basename "$flac_audio")"
    wv_converted="$flac_audio"
    audio_file="$flac_audio"
    audio_format="flac"
  fi

  # Check dependencies
  if ! check_dependencies; then
    return 1
  fi

  # Create output directory
  local out_dir="__temp_split"
  if [ -d "$out_dir" ] && [ "$(find "$out_dir" -mindepth 1 -maxdepth 1 | head -n1)" ]; then
    echo "⚠️ Clearing stale $out_dir before splitting."
    rm -rf "$out_dir" || return 1
  fi

  mkdir -p "$out_dir"

  # Split the file
  local split_result=0
  split_audio_file "$cue_file" "$audio_file" "$out_dir" "$audio_format" || split_result=$?

  if [ $split_result -ne 0 ]; then
    if [ "$audio_format" != "flac" ] && [ "$audio_format" != "wv" ]; then
      echo "❌ Splitting failed."
      return 1
    fi

    echo "⚠️ $audio_format split failed; retrying via ffmpeg fallback."
    rm -rf "$out_dir"
    mkdir -p "$out_dir"

    if ! split_audio_file_with_ffmpeg "$cue_file" "$audio_file" "$out_dir"; then
      echo "❌ ffmpeg fallback also failed."
      return 1
    fi
  fi

  # Remove intermediate WV→FLAC conversion file if one was created
  if [ -n "$wv_converted" ] && [ -f "$wv_converted" ]; then
    rm -f "$wv_converted"
  fi

  # Tag the files
  tag_split_files "$cue_file" "$out_dir"

  echo "✅ Done. Split tracks are in: $out_dir"
  
  # Restore set -e if it was active
  eval "$errexit_state"
}

# Legacy function name for backward compatibility
split_cue_flac() {
  echo "⚠️  'split_cue_flac' is deprecated. Use 'split_cue_audio' instead."
  split_cue_audio "$@"
}

   
