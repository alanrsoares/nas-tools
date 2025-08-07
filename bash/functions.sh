#! /bin/bash


split_cue_flac() {
  if [ -z "$1" ]; then
    echo "Usage: split_cue_flac path/to/album.cue"
    return 1
  fi

  CUE_PATH="$1"
  CUE_DIR="$(dirname "$CUE_PATH")"
  CUE_FILE="$(basename "$CUE_PATH")"
  BASENAME="${CUE_FILE%.*}"

  cd "$CUE_DIR" || return 1

  FLAC_FILE="$(ls | grep -iE '\.flac$' | head -n1)"
  if [ ! -f "$FLAC_FILE" ]; then
    echo "❌ No FLAC file found in $CUE_DIR"
    return 1
  fi

  # Check for flac encoder
  if ! command -v flac >/dev/null 2>&1; then
    echo "❌ 'flac' encoder not found. Please run: opkg install flac"
    return 1
  fi

  OUT_DIR="${BASENAME}_split"
  mkdir -p "$OUT_DIR"

  echo "🔄 Splitting '$FLAC_FILE' using '$CUE_FILE'..."
  cuebreakpoints "$CUE_FILE" | shnsplit -f "$CUE_FILE" -o flac -t "%n. %t" -d "$OUT_DIR" "$FLAC_FILE"

  # Tagging (optional)
  if command -v cuetag >/dev/null 2>&1; then
    echo "🏷️ Tagging split tracks..."
    cuetag "$CUE_FILE" "$OUT_DIR"/*.flac
  else
    echo "⚠️ cuetag not found, skipping metadata tagging."
  fi

  echo "✅ Done. Split tracks are in: $OUT_DIR"
}   