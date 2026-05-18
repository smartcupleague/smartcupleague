#!/usr/bin/env bash
# start.sh — full dev environment startup.
#
# Flow:
#   1. Check/start Supabase Docker containers
#   2. Deploy Vara contracts (optional — skip with --skip-deploy)
#   3. Patch .env files with deployed program IDs
#   4. Start API, oracle-server, frontend (and optionally indexer) as background jobs
#
# Usage:
#   ./scripts/start.sh                         # deploy + start all services
#   ./scripts/start.sh --skip-deploy           # skip deploy, use existing .env IDs
#   ./scripts/start.sh --build                 # build WASMs before deploying
#   ./scripts/start.sh --with-indexer          # also start indexer processor + API
#   ./scripts/start.sh --skip-deploy --with-indexer
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPTS="$ROOT/scripts"
LOGS="$SCRIPTS/logs"
PIDS="$SCRIPTS/.pids"

SKIP_DEPLOY=false
BUILD_WASMS=false
WITH_INDEXER=false
for arg in "$@"; do
  case "$arg" in
    --skip-deploy)   SKIP_DEPLOY=true  ;;
    --build)         BUILD_WASMS=true  ;;
    --with-indexer)  WITH_INDEXER=true ;;
  esac
done

mkdir -p "$LOGS"

# ── 1. Supabase ───────────────────────────────────────────────────────────────
echo "=== [1/3] Supabase ==="
if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "supabase_db_smartcupleague"; then
  echo "  Already running — skipped."
else
  echo "  Starting Supabase..."
  cd "$ROOT"
  supabase start
  echo "  Ready."
fi

# ── 2. Deploy ─────────────────────────────────────────────────────────────────
echo ""
echo "=== [2/3] Deploy ==="
if [[ "$SKIP_DEPLOY" == true ]]; then
  echo "  --skip-deploy passed — using existing .env values."
else
  DEPLOY_FLAGS=""
  [[ "$BUILD_WASMS" == true ]] && DEPLOY_FLAGS="--build"
  # shellcheck source=deploy.sh
  "$SCRIPTS/deploy.sh" $DEPLOY_FLAGS
fi

# ── 3. Start services ─────────────────────────────────────────────────────────
echo ""
echo "=== [3/3] Starting services ==="

# Clear stale PIDs from a previous run
> "$PIDS"

# start_service <name> <workdir> <command>
start_service() {
  local name="$1" dir="$2" cmd="$3"
  local log="$LOGS/${name}.log"

  # Kill any previous instance tracked under the same name
  if [[ -f "$PIDS" ]]; then
    local old_pid
    old_pid="$(grep "^${name}=" "$PIDS" 2>/dev/null | cut -d= -f2 || true)"
    if [[ -n "$old_pid" ]] && kill -0 "$old_pid" 2>/dev/null; then
      echo "  [$name] Stopping stale instance (PID $old_pid)..."
      kill "$old_pid" 2>/dev/null || true
      sleep 1
    fi
  fi

  echo "  [$name] Starting → log: scripts/logs/${name}.log"
  (cd "$dir" && bash -c "$cmd" >> "$log" 2>&1) &
  local pid=$!
  # Replace or append PID entry
  if grep -q "^${name}=" "$PIDS" 2>/dev/null; then
    sed -i "s|^${name}=.*|${name}=${pid}|" "$PIDS"
  else
    echo "${name}=${pid}" >> "$PIDS"
  fi
  echo "  [$name] PID $pid"
}

# Detect Python: prefer .venv inside api/, fallback to system python/uvicorn
if [[ -f "$ROOT/api/.venv/bin/uvicorn" ]]; then
  UVICORN="$ROOT/api/.venv/bin/uvicorn"
elif command -v uvicorn &>/dev/null; then
  UVICORN="uvicorn"
else
  echo "  [api] WARNING: uvicorn not found. Skipping API."
  UVICORN=""
fi

if [[ -n "$UVICORN" ]]; then
  start_service "api" "$ROOT/api" "$UVICORN app.main:app --reload --port 8000"
fi

start_service "oracle-server" "$ROOT/oracle-server" "yarn dev"
start_service "frontend"      "$ROOT/frontend"      "yarn dev --port 3000"

if [[ "$WITH_INDEXER" == true ]]; then
  start_service "indexer-processor" "$ROOT/indexer" "yarn dev:processor"
  start_service "indexer-api"       "$ROOT/indexer" "yarn dev:api"
fi

echo ""
echo "────────────────────────────────────────────────────"
echo "  All services started."
echo ""
echo "  Logs:  $LOGS/"
[[ -n "$UVICORN" ]] && echo "  API:   http://localhost:8000"
echo "  App:   http://localhost:3000"
[[ "$WITH_INDEXER" == true ]] && echo "  GQL:   http://localhost:4350/graphql"
echo ""
echo "  Stop everything:  ./scripts/stop.sh"
echo "────────────────────────────────────────────────────"
