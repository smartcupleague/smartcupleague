#!/usr/bin/env bash
# stop.sh — gracefully stops all services started by start.sh.
#
# Usage:
#   ./scripts/stop.sh              # stop services, keep Supabase running
#   ./scripts/stop.sh --supabase   # also stop Supabase containers
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPTS="$ROOT/scripts"
PIDS="$SCRIPTS/.pids"

STOP_SUPABASE=false
for arg in "$@"; do
  [[ "$arg" == "--supabase" ]] && STOP_SUPABASE=true
done

# ── Stop tracked services ─────────────────────────────────────────────────────
echo "=== Stopping services ==="

if [[ ! -f "$PIDS" || ! -s "$PIDS" ]]; then
  echo "  No tracked services found (no .pids file)."
else
  while IFS='=' read -r name pid; do
    [[ -z "$name" || -z "$pid" ]] && continue
    if kill -0 "$pid" 2>/dev/null; then
      echo "  Stopping $name (PID $pid)..."
      # SIGTERM first; give it 5s to exit cleanly before SIGKILL
      kill -TERM "$pid" 2>/dev/null || true
      for _ in {1..5}; do
        kill -0 "$pid" 2>/dev/null || break
        sleep 1
      done
      # Force-kill if still alive
      if kill -0 "$pid" 2>/dev/null; then
        echo "    ($name did not exit cleanly — sending SIGKILL)"
        kill -KILL "$pid" 2>/dev/null || true
      fi
    else
      echo "  $name (PID $pid) — already stopped."
    fi
  done < "$PIDS"
  rm -f "$PIDS"
  echo ""
  echo "  All services stopped."
fi

# ── Stop Supabase (optional) ──────────────────────────────────────────────────
if [[ "$STOP_SUPABASE" == true ]]; then
  echo ""
  echo "=== Stopping Supabase ==="
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "supabase_db_smartcupleague"; then
    cd "$ROOT"
    supabase stop
    echo "  Supabase containers stopped. Images and volumes are intact."
  else
    echo "  Supabase is not running — skipped."
  fi
fi

echo ""
echo "Done. Run ./scripts/start.sh to bring everything back up."
