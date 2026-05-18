#!/usr/bin/env bash
# stop-supabase.sh — stops Supabase Docker containers without removing images or volumes.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -q "supabase_db_smartcupleague"; then
  echo "Supabase is not running — nothing to stop."
  exit 0
fi

echo "Stopping Supabase containers..."
cd "$ROOT"
supabase stop
echo "Done. Images and volumes are intact."
echo "Restart with: supabase start   (run from project root)"
