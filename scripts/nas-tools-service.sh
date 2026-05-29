#!/bin/sh
# nas-tools-service.sh — manage the nas-tools server process
# Usage: nas-tools-service.sh {start|stop|restart|status}

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DB_PATH="$HOME/.local/share/nas-tools/cockpit.sqlite"
LOG="/tmp/nas-tools-server.log"
PORT="${PORT:-8788}"

# Find PIDs of server instances by which processes hold the DB open
find_server_pids() {
  if [ -f "$DB_PATH" ]; then
    fuser "$DB_PATH" 2>/dev/null | tr ' ' '\n' | grep '[0-9]' || true
  fi
}

# Find parent PIDs (bun run --filter wrappers)
find_parent_pids() {
  for pid in $(find_server_pids); do
    ppid=$(awk '/^PPid:/{print $2}' "/proc/$pid/status" 2>/dev/null || true)
    if [ -n "$ppid" ] && [ "$ppid" -gt "1" ]; then
      echo "$ppid"
    fi
  done
}

kill_ffmpeg_orphans() {
  for pid in $(pgrep -f "ffmpeg.*alsa" 2>/dev/null || true); do
    kill -9 "$pid" 2>/dev/null || true
  done
}

do_stop() {
  SERVER_PIDS=$(find_server_pids)
  PARENT_PIDS=$(find_parent_pids)

  if [ -z "$SERVER_PIDS" ]; then
    echo "nas-tools: not running"
    return 0
  fi

  ALL_PIDS="$SERVER_PIDS $PARENT_PIDS"
  echo "nas-tools: stopping pids: $ALL_PIDS"

  for pid in $ALL_PIDS; do
    kill "$pid" 2>/dev/null || true
  done
  sleep 2

  # Force-kill anything still alive
  for pid in $(find_server_pids); do
    kill -9 "$pid" 2>/dev/null || true
  done

  kill_ffmpeg_orphans
  echo "nas-tools: stopped"
}

do_start() {
  if [ -n "$(find_server_pids)" ]; then
    echo "nas-tools: already running — use restart to reload"
    return 0
  fi

  kill_ffmpeg_orphans

  echo "nas-tools: starting..."
  cd "$SCRIPT_DIR"
  bun run --filter @nas-tools/server start >> "$LOG" 2>&1 &

  i=0
  while [ "$i" -lt 8 ]; do
    sleep 1
    i=$((i + 1))
    if [ -n "$(find_server_pids)" ]; then
      echo "nas-tools: started (log: $LOG)"
      return 0
    fi
  done

  echo "nas-tools: failed to start — check $LOG"
  return 1
}

do_status() {
  PIDS=$(find_server_pids)
  if [ -z "$PIDS" ]; then
    echo "nas-tools: not running"
  else
    echo "nas-tools: running (pids: $PIDS)"
    if curl -sf "http://localhost:${PORT}/api/health" > /dev/null 2>&1; then
      echo "nas-tools: http :${PORT} ok"
    else
      echo "nas-tools: http :${PORT} not responding"
    fi
  fi
}

case "${1:-}" in
  start)   do_start ;;
  stop)    do_stop ;;
  restart) do_stop && do_start ;;
  status)  do_status ;;
  *)
    echo "Usage: $0 {start|stop|restart|status}"
    exit 1
    ;;
esac
