# SmartCup League: Decentralized Football Prediction Market

A fully on-chain, house-free prediction market for football tournaments built on **Vara Network** (Gear Protocol). Players predict match scores, earn VARA rewards per match, and compete on a season-long leaderboard for a final prize pool.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Repository Structure](#repository-structure)
- [Smart Contracts](#smart-contracts)
- [Oracle Server](#oracle-server)
- [API Backend](#api-backend)
- [Frontend](#frontend)
- [Game Rules](#game-rules)
- [Environment Variables](#environment-variables)
- [Getting Started](#getting-started)
- [Deployment](#deployment)
- [Tech Stack](#tech-stack)
- [License](#license)

---

## Overview

SmartCup League is a decentralized application (dApp) where users:

1. **Connect a Polkadot wallet** (SubWallet) and deposit VARA tokens.
2. **Place score predictions** on football matches before kick-off.
3. **Earn match rewards** via a pari-mutuel pool — winners split 75% of each match pool.
4. **Accumulate leaderboard points** across the entire tournament (weighted by phase).
5. **Compete for the Final Prize Pool** — funded by 10% of every entry + unclaimed balances.

Every rule — prediction timing, payout calculation, challenge windows, prize distribution — is enforced automatically by smart contracts. There is no operator, no oracle admin, and no house edge beyond the 5% DAO treasury fee.

---

## Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                        User Browser                                │
│                    React Frontend (Vite)                           │
│          SubWallet ←→ Gear-JS / Polkadot.js                        │
└──────────────────────────┬─────────────────────────────────────────┘
                           │ REST
         ┌─────────────────┴────────────────────┐
         │           FastAPI Backend             │
         │   (leaderboard, prices, stats)        │
         │        ← Supabase · CoinGecko →       │
         └─────────────────────────────────────-─┘

         ┌──────────────────────────────────────┐
         │          Oracle Server                │
         │   (Node.js / Express / TypeScript)    │
         │  football-data.org ──► Oracle-Program │
         │  Oracle-Program ──► BolaoCore-Program │
         └──────────────────┬───────────────────┘
                            │ Gear Protocol (WS)
         ┌──────────────────┴───────────────────┐
         │           Vara Network                │
         │  ┌──────────────┐ ┌───────────────┐  │
         │  │ Oracle-      │ │  BolaoCore-   │  │
         │  │ Program      │ │  Program      │  │
         │  │ (consensus)  │ │  (betting +   │  │
         │  └──────────────┘ │   leaderboard)│  │
         │                   └───────────────┘  │
         │  ┌──────────────────────────────────┐ │
         │  │     DAO-SmartCupLeague-Program   │ │
         │  │      (governance)                │ │
         │  └──────────────────────────────────┘ │
         └──────────────────────────────────────┘
```

**Data flow for a match result:**

1. football-data.org API reports a final score.
2. Oracle Server feeds the result to **Oracle-Program** on-chain.
3. Once the configured consensus threshold is reached, Oracle-Program emits a `ResultFinalized` event.
4. Oracle Server calls `proposeFromOracle()` on **BolaoCore-Program**.
5. After the 24-hour challenge window passes, anyone can call `finalizeResult()`.
6. BolaoCore distributes the match pool to winning predictors.

---

## Repository Structure

```
smartcupleague/
├── frontend/               React + TypeScript web application
├── api/                    FastAPI Python backend (leaderboard, prices)
├── oracle-server/          Node.js/TypeScript oracle bridge to Vara
├── smart-programs/         Rust smart contracts (sails-rs)
│   ├── Oracle-Program/     Decentralized match result oracle
│   ├── BolaoCore-Program/  Prediction market & prize distribution
│   └── DAO-SmartCupLeague-Program/  Governance
└── rules.txt               Game rules reference
```

---

## Smart Contracts

All contracts are written in **Rust** using [sails-rs 0.10.2](https://github.com/gear-tech/sails) on **Gear Protocol / Vara Network**.

### Oracle-Program

Multi-feeder decentralized oracle for football match results.

| Property | Value |
|---|---|
| Consensus threshold | 2 feeders (configurable) |
| Finalization | Automatic when threshold is reached |
| Admin transfer | 2-step propose → accept |
| Tests | 13 gtest integration tests |

Key functions: `submit_result()`, `revoke_result()`, `set_threshold()`, `propose_admin()`, `accept_admin()`

### BolaoCore-Program

Main prediction market contract. Handles the full tournament lifecycle.

**Pool distribution per entry:**

| Destination | Share |
|---|---|
| Match Winner Pool | 75% |
| Season Final Prize Pool | 20% |
| DAO Treasury | 5% |

**Final Prize Pool distribution:**

| Rank | Share |
|---|---|
| 1st | 40% |
| 2nd | 25% |
| 3rd | 20% |
| 4th | 10% |
| 5th | 5% |

Key features:
- Pari-mutuel pools per match — no fixed odds
- Points weighted by tournament phase (×1 group → ×8 final)
- 24-hour optimistic challenge window before finalization
- 72-hour claim deadline; unclaimed balance sweeps to final pool
- Podium picks (champion / runner-up / third-place bonus)
- CEI pattern + arithmetic safety throughout

### DAO-SmartCupLeague-Program

Governance contract. Manages protocol proposals and DAO operations.

### Build & Test

```bash
# From any contract directory
cargo build         # Compile WASM + generate IDL + client crate
cargo test          # Run all gtest integration tests (no node required)
cargo check         # Fast type-check only
```

**Rust toolchain:** `1.91` — target `wasm32v1-none`

**WASM output:** `target/wasm32v1-none/release/<contract>.opt.wasm`

---

## Oracle Server

**Location:** `oracle-server/`  
**Runtime:** Node.js 20+ / TypeScript 5.8 / Express 5

The oracle server is the off-chain bridge between football results and on-chain contracts.

### Responsibilities

| Task | Schedule |
|---|---|
| Poll football-data.org for results | Every 2 min (`AUTO_FEED_INTERVAL_MS`) |
| Submit results to Oracle-Program | On new result |
| Propose result to BolaoCore | When oracle consensus is reached |
| Finalize results past challenge window | Boot + every 10 min |
| Serve team crest images to frontend | On request |
| Admin REST API | Always-on |

### Key REST Endpoints

| Prefix | Description |
|---|---|
| `GET /health` | Server & RPC connectivity status |
| `GET /oracle/*` | Oracle-Program queries & admin |
| `GET /bolao/*` | BolaoCore admin & finalization |
| `GET /setup/*` | Tournament registration & bulk sync |
| `GET /sports/*` | Sports API proxy (matches, fixtures) |
| `GET /wc/*` | World Cup specific endpoints |

Full API reference: [`oracle-server/README.md`](oracle-server/README.md)

### Two Signers

| Env var | Role |
|---|---|
| `GATEWAY_SEED` | Oracle-Program feeder + admin signer |
| `OPERATOR_SEED` | BolaoCore-Program operator signer |

### Persistent Data (auto-created, git-ignored)

```
oracle-server/data/
├── match-mapping.json    # BolaoMatchId ↔ SportsApiId mapping
└── kick-off-map.json     # Match kick-off timestamps
```

---

## API Backend

**Location:** `api/`  
**Runtime:** Python 3.11+ / FastAPI 0.115 / Uvicorn

Provides aggregated off-chain data to the frontend.

| Module | Endpoint | Description |
|---|---|---|
| Health | `GET /api/v1/health` | Service status |
| Leaderboard | `GET /api/v1/leaderboard` | Season rankings (Supabase) |
| Prices | `GET /api/v1/prices` | VARA token price (CoinGecko) |
| Stats | `GET /api/v1/stats` | Tournament statistics |

### Install & Run

```bash
cd api
pip install -r requirements.txt
cp .env.example .env   # fill in values
uvicorn app.main:app --reload --port 8000
```

---

## Frontend

**Location:** `frontend/`  
**Stack:** React 18.3 · TypeScript 5.7 · Vite 6.1 · Yarn 4.9.2

### Key Routes

| Route | Page |
|---|---|
| `/` | Landing page |
| `/progress` | Dashboard / Home |
| `/2026worldcup/match/:id` | Match prediction page |
| `/all-matches` | All matches |
| `/my-predictions` | User prediction history |
| `/leaderboards` | Season leaderboard |
| `/dao` | DAO Governance |
| `/terms-of-use` | Terms of Use |
| `/dao-constitution` | DAO Constitution |

### Install & Run

```bash
cd frontend
yarn install
cp .env.example .env   # fill in VITE_ vars
yarn start             # dev server on :3000
yarn build             # production build → dist/
```

**Node.js requirement:** 20.19+ or 22.12+ (Vite 6 constraint)

### Wallet Integration

- **Provider:** SubWallet via `@gear-js/wallet-connect`
- **Chain:** Vara Network (configurable via `VITE_NODE_ADDRESS`)
- **Token:** VARA (12 decimals)
- **Minimum prediction:** 3 VARA

---

## Game Rules

### Match Predictions

- **Minimum entry:** 3 VARA per match
- **One prediction per wallet per match**
- **Predictions close 10 minutes before kick-off**
- Predictions are final — no edits or cancellations

**Points per prediction:**

| Result | Points |
|---|---|
| Exact score | 3 pts |
| Correct outcome (W/D/L) | 1 pt |
| Incorrect | 0 pts |

**Phase multipliers:**

| Phase | Multiplier |
|---|---|
| Group Stage | ×1 |
| Round of 32 | ×2 |
| Round of 16 | ×3 |
| Quarter-Finals | ×4 |
| Semi-Finals | ×5 |
| Third Place | ×6 |
| Final | ×8 |

### Knockout Rounds

Players predict full-time score. For draws, they also select the penalty winner. The match winner (including penalties) determines payout and leaderboard eligibility.

### Tie-Breaking

If players tie on leaderboard points, the prize allocations for all tied positions are combined and split equally.

Full rules: [`rules.txt`](rules.txt)

---

## Environment Variables

### Frontend (`frontend/.env`)

| Variable | Description |
|---|---|
| `VITE_NODE_ADDRESS` | Vara Network WebSocket RPC (e.g. `wss://testnet.vara.network`) |
| `VITE_BOLAOCOREPROGRAM` | BolaoCore-Program on-chain address (hex) |
| `VITE_DAOPROGRAM` | DAO-SmartCupLeague-Program address (hex) |
| `VITE_ORACLE_URL` | Oracle server base URL |

### Oracle Server (`oracle-server/.env`)

| Variable | Description |
|---|---|
| `PORT` | HTTP port (default `3001`) |
| `VARA_WS` | Vara Network WebSocket RPC |
| `ORACLE_PROGRAM_ID` | Oracle-Program address (hex) |
| `BOLAO_PROGRAM_ID` | BolaoCore-Program address (hex) |
| `GATEWAY_SEED` | Feeder / oracle admin seed phrase or hex |
| `OPERATOR_SEED` | BolaoCore operator seed phrase or hex |
| `SPORTS_API_KEY` | football-data.org API key |
| `SPORTS_COMPETITION_CODE` | Competition code (e.g. `WC`) |
| `AUTO_FEED_INTERVAL_MS` | Result polling interval (default `120000`) |
| `CHALLENGE_WINDOW_MS` | Oracle challenge window (default `120000`) |
| `FINALIZE_BUFFER_MS` | Extra buffer before finalization (default `15000`) |
| `ALLOWED_ORIGINS` | CORS allowed origins |

### API (`api/.env`)

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `COINGECKO_API_KEY` | CoinGecko API key (optional, free tier works) |
| `ALLOWED_ORIGINS` | CORS allowed origins |
| `PRICE_CACHE_TTL_SECONDS` | Price cache TTL (default `300`) |

---

## Getting Started

### Prerequisites

| Tool | Version |
|---|---|
| Node.js | 20.19+ or 22.12+ |
| Yarn | 4.9.2 (frontend) / 1.22+ (oracle) |
| Python | 3.11+ |
| Rust | 1.91 (via `rust-toolchain.toml`) |
| wasm32v1-none target | (`rustup target add wasm32v1-none`) |

### 1. Clone and configure

```bash
git clone <repo-url>
cd smartcupleague
```

### 2. Deploy smart contracts

```bash
cd smart-programs/Oracle-Program
cargo build --release
# Upload .opt.wasm to Vara via https://idea.gear-tech.io

cd ../BolaoCore-Program
cargo build --release
# Upload and initialize with Oracle-Program address
```

### 3. Start the oracle server

```bash
cd oracle-server
yarn install
cp .env.txt .env   # fill in addresses and seeds
yarn dev           # TypeScript dev server
# or: yarn build && yarn start
```

### 4. Start the API backend

```bash
cd api
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000
```

### 5. Start the frontend

```bash
cd frontend
yarn install
cp .env.example .env   # or edit .env directly
yarn start             # opens http://localhost:3000
```

---

## Deployment

| Service | Platform | Config |
|---|---|---|
| Oracle Server | Render.com | `oracle-server/.render.yaml` |
| Frontend | Vercel / Render | `vite build` → static |
| API Backend | Render.com / Railway | `uvicorn` start command |
| Smart Contracts | Vara Network | Gear IDEA or CLI |

**Oracle server auto-deploy on Render:**

```yaml
# oracle-server/.render.yaml
buildCommand: yarn install && yarn build
startCommand: yarn start
```

Set all required environment variables in the Render dashboard — do not commit secrets.

---

## Tech Stack

| Layer | Technologies |
|---|---|
| Blockchain | Vara Network (Gear Protocol) |
| Smart Contracts | Rust 1.91, sails-rs 0.10.2, gtest |
| Oracle Server | Node.js 20, TypeScript 5.8, Express 5, sails-js 0.4 |
| Frontend | React 18, TypeScript 5.7, Vite 6, Gear-JS, Polkadot.js |
| API Backend | Python 3.11, FastAPI 0.115, Supabase, CoinGecko |
| Wallet | SubWallet via @gear-js/wallet-connect |
| Styling | SCSS Modules, Gear UI |
| State | React Context, TanStack Query |
| Data Source | football-data.org v4 |
| Package Manager | Yarn 4.9.2 (frontend), Yarn 1.22 (oracle) |

---

## License

MIT — see [`LICENSE`](LICENSE).
