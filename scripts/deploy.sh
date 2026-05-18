#!/usr/bin/env bash
# deploy.sh — builds Vara WASMs (optional), deploys Oracle + BolaoCore contracts,
# and patches ORACLE_PROGRAM_ID / BOLAO_PROGRAM_ID into every .env file that needs them.
#
# Usage:
#   ./scripts/deploy.sh            # deploy only (WASMs must already be built)
#   ./scripts/deploy.sh --build    # build WASMs first, then deploy
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY_DIR="$ROOT/smart-programs/deploy"
ORACLE_SRC="$ROOT/smart-programs/Oracle-Program"
BOLAO_SRC="$ROOT/smart-programs/BolaoCore-Program"

BUILD_WASMS=false
for arg in "$@"; do
  [[ "$arg" == "--build" ]] && BUILD_WASMS=true
done

# ── helpers ──────────────────────────────────────────────────────────────────

# upsert_env <file> <KEY> <value>
# Replaces KEY=... if present, appends KEY=value if missing.
upsert_env() {
  local file="$1" key="$2" val="$3"
  if grep -q "^${key}=" "$file" 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${val}|" "$file"
  else
    echo "${key}=${val}" >> "$file"
  fi
}

# ensure_env <src_example> <dest>
# Copies .env.example → .env if .env is missing.
ensure_env() {
  local example="$1" dest="$2"
  if [[ ! -f "$dest" && -f "$example" ]]; then
    cp "$example" "$dest"
    echo "  Created $(basename "$(dirname "$dest")")/.env from .env.example"
  fi
}

# ── 1. Build WASMs ───────────────────────────────────────────────────────────
if [[ "$BUILD_WASMS" == true ]]; then
  echo "=== Building Oracle-Program WASM ==="
  (cd "$ORACLE_SRC" && cargo build --release)

  echo ""
  echo "=== Building BolaoCore-Program WASM ==="
  (cd "$BOLAO_SRC" && cargo build --release)
  echo ""
fi

# ── 2. Verify WASM files exist ───────────────────────────────────────────────
ORACLE_WASM="${ORACLE_WASM:-$ORACLE_SRC/target/wasm32-gear/release/oracle_program.opt.wasm}"
BOLAO_WASM="${BOLAO_WASM:-$BOLAO_SRC/target/wasm32-gear/release/bolao_program.opt.wasm}"

if [[ ! -f "$ORACLE_WASM" ]]; then
  echo "ERROR: Oracle WASM not found: $ORACLE_WASM"
  echo "       Run with --build or set ORACLE_WASM env var."
  exit 1
fi
if [[ ! -f "$BOLAO_WASM" ]]; then
  echo "ERROR: BolaoCore WASM not found: $BOLAO_WASM"
  echo "       Run with --build or set BOLAO_WASM env var."
  exit 1
fi

# ── 3. Load deploy .env ──────────────────────────────────────────────────────
DEPLOY_ENV="$DEPLOY_DIR/.env"
if [[ ! -f "$DEPLOY_ENV" ]]; then
  echo "ERROR: $DEPLOY_ENV not found."
  echo "       Copy $DEPLOY_DIR/.env.example → $DEPLOY_DIR/.env and fill in MNEMONIC and TREASURY."
  exit 1
fi

set -a
# shellcheck source=/dev/null
source "$DEPLOY_ENV"
set +a

export ORACLE_WASM BOLAO_WASM

# ── 4. Run deploy crate ──────────────────────────────────────────────────────
echo "=== Deploying to Vara testnet ==="
STDOUT_TMP="$(mktemp)"
trap 'rm -f "$STDOUT_TMP"' EXIT

# cargo's own messages go to stderr (visible in terminal); program's println! goes to $STDOUT_TMP
(cd "$DEPLOY_DIR" && cargo run --release) > "$STDOUT_TMP"

ORACLE_ID="$(grep '^ORACLE_PROGRAM_ID=' "$STDOUT_TMP" | cut -d= -f2-)"
BOLAO_ID="$(grep '^BOLAO_PROGRAM_ID=' "$STDOUT_TMP" | cut -d= -f2-)"

if [[ -z "$ORACLE_ID" || -z "$BOLAO_ID" ]]; then
  echo ""
  echo "ERROR: Could not parse program IDs from deploy output."
  echo "Deploy output was:"
  cat "$STDOUT_TMP"
  exit 1
fi

echo ""
echo "┌─────────────────────────────────────────────────────────────"
echo "│ ORACLE_PROGRAM_ID  = $ORACLE_ID"
echo "│ BOLAO_PROGRAM_ID   = $BOLAO_ID"
echo "└─────────────────────────────────────────────────────────────"
echo ""

# ── 5. Patch .env files ──────────────────────────────────────────────────────
echo "=== Updating .env files ==="

# oracle-server/.env → ORACLE_PROGRAM_ID + BOLAO_PROGRAM_ID
ensure_env "$ROOT/oracle-server/.env.txt" "$ROOT/oracle-server/.env"
if [[ -f "$ROOT/oracle-server/.env" ]]; then
  upsert_env "$ROOT/oracle-server/.env" "ORACLE_PROGRAM_ID" "$ORACLE_ID"
  upsert_env "$ROOT/oracle-server/.env" "BOLAO_PROGRAM_ID"  "$BOLAO_ID"
  echo "  oracle-server/.env  ← ORACLE_PROGRAM_ID, BOLAO_PROGRAM_ID"
fi

# frontend/.env → VITE_BOLAOCOREPROGRAM
ensure_env "$ROOT/frontend/.env.example" "$ROOT/frontend/.env"
if [[ -f "$ROOT/frontend/.env" ]]; then
  upsert_env "$ROOT/frontend/.env" "VITE_BOLAOCOREPROGRAM" "$BOLAO_ID"
  echo "  frontend/.env       ← VITE_BOLAOCOREPROGRAM"
fi

# indexer/.env → VARA_PROGRAM_ID (= BolaoCore)
ensure_env "$ROOT/indexer/.env.example" "$ROOT/indexer/.env"
if [[ -f "$ROOT/indexer/.env" ]]; then
  upsert_env "$ROOT/indexer/.env" "VARA_PROGRAM_ID" "$BOLAO_ID"
  echo "  indexer/.env        ← VARA_PROGRAM_ID"
fi

echo ""
echo "Deploy complete."
