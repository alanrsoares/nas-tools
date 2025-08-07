#! /bin/bash

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

# Scan for matching .cue and .flac files
scan_cue_flac_pairs() {
  local found_pairs=()
  local cue_files=()
  local flac_files=()
  
  # Find all .cue files
  while IFS= read -r -d '' file; do
    cue_files+=("$file")
  done < <(find . -maxdepth 1 -name "*.cue" -print0 2>/dev/null)
  
  # Find all .flac files
  while IFS= read -r -d '' file; do
    flac_files+=("$file")
  done < <(find . -maxdepth 1 -name "*.flac" -print0 2>/dev/null)
  
  # Check for matching pairs
  for cue_file in "${cue_files[@]}"; do
    local cue_basename="${cue_file%.*}"
    cue_basename="${cue_basename#./}"  # Remove leading ./
    
    for flac_file in "${flac_files[@]}"; do
      local flac_basename="${flac_file%.*}"
      flac_basename="${flac_basename#./}"  # Remove leading ./
      
      if [ "$cue_basename" = "$flac_basename" ]; then
        found_pairs+=("$cue_file:$flac_file")
        break
      fi
    done
  done
  
  # Return results
  if [ ${#found_pairs[@]} -eq 0 ]; then
    echo "No matching .cue/.flac pairs found in current directory"
    return 1
  else
    printf "Found %d matching pairs:\n" "${#found_pairs[@]}"
    for pair in "${found_pairs[@]}"; do
      IFS=':' read -r cue flac <<< "$pair"
      echo "  📁 CUE: $cue"
      echo "  🎵 FLAC: $flac"
      echo ""
    done
    return 0
  fi
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
  local out_dir="${basename}_split"
  mkdir -p "$out_dir"
  
  # Split the file
  split_flac_file "$cue_file" "$flac_file" "$out_dir"
  
  # Tag the files
  tag_split_files "$cue_file" "$out_dir"
  
  echo "✅ Done. Split tracks are in: $out_dir"
}   