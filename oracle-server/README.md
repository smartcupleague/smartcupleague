# SmartCup Oracle Server

Node.js/TypeScript service that bridges off-chain football data to the SmartCup League smart contracts on Vara Network. It holds a **gateway signer** and an **operator signer**, polls match results from football-data.org, submits them to **Oracle-Program**, and automatically drives **BolaoCore-Program** through the full match lifecycle (propose → challenge window → finalize).

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Project Structure](#project-structure)
- [Match Lifecycle](#match-lifecycle)
- [Auto-Feeder & Auto-Finalization](#auto-feeder--auto-finalization)
- [Match ID Mapping](#match-id-mapping)
- [API Reference](#api-reference)
  - [Health](#health)
  - [Oracle Queries](#oracle-queries)
  - [Oracle Admin](#oracle-admin)
  - [Oracle Feeder](#oracle-feeder)
  - [BolaoCore Admin](#bolaocore-admin)
  - [Setup (Tournament Registration)](#setup-tournament-registration)
  - [Sports API Bridge](#sports-api-bridge)
  - [World Cup](#world-cup)
- [Sports API Integration](#sports-api-integration)
- [Address Formats](#address-formats)
- [Security](#security)
- [Deployment](#deployment)
- [Scripts](#scripts)

---

## Overview

The Oracle Server solves the off-chain data problem: BolaoCore needs verified football results to settle predictions. This server:

1. **Feeds results** — polls [football-data.org](https://www.football-data.org/) for finished matches and submits them to Oracle-Program via `submitResult()`.
2. **Auto-finalizes** — after Oracle-Program reaches consensus, it calls `proposeFromOracle()` on BolaoCore, then schedules `finalizeResult()` once the challenge window expires.
3. **Recovers on boot** — scans BolaoCore on startup for any matches stuck in `Proposed` state past the challenge window and finalizes them automatically.
4. **Serves team crests** — accumulates team crest URLs from the sports API and exposes them to the frontend so flags are shown without exposing the API key.
5. **Exposes admin endpoints** — full REST control over Oracle-Program and BolaoCore without needing a wallet UI.

```
football-data.org (public sports API)
          │
          │  HTTP (fetch)
          ▼
  smartcup-oracle-server
   ├── auto-feeder loop (every AUTO_FEED_INTERVAL_MS)
   ├── recovery scan on boot + every 10 min
   └── REST API (Express)
          │
          │  Gear Protocol (WebSocket RPC)
          ▼
    Vara Network
    ├── Oracle-Program   →  consensus result store
    │         │ ConsensusReached event
    │         ▼
    └── BolaoCore-Program  →  prediction settlement
```

---

## Architecture

```
src/
├── server.ts     Express app, all route handlers, auto-feed & auto-finalize scheduler
├── oracle.ts     Oracle-Program sails-js client + types
├── bolao.ts      BolaoCore-Program sails-js client + types (queryState, cancelProposedResult, etc.)
└── types.d.ts    Ambient type declarations

data/             (auto-created, gitignored)
├── match-mapping.json   bolaoMatchId → sportsApiId (persists across restarts)
└── kick-off-map.json    bolaoMatchId → kick-off timestamp (ms)
```

**Key design decisions:**

- **Lazy GearApi singleton** — connects on first inbound request, reused across all calls.
- **Two signers** — `GATEWAY_SEED` for Oracle-Program (feeder/admin), `OPERATOR_SEED` for BolaoCore setup calls.
- **Persistent match mapping** — `data/match-mapping.json` survives server restarts so the auto-feeder can always resolve sports IDs.
- **Auto-finalize** — after `ConsensusReached`, `proposeFromOracle()` is called immediately, then `finalizeResult()` is scheduled after `CHALLENGE_WINDOW_MS + FINALIZE_BUFFER_MS`.
- **Boot recovery** — on startup, `recoverProposedMatches()` scans BolaoCore state for `Proposed` matches that are past the challenge window and finalizes them (staggered by 3 s each to avoid nonce collisions).
- **Crest accumulator** — every fixture fetch populates an in-process `crestsAccumulator` map (teamName → crestUrl), exposed via `GET /sports/crests` and `GET /sports/match-crests`.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js ≥ 18 |
| Framework | Express 5 |
| Language | TypeScript 5.8 |
| Blockchain SDK | @gear-js/api 0.42 (Gear Protocol) |
| Polkadot Layer | @polkadot/api 16 · @polkadot/keyring |
| Contract Client | sails-js 0.4 |
| Sports API | football-data.org v4 |
| Security Headers | helmet 7 |
| Build | `tsc` → `dist/` |
| Dev Server | ts-node-dev (hot reload) |

---

## Prerequisites

- Node.js ≥ 18 and Yarn
- Two funded Vara accounts:
  - `GATEWAY_SEED` — authorized feeder + admin of Oracle-Program
  - `OPERATOR_SEED` — operator of BolaoCore-Program (for registering phases/matches)
- Deployed Oracle-Program address (`ORACLE_PROGRAM_ID`)
- Deployed BolaoCore-Program address (`BOLAO_PROGRAM_ID`)
- A football-data.org API key (free tier at [football-data.org/client/register](https://www.football-data.org/client/register))

---

## Getting Started

```bash
# Install dependencies
yarn install

# Configure environment
cp .env.txt .env
# Fill in all required variables (see Environment Variables section)

# Start development server (hot reload)
yarn dev

# Build for production
yarn build

# Start production server
yarn start
```

The server starts on `http://localhost:3001` (configurable via `PORT`).
`GET /health` confirms RPC connectivity and signer balances.

---

## Environment Variables

```bash
# Server
PORT=3001

# Vara Network
VARA_WS=wss://testnet.vara.network          # WebSocket RPC endpoint

# Smart Contracts
ORACLE_PROGRAM_ID=0x<64 hex chars>          # Oracle-Program on-chain address
BOLAO_PROGRAM_ID=0x<64 hex chars>           # BolaoCore-Program on-chain address

# Signers
GATEWAY_SEED=0x<hex seed>                   # Feeder + Oracle admin — never commit this
OPERATOR_SEED=0x<hex seed>                  # BolaoCore operator — never commit this

# Sports API (football-data.org)
SPORTS_API_KEY=<your-api-key>
SPORTS_COMPETITION_CODE=WC                  # Primary competition (WC = World Cup 2026)
FRIENDLIES_COMPETITION_CODES=PL,CL         # Extra competitions fetched for crest accumulation

# Auto-feeder scheduler
AUTO_FEED_INTERVAL_MS=120000                # ms between auto-feed polls (0 = disabled)

# Challenge window (must match BolaoCore contract config)
CHALLENGE_WINDOW_MS=120000                  # 2 min — window after Proposed before finalization
FINALIZE_BUFFER_MS=15000                    # Extra safety buffer added on top of the window

# CORS
ALLOWED_ORIGINS=*                           # comma-separated allowed origins
```

> **Security:** Both seed phrases sign on-chain transactions. Store them as secret environment variables. Never hardcode or commit them.

---

## Project Structure

```
oracle-server/
├── src/
│   ├── server.ts         App, routes, schedulers, auto-finalize logic
│   ├── oracle.ts         Oracle-Program sails-js client + types
│   ├── bolao.ts          BolaoCore-Program sails-js client + types
│   └── types.d.ts        Ambient declarations
├── data/                 Auto-created at runtime (gitignored)
│   ├── match-mapping.json
│   └── kick-off-map.json
├── .env.txt              Environment variable template
├── .render.yaml          Render.com deployment manifest
├── tsconfig.json
├── package.json
└── yarn.lock
```

---

## Match Lifecycle

```
1. POST /setup/sync-tournament   (or /setup/register-match)
        registers match in BolaoCore + Oracle, saves bolaoId → sportsApiId to match-mapping.json

2. Auto-feeder polls football-data.org every AUTO_FEED_INTERVAL_MS
        → if FINISHED: oracle.submitResult(bolaoId, home, away, penalty_winner)

3. Oracle-Program emits ConsensusReached
        → server calls bolao.proposeFromOracle(bolaoId)
        → BolaoCore match enters Proposed state

4. Challenge window (CHALLENGE_WINDOW_MS) passes
        → server calls bolao.finalizeResult(bolaoId)
        → BolaoCore match enters Finalized state
        → users can claim rewards

Boot recovery: any Proposed match found past the challenge window on startup is
finalized automatically (staggered 3 s apart to avoid nonce collisions).
```

**Penalty winner rule:** `penalty_winner` is only set when `home === away` at full time AND both penalty scores are non-null. For any other result it is always `null`.

---

## Auto-Feeder & Auto-Finalization

A background loop runs every `AUTO_FEED_INTERVAL_MS`:

```
1. oracle.queryPendingMatches()
2. For each pending match_id:
   → resolve sportsApiId from matchIdToSportsId map
   → fetchSportMatch(sportsApiId)
   → if FINISHED: submitResult(match_id, home, away, penalty_winner)
```

When `submitResult` reaches consensus threshold:
```
3. bolao.proposeFromOracle(match_id)
4. setTimeout(CHALLENGE_WINDOW_MS + FINALIZE_BUFFER_MS):
   → bolao.finalizeResult(match_id)
```

**Recovery scan** runs on boot and every 10 minutes:
```
queryState() → find matches where result.proposed exists
→ if kick_off + CHALLENGE_WINDOW_MS < now: finalizeResult (staggered 3 s)
```

To disable the feeder: set `AUTO_FEED_INTERVAL_MS=0`.

---

## Match ID Mapping

BolaoCore uses sequential IDs (1, 2, 3…). Football-data.org uses large numeric IDs (538106, 545962…).

The server maintains a persistent bidirectional mapping in `data/match-mapping.json`:

```json
{ "1": 538106, "2": 545962, "3": 537144 }
```

This file is loaded on startup and updated on every match registration. It survives server restarts, ensuring the auto-feeder can always resolve the correct sports API ID for each BolaoCore match.

As more matches are registered (via `/setup/sync-tournament` or `/setup/register-match`), the file grows automatically and the frontend's `/sports/match-crests` endpoint picks up the new team crests.

---

## API Reference

All responses are JSON. On error every handler returns:
```json
{ "ok": false, "error": "<human-readable message>" }
```

---

### Health

#### `GET /health`

Returns server status, program addresses, signer balances, and sports API config.

```json
{
  "ok": true,
  "time": "2026-04-19T12:00:00.000Z",
  "rpc": "wss://testnet.vara.network",
  "oracleProgram": "0x...",
  "bolaoProgram": "0x...",
  "sportsCompetition": "WC",
  "autoFeedIntervalMs": 120000,
  "signer": { "ss58": "kGg...", "hex": "0x...", "nativeBalance": "42.5" }
}
```

---

### Oracle Queries

Read-only. No gas. No wallet required.

#### `GET /oracle/state`

Full Oracle-Program state snapshot: admin, feeders, threshold, all results.

#### `GET /oracle/results`

All match entries (Pending and Finalized).

#### `GET /oracle/result/:matchId`

Single finalized result. Returns `null` if not yet finalized.

#### `GET /oracle/pending`

Match IDs registered but not yet finalized.

```json
{ "ok": true, "pending": [1, 2, 3] }
```

---

### Oracle Admin

Signed by `GATEWAY_SEED`. Signer must be Oracle-Program admin.

#### `POST /oracle/register-match`

Pre-registers a match ID for submissions.

```json
{ "match_id": 1 }
```

#### `POST /oracle/force-finalize`

Admin override — locks a result immediately, bypassing consensus.

```json
{ "match_id": 1, "home": 2, "away": 1, "penalty_winner": null }
```

| Field | Type | Notes |
|---|---|---|
| `match_id` | `number` | 0 – 10000 |
| `home` | `number` | 0 – 255 |
| `away` | `number` | 0 – 255 |
| `penalty_winner` | `"Home" \| "Away" \| null` | Only valid for draws (`home === away`) |

#### `POST /oracle/cancel-result`

Resets a pending match, clearing all submissions.

```json
{ "match_id": 1 }
```

#### `POST /oracle/set-feeder`

Authorize or revoke a feeder account.

```json
{ "feeder": "SS58 or 0x...", "authorized": true }
```

#### `POST /oracle/set-threshold`

Set consensus threshold (1–20).

```json
{ "threshold": 1 }
```

#### `POST /oracle/set-bolao-program`

Register BolaoCore address in Oracle-Program.

```json
{ "program_id": "SS58 or 0x..." }
```

#### `POST /oracle/add-operator` / `POST /oracle/remove-operator`

Add or remove an operator in Oracle-Program.

```json
{ "operator": "SS58 or 0x..." }
```

#### `POST /oracle/propose-admin` / `POST /oracle/accept-admin`

2-step admin transfer. `propose-admin` sets the pending admin; `accept-admin` (no body) confirms.

```json
{ "new_admin": "SS58 or 0x..." }
```

---

### Oracle Feeder

Signed by `GATEWAY_SEED`. Signer must be an authorized feeder.

#### `POST /oracle/submit-result`

Submit a match result manually. Finalizes automatically once consensus threshold is reached.

```json
{ "match_id": 1, "home": 2, "away": 1, "penalty_winner": null }
```

#### `POST /oracle/feed-match/:matchId`

Fetches the result from football-data.org and submits it in one step. Returns `422` if not finished.

---

### BolaoCore Admin

Signed by `GATEWAY_SEED`. Signer must be a BolaoCore admin.

#### `POST /bolao/register-phase`

Register a betting phase in BolaoCore.

```json
{
  "name": "Friendlies_April_2026",
  "start_time": 1744000000000,
  "end_time":   1746000000000,
  "points_weight": 1
}
```

#### `POST /bolao/register-match`

Register a single match in BolaoCore only (no Oracle).

```json
{
  "phase": "Friendlies_April_2026",
  "home_team": "Brazil",
  "away_team": "France",
  "kick_off": 1744100000000
}
```

#### `POST /bolao/propose-from-oracle`

Triggers BolaoCore to query Oracle-Program and set the match to `Proposed` state.

```json
{ "match_id": 1 }
```

#### `POST /bolao/finalize-result`

Finalizes a `Proposed` match after the challenge window. Permissionless on-chain, but this endpoint uses `GATEWAY_SEED`.

```json
{ "match_id": 1 }
```

#### `POST /bolao/cancel-proposed-result`

Cancels a `Proposed` match result, resetting it to `Unresolved`. Use to correct an incorrect result before the challenge window expires.

```json
{ "match_id": 1 }
```

#### `POST /bolao/add-admin` / `POST /bolao/remove-admin`

Add or remove a BolaoCore admin.

```json
{ "new_admin": "SS58 or 0x..." }
```

#### `POST /bolao/add-operator` / `POST /bolao/remove-operator`

Add or remove a BolaoCore operator.

```json
{ "operator": "SS58 or 0x..." }
```

#### `POST /bolao/set-treasury`

Set the BolaoCore treasury address.

```json
{ "treasury": "SS58 or 0x..." }
```

---

### Setup (Tournament Registration)

High-level endpoints that atomically register matches in both Oracle-Program and BolaoCore.

#### `POST /setup/register-phase`

Registers a phase in BolaoCore via `OPERATOR_SEED`.

```json
{
  "name": "Friendlies_April_2026",
  "start_time": 1744000000000,
  "end_time":   1746000000000,
  "points_weight": 1
}
```

#### `POST /setup/register-match`

Atomically registers one match in both BolaoCore and Oracle-Program. Also saves the `bolaoMatchId → sportsApiId` mapping to disk.

```json
{
  "phase": "Friendlies_April_2026",
  "home_team": "Juventus FC",
  "away_team": "AC Milan",
  "kick_off": 1744100000000,
  "oracle_match_id": 538106
}
```

#### `POST /setup/sync-tournament`

Bulk-registers all fixtures for a competition stage directly from football-data.org. Registers the phase in BolaoCore, then each fixture in both contracts. Supports `dry_run: true` to preview without sending transactions.

```json
{
  "phase_name": "Friendlies_April_2026",
  "start_time": 1744000000000,
  "end_time": 1746000000000,
  "points_weight": 1,
  "stage_filter": "REGULAR_SEASON",
  "status_filter": "SCHEDULED",
  "bolao_next_id": 1,
  "dry_run": false
}
```

`stage_filter` is required for live runs to prevent accidentally mixing stages under one phase.

#### `GET /setup/match-mapping`

Returns the current in-memory `bolaoMatchId ↔ sportsApiId` mapping.

```json
{
  "ok": true,
  "count": 3,
  "mapping": [
    { "bolao_match_id": 1, "sports_api_id": 538106 },
    { "bolao_match_id": 2, "sports_api_id": 545962 },
    { "bolao_match_id": 3, "sports_api_id": 537144 }
  ]
}
```

#### `POST /match/register-both`

Alias for registering a match in both contracts simultaneously (same as `/setup/register-match`).

---

### Sports API Bridge

These endpoints proxy football-data.org. No on-chain transactions.

#### `GET /sports/match/:id`

Raw match data by football-data.org numeric ID.

#### `GET /sports/finished`

All finished matches for `SPORTS_COMPETITION_CODE`.

#### `GET /sports/matches`

Transparent proxy to `/v4/matches`. All query params forwarded (`dateFrom`, `dateTo`, `competitions`, `status`, etc.).

Example: `GET /sports/matches?dateFrom=2026-04-16&dateTo=2026-04-30`

#### `GET /sports/competition/:code/matches`

All matches for a given competition code (e.g., `PL`, `CL`). Accepts optional `?status=SCHEDULED`.

#### `GET /sports/crests`

Returns all team crest URLs accumulated from every fixture fetch since server start. Used by the frontend to display team images without exposing the API key.

```json
{
  "ok": true,
  "count": 64,
  "crests": {
    "Brazil": "https://crests.football-data.org/764.svg",
    "France": "https://crests.football-data.org/773.svg"
  }
}
```

If the accumulator is empty on boot, the endpoint actively fetches WC fixtures and team data to warm it up.

#### `GET /sports/match-crests`

Returns team crests specifically for the matches registered in BolaoCore, using the `matchIdToSportsId` mapping. Also populates `crestsAccumulator` as a side-effect.

```json
{
  "ok": true,
  "count": 3,
  "matches": {
    "1": {
      "home": { "name": "Juventus FC", "shortName": "Juventus", "crest": "https://crests.football-data.org/109.svg" },
      "away": { "name": "AC Milan",    "shortName": "Milan",    "crest": "https://crests.football-data.org/98.svg" }
    }
  }
}
```

As more matches are registered and `match-mapping.json` grows, this endpoint automatically covers all of them.

---

### World Cup

#### `GET /wc/fixtures`

All WC 2026 fixtures. Accepts optional `?status=SCHEDULED|FINISHED|IN_PLAY`.

#### `GET /wc/standings`

Group standings for WC 2026.

#### `GET /wc/teams`

All WC 2026 participating teams with crest URLs.

#### `GET /wc/friendlies`

Friendly matches across `FRIENDLIES_COMPETITION_CODES` in the next 14 days.

#### `GET /wc/upcoming-15d`

WC fixtures in the next 15 days.

#### `POST /wc/sync`

Fetches all finished WC matches and submits each to Oracle-Program. Supports `{ "dry_run": true }` to preview.

---

## Sports API Integration

The server uses [football-data.org](https://www.football-data.org/) v4 API.

| Config | Value |
|---|---|
| Base URL | `https://api.football-data.org/v4` |
| Auth header | `X-Auth-Token: <SPORTS_API_KEY>` |
| Free tier | 10 requests/minute |
| Fixture cache TTL | 5 minutes |
| Individual match TTL | 2 minutes (non-finished) / 5 minutes (finished) |

**Competition codes:** `WC` (World Cup), `PL` (Premier League), `CL` (Champions League), `SA` (Serie A), etc.

**Penalty winner rule:**
```
if home === away AND penalties.home != null AND penalties.away != null:
    penalty_winner = penalties.home > penalties.away ? "Home" : "Away"
else:
    penalty_winner = null
```

---

## Address Formats

All address parameters accept both SS58 and `0x` hex formats. The server normalizes to hex before any chain call.

| Format | Example |
|---|---|
| SS58 | `kGgXx...` (Base58) |
| `0x` hex | `0x` + 64 hex chars (32 bytes) |

---

## Security

| Layer | Mechanism |
|---|---|
| Security headers | `helmet` on every response |
| CORS | `Origin` validated against `ALLOWED_ORIGINS` |
| Body size | JSON capped at 2 MB |
| Input validation | match_id range, score range, address format, penalty_winner only for draws |
| Auth | No HTTP auth layer — deploy behind an internal network or API gateway in production |
| Seed phrases | Store as secret env vars (Render, Railway, Fly). Never hardcode or commit. |

---

## Deployment

### Render.com (Recommended)

The auto-feeder and boot-recovery require a **persistent long-lived process**. Render Web Service (not serverless) is the correct target.

1. Push `.render.yaml` to your repository.
2. In Render dashboard → **New → Web Service** → connect your repo.
3. On the **Environment** tab, add all secret variables.
4. Click **Save Changes** → first deploy triggers.
5. Verify: `curl https://<your-service>.onrender.com/health`

### Vercel (Alternative — Serverless)

Configured via `vercel.json`. Works for query and admin endpoints but **the auto-feeder and boot-recovery will not run** in a serverless environment. Use Render or a VPS if you need the background schedulers.

---

## Scripts

```bash
yarn dev      # Dev server with hot reload (ts-node-dev)
yarn build    # Compile TypeScript → dist/
yarn start    # Run compiled server
```
