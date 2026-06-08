#!/usr/bin/env bash
# deploy.sh — builds Vara WASMs (optional), deploys the full SmartCup League
# contract set, and patches program IDs into local .env files.
#
# Usage:
#   ./scripts/deploy.sh            # deploy only (WASMs must already be built)
#   ./scripts/deploy.sh --build    # build WASMs first, then deploy
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY_DIR="$ROOT/smart-programs/deploy"
ORACLE_SRC="$ROOT/smart-programs/Oracle-Program"
BOLAO_SRC="$ROOT/smart-programs/BolaoCore-Program"
FREEBET_SRC="$ROOT/smart-programs/FreebetLedger-Program"
DAO_SRC="$ROOT/smart-programs/DAO-SmartCupLeague-Program"

BUILD_WASMS=false
for arg in "$@"; do
  [[ "$arg" == "--build" ]] && BUILD_WASMS=true
done

# ── helpers ──────────────────────────────────────────────────────────────────

# upsert_env <file> <KEY> <value>
# Replaces KEY=... if present, appends KEY=value if missing.
upsert_env() {
  local file="$1" key="$2" val="$3"
  local tmp
  tmp="$(mktemp)"
  if [[ -f "$file" ]]; then
    awk -v key="$key" -v val="$val" '
      BEGIN { done = 0 }
      $0 ~ "^" key "=" { print key "=" val; done = 1; next }
      { print }
      END { if (done == 0) print key "=" val }
    ' "$file" > "$tmp"
  else
    echo "${key}=${val}" > "$tmp"
  fi
  mv "$tmp" "$file"
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

# env_value <KEY>
# Reads a simple KEY=value from deploy/.env without shell-sourcing secrets.
env_value() {
  local key="$1"
  awk -F= -v key="$key" '
    $1 == key {
      sub(/^[^=]*=/, "")
      gsub(/^"|"$/, "")
      print
      exit
    }
  ' "$DEPLOY_ENV" 2>/dev/null
}

load_deploy_env() {
  local line key val
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
    [[ "$line" != *=* ]] && continue
    key="${line%%=*}"
    val="${line#*=}"
    key="$(printf '%s' "$key" | xargs)"
    [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue
    val="${val#"${val%%[![:space:]]*}"}"
    val="${val%"${val##*[![:space:]]}"}"
    val="${val%\"}"
    val="${val#\"}"
    export "$key=$val"
  done < "$DEPLOY_ENV"
}

# ── 1. Build WASMs ───────────────────────────────────────────────────────────
if [[ "$BUILD_WASMS" == true ]]; then
  echo "=== Building Oracle-Program WASM ==="
  (cd "$ORACLE_SRC" && cargo build --release)

  echo ""
  echo "=== Building BolaoCore-Program WASM ==="
  (cd "$BOLAO_SRC" && cargo build --release)

  echo ""
  echo "=== Building FreebetLedger-Program WASM ==="
  (cd "$FREEBET_SRC" && cargo build --release)

  echo ""
  echo "=== Building DAO-SmartCupLeague-Program WASM ==="
  (cd "$DAO_SRC" && cargo build --release)
  echo ""
fi

# ── 2. Verify WASM files exist ───────────────────────────────────────────────
ORACLE_WASM="${ORACLE_WASM:-$ORACLE_SRC/target/wasm32-gear/release/oracle_program.opt.wasm}"
BOLAO_WASM="${BOLAO_WASM:-$BOLAO_SRC/target/wasm32-gear/release/bolao_program.opt.wasm}"
FREEBET_LEDGER_WASM="${FREEBET_LEDGER_WASM:-$FREEBET_SRC/target/wasm32-gear/release/smartcup_freebet_ledger.opt.wasm}"
DAO_WASM="${DAO_WASM:-$DAO_SRC/target/wasm32-gear/release/dao_program.opt.wasm}"

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
if [[ ! -f "$FREEBET_LEDGER_WASM" ]]; then
  echo "ERROR: FreebetLedger WASM not found: $FREEBET_LEDGER_WASM"
  echo "       Run with --build or set FREEBET_LEDGER_WASM env var."
  exit 1
fi
if [[ ! -f "$DAO_WASM" ]]; then
  echo "ERROR: DAO WASM not found: $DAO_WASM"
  echo "       Run with --build or set DAO_WASM env var."
  exit 1
fi

# ── 3. Load deploy .env ──────────────────────────────────────────────────────
DEPLOY_ENV="$DEPLOY_DIR/.env"
if [[ ! -f "$DEPLOY_ENV" ]]; then
  echo "ERROR: $DEPLOY_ENV not found."
  echo "       Copy $DEPLOY_DIR/.env.example → $DEPLOY_DIR/.env and fill in MNEMONIC and TREASURY."
  exit 1
fi

load_deploy_env
export ORACLE_WASM BOLAO_WASM FREEBET_LEDGER_WASM DAO_WASM
DEPLOY_NETWORK="${VARA_NETWORK:-$(env_value VARA_NETWORK)}"
DEPLOY_NETWORK="${DEPLOY_NETWORK:-testnet}"

# ── 4. Run deploy crate ──────────────────────────────────────────────────────
echo "=== Deploying SmartCup League contracts ==="
STDOUT_TMP="$(mktemp)"
trap 'rm -f "$STDOUT_TMP"' EXIT

# cargo's own messages go to stderr (visible in terminal); program's println! goes to $STDOUT_TMP
(cd "$DEPLOY_DIR" && cargo run --release --bin deploy) > "$STDOUT_TMP"

ORACLE_ID="$(grep '^ORACLE_PROGRAM_ID=' "$STDOUT_TMP" | cut -d= -f2-)"
BOLAO_ID="$(grep '^BOLAO_PROGRAM_ID=' "$STDOUT_TMP" | cut -d= -f2-)"
FREEBET_LEDGER_ID="$(grep '^FREEBET_LEDGER_ID=' "$STDOUT_TMP" | cut -d= -f2-)"
DAO_ID="$(grep '^DAO_PROGRAM_ID=' "$STDOUT_TMP" | cut -d= -f2-)"
BOLAO_CODE_ID="$(grep '^BOLAO_CODE_ID=' "$STDOUT_TMP" | cut -d= -f2-)"

if [[ -z "$ORACLE_ID" || -z "$BOLAO_ID" || -z "$FREEBET_LEDGER_ID" || -z "$DAO_ID" ]]; then
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
echo "│ FREEBET_LEDGER_ID  = $FREEBET_LEDGER_ID"
echo "│ DAO_PROGRAM_ID     = $DAO_ID"
if [[ -n "$BOLAO_CODE_ID" ]]; then
  echo "│ BOLAO_CODE_ID      = $BOLAO_CODE_ID"
fi
echo "└─────────────────────────────────────────────────────────────"
echo ""

# ── 5. Patch .env files ──────────────────────────────────────────────────────
echo "=== Updating .env files ==="

# oracle-server/.env → ORACLE_PROGRAM_ID + BOLAO_PROGRAM_ID
ensure_env "$ROOT/oracle-server/.env.txt" "$ROOT/oracle-server/.env"
if [[ -f "$ROOT/oracle-server/.env" ]]; then
  upsert_env "$ROOT/oracle-server/.env" "ORACLE_PROGRAM_ID" "$ORACLE_ID"
  upsert_env "$ROOT/oracle-server/.env" "BOLAO_PROGRAM_ID"  "$BOLAO_ID"
  if [[ "$DEPLOY_NETWORK" == "mainnet" ]]; then
    upsert_env "$ROOT/oracle-server/.env" "VARA_WS" "wss://rpc.vara.network"
  fi
  echo "  oracle-server/.env  ← ORACLE_PROGRAM_ID, BOLAO_PROGRAM_ID"
fi

# frontend/.env → visible program IDs
ensure_env "$ROOT/frontend/.env.example" "$ROOT/frontend/.env"
if [[ -f "$ROOT/frontend/.env" ]]; then
  upsert_env "$ROOT/frontend/.env" "VITE_BOLAOCOREPROGRAM" "$BOLAO_ID"
  upsert_env "$ROOT/frontend/.env" "VITE_DAOPROGRAM" "$DAO_ID"
  upsert_env "$ROOT/frontend/.env" "VITE_FREEBET_LEDGER_ID" "$FREEBET_LEDGER_ID"
  if [[ "$DEPLOY_NETWORK" == "mainnet" ]]; then
    upsert_env "$ROOT/frontend/.env" "VITE_NODE_ADDRESS" "wss://rpc.vara.network"
  fi
  echo "  frontend/.env       ← VITE_BOLAOCOREPROGRAM, VITE_DAOPROGRAM, VITE_FREEBET_LEDGER_ID"
fi

# rewards-backend/.env → FreebetLedger
ensure_env "$ROOT/rewards-backend/.env.example" "$ROOT/rewards-backend/.env"
if [[ -f "$ROOT/rewards-backend/.env" ]]; then
  upsert_env "$ROOT/rewards-backend/.env" "FREEBET_LEDGER_ID" "$FREEBET_LEDGER_ID"
  if [[ "$DEPLOY_NETWORK" == "mainnet" ]]; then
    upsert_env "$ROOT/rewards-backend/.env" "NODE_URL" "wss://archive-rpc.vara.network"
  fi
  echo "  rewards-backend/.env ← FREEBET_LEDGER_ID"
fi

# voucher-backend/.env → program IDs for gasless whitelist seed
ensure_env "$ROOT/voucher-backend/.env.example" "$ROOT/voucher-backend/.env"
if [[ -f "$ROOT/voucher-backend/.env" ]]; then
  upsert_env "$ROOT/voucher-backend/.env" "BOLAO_PROGRAM_ID"   "$BOLAO_ID"
  upsert_env "$ROOT/voucher-backend/.env" "ORACLE_PROGRAM_ID"  "$ORACLE_ID"
  upsert_env "$ROOT/voucher-backend/.env" "DAO_PROGRAM_ID"     "$DAO_ID"
  upsert_env "$ROOT/voucher-backend/.env" "FREEBET_LEDGER_ID"  "$FREEBET_LEDGER_ID"
  echo "  voucher-backend/.env ← BOLAO_PROGRAM_ID, ORACLE_PROGRAM_ID, DAO_PROGRAM_ID, FREEBET_LEDGER_ID"
fi

# indexer/.env → VARA_PROGRAM_ID (= BolaoCore)
ensure_env "$ROOT/indexer/.env.example" "$ROOT/indexer/.env"
if [[ -f "$ROOT/indexer/.env" ]]; then
  upsert_env "$ROOT/indexer/.env" "VARA_PROGRAM_ID" "$BOLAO_ID"
  if [[ "$DEPLOY_NETWORK" == "mainnet" ]]; then
    upsert_env "$ROOT/indexer/.env" "VARA_RPC_URL" "wss://archive-rpc.vara.network"
  fi
  echo "  indexer/.env        ← VARA_PROGRAM_ID"
fi

echo ""
echo "Deploy complete."
