# SmartCup League API

Python / FastAPI service that complements the on-chain BolaoCore contract and the [indexer](../indexer/README.md) with stateful, off-chain data the chain cannot store cheaply: wallet display names, derived per-bet stats (exact-score counts), pool distributions per match, and cached external token prices.

This service is intentionally separate from the indexer:

| Service | Source of truth | Storage |
|---|---|---|
| **Indexer** | On-chain events (Vara) | PostgreSQL projection — read-only, fully reconstructible from chain |
| **API** (this repo) | Frontend write-throughs + CoinGecko | Supabase — holds data that has no on-chain origin |

Frontend reads from both: the indexer for cheap aggregates over chain state, this API for everything else.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Project Structure](#project-structure)
- [API Reference](#api-reference)
- [Data Model](#data-model)
- [Relationship to Other Services](#relationship-to-other-services)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

## Overview

The API exposes a versioned REST surface (`/api/v1/...`) covering four feature areas:

- **Leaderboard** — per-wallet aggregates with `matches_count`, `exact_count`, `total_claimed_planck`, and optional `display_name`. Used by the frontend Leaderboards page as enrichment on top of on-chain points.
- **Stats** — write-through endpoints (`record-bet`, `record-claim`) the frontend calls right after a successful on-chain transaction, plus pool distribution queries (`/stats/pools`, `/stats/pools/{match_id}`).
- **Prices** — current and historical VARA/USD prices, sourced from CoinGecko with TTL caching and a Supabase fallback when the upstream is unreachable.
- **Profiles** — wallet display names. One row per wallet, set by the frontend for the currently connected wallet only.

OpenAPI documentation auto-renders at `/docs` (Swagger UI) and `/redoc`.

---

## Architecture

```
                          Frontend (Vite / React)
                                   │
                                   │  fetch() /api/v1/...
                                   ▼
   ┌──────────────────────────────────────────────────────────┐
   │  app/main.py  —  FastAPI app + CORS + lifespan singletons │
   │                                                            │
   │  app/api/router.py    →  /api                              │
   │      └─ app/api/v1/router.py    →  /v1                    │
   │           ├─ endpoints/health.py     →  /health            │
   │           ├─ endpoints/prices.py     →  /prices            │
   │           ├─ endpoints/stats.py      →  /stats             │
   │           ├─ endpoints/leaderboard.py →  /leaderboard      │
   │           └─ endpoints/profiles.py   →  /profiles          │
   │                                                            │
   │  Services (singletons stored on app.state)                 │
   │      ├─ PriceService        ── caches CoinGecko hits       │
   │      └─ LeaderboardService                                 │
   │                                                            │
   │  Repositories (Supabase clients)                           │
   │      ├─ PriceRepository                                    │
   │      ├─ LeaderboardRepository                              │
   │      └─ ProfileRepository                                  │
   └──────────────────────────────────────────────────────────┘
                  │                                │
                  ▼                                ▼
         CoinGecko API (httpx)            Supabase (PostgreSQL + auth)
```

**Key design decisions:**

- **Lifespan singletons.** `PriceService` and `LeaderboardService` are created once at startup and stored on `app.state`. FastAPI's `dependency_overrides` mechanism injects the same instances into every request — keeps the in-memory price cache warm across calls.
- **Repository pattern.** Each Supabase table has a dedicated repository class. Endpoints depend on services; services depend on repositories. No SQL or HTTP calls bleed into the route handlers.
- **Pydantic Settings.** `app/core/config.py` validates every required env var at import time. Missing secrets (e.g. `SUPABASE_SERVICE_ROLE_KEY`) crash the app on boot — fail fast, not on first request.
- **No auth layer.** The API expects the frontend to only call profile/stats endpoints for the connected wallet. Production deployments should put this behind an auth gateway (Cloudflare Access, JWT middleware, etc.) before exposing it publicly.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Python ≥ 3.10 |
| Framework | FastAPI 0.115 |
| ASGI server | Uvicorn 0.32 (with `[standard]` extras) |
| Settings | Pydantic Settings 2.6 |
| HTTP client | httpx 0.27 (async) |
| Database / Auth | Supabase (PostgreSQL) 2.10 SDK |
| External price feed | CoinGecko v3 API |

---

## Prerequisites

- Python ≥ 3.10
- A Supabase project with the tables described in [Data Model](#data-model)
- (Optional) A CoinGecko API key for pro-tier rate limits — the free public tier works for development

---

## Quick Start

```bash
cd api

# Create and activate a virtual environment
python -m venv .venv
# macOS / Linux:
source .venv/bin/activate
# Windows (PowerShell):
.venv\Scripts\Activate.ps1

# Install dependencies
pip install -r requirements.txt

# Configure environment (see Configuration)
cp .env.example .env   # if present, otherwise create .env from scratch

# Run the dev server with reload
uvicorn app.main:app --reload --port 8000
```

Once up:

- **Base URL** → `http://localhost:8000/api/v1`
- **Swagger UI** → `http://localhost:8000/docs`
- **ReDoc** → `http://localhost:8000/redoc`
- **OpenAPI schema** → `http://localhost:8000/openapi.json`

Smoke test:
```bash
curl http://localhost:8000/api/v1/health/
curl http://localhost:8000/api/v1/prices/vara
curl 'http://localhost:8000/api/v1/leaderboard?limit=10'
```

---

## Configuration

All configuration is via environment variables loaded from `.env` at the `api/` root. Defined in `app/core/config.py`:

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `APP_NAME` | no | `SmartCup League API` | Title shown in OpenAPI docs |
| `APP_VERSION` | no | `1.0.0` | Reported by `/health` |
| `DEBUG` | no | `false` | Reserved for verbose-logging modes |
| `ALLOWED_ORIGINS` | no | `http://localhost:5173,http://localhost:3000` | Comma-separated CORS origins. Set to your frontend URL in prod. |
| `SUPABASE_URL` | **yes** | — | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | **yes** | — | Supabase service-role key — never expose to the frontend |
| `COINGECKO_API_KEY` | no | empty | Optional pro-tier key |
| `COINGECKO_BASE_URL` | no | `https://api.coingecko.com/api/v3` | Override for self-hosted proxies |
| `VARA_TOKEN_ID` | no | `vara-network` | CoinGecko token ID for VARA |
| `PRICE_CACHE_TTL_SECONDS` | no | `300` | TTL for the in-memory price cache (5 min default) |

> **Security:** `SUPABASE_SERVICE_ROLE_KEY` bypasses Row-Level Security. It must stay server-side. Use Supabase's `anon` key from the frontend if you need direct client access, never the service role key.

---

## Project Structure

```
api/
├── requirements.txt        Python deps (fastapi, supabase, httpx, pydantic-settings)
├── .env                    Local environment (gitignored)
└── app/
    ├── main.py             FastAPI app factory + lifespan + dependency wiring
    ├── api/
    │   ├── router.py       /api router
    │   └── v1/
    │       ├── router.py   /api/v1 router
    │       └── endpoints/
    │           ├── health.py
    │           ├── prices.py
    │           ├── stats.py
    │           ├── leaderboard.py
    │           └── profiles.py
    ├── core/
    │   ├── config.py       Settings (pydantic-settings, env validation)
    │   ├── dependencies.py Supabase client factory
    │   └── exceptions.py   PriceFetchError, PriceUnavailableError + handlers
    ├── schemas/
    │   ├── leaderboard.py  Pydantic models for leaderboard/stats
    │   ├── prices.py       Pydantic models for prices
    │   └── profiles.py     Pydantic models for profiles
    ├── services/
    │   ├── price_service.py        VARA price + cache + CoinGecko fallback
    │   ├── leaderboard_service.py  Leaderboard / pool / record-bet / record-claim
    │   └── coingecko.py            CoinGecko client
    └── repositories/
        ├── price_repository.py
        ├── leaderboard_repository.py
        └── profile_repository.py
```

---

## API Reference

All routes are namespaced under `/api/v1`. Errors return the FastAPI default body:
```json
{ "detail": "<message>" }
```

### Health

#### `GET /api/v1/health/`
Liveness probe — returns app version and a UTC timestamp.

```json
{ "status": "ok", "version": "1.0.0", "timestamp": "2026-04-19T12:00:00.000Z" }
```

---

### Prices

#### `GET /api/v1/prices/vara`
Current VARA/USD price. Served from in-memory cache (TTL `PRICE_CACHE_TTL_SECONDS`); on cache miss, CoinGecko is queried; on CoinGecko failure, the latest stored price from Supabase is returned with `source="db"`.

```json
{
  "token": "VARA",
  "usd": 0.0123,
  "source": "coingecko",
  "fetched_at": "2026-04-19T12:00:00.000Z",
  "cache_ttl_seconds": 300
}
```

#### `GET /api/v1/prices/vara/history?limit=100`
Historical price snapshots persisted in Supabase. Default `limit=100`, max `1000`.

---

### Stats (write-through)

These endpoints expect to be called by the frontend **after** a successful on-chain transaction. They are idempotent — calling them twice for the same wallet+match is silently dropped.

#### `POST /api/v1/stats/record-bet`
Records a bet placement. `amount_planck` is the gross stake paid by the bettor; `match_pool_amount_planck` is the 85% match-pool amount used by payout math.
```json
{
  "wallet_address": "0x...",
  "match_id": "1",
  "amount_planck": "5000000000000",
  "match_pool_amount_planck": "4250000000000",
  "predicted_outcome": "home"
}
```

#### `POST /api/v1/stats/record-claim`
Records a reward claim. `amount_planck` is the on-chain balance delta observed by the frontend; `is_exact` distinguishes 3-point claims from 1-point claims for the leaderboard `exact_count`.
```json
{
  "wallet_address": "0x...",
  "match_id": "1",
  "amount_planck": "4250000000000",
  "is_exact": true
}
```

#### `GET /api/v1/stats/pools`
Aggregate Home / Draw / Away match-pool distribution for every match with at least one recorded prediction. Amount fields are based on `match_pool_amount_planck`, while bet counts still count bettors.

#### `GET /api/v1/stats/pools/{match_id}`
Same shape as above, scoped to one match. Returns a zeroed record (not 404) when no data exists — UI handles "no data" gracefully.

---

### Leaderboard

#### `GET /api/v1/leaderboard?limit=500`
Per-wallet aggregates ordered by `total_claimed_planck DESC`. Default `limit=500`, max `2000`. The frontend merges this with on-chain points and the indexer's user_stat to produce the final ranking.

```json
{
  "rows": [
    {
      "wallet_address": "0x...",
      "display_name": "Alice",
      "matches_count": 42,
      "exact_count": 7,
      "outcome_count": 19,
      "total_claimed_planck": "84000000000000"
    }
  ],
  "total": 1
}
```

---

### Profiles

#### `GET /api/v1/profiles/{wallet_address}`
Returns the display name for a wallet, or `null` when none has been set. Wallet addresses are normalised to lowercase.

#### `PUT /api/v1/profiles/{wallet_address}`
Upserts the display name. The frontend must call this only for the connected wallet — there is no auth gate at the API layer.
```json
{ "display_name": "Alice" }
```

---

## Data Model

The API persists all writeable state in Supabase. Tables (Supabase-managed schema):

| Table | Used by | Purpose |
|---|---|---|
| `wallet_profiles` | `ProfileRepository` | One row per wallet — display name |
| `wallet_stats` (or equivalent) | `LeaderboardRepository` | Aggregated `matches_count`, `exact_count`, `total_claimed_planck` per wallet |
| `match_pools` | `LeaderboardRepository` | Per-match tally of Home / Draw / Away bets |
| `vara_price_history` | `PriceRepository` | Time-series of VARA/USD price snapshots |

> Exact column names live in the repository classes — inspect `app/repositories/*.py` for the source of truth. The API does not own DDL; create the tables directly in Supabase before running the service.

The schemas accept on-chain identifiers as strings (so `u128` planck amounts and `u64` match IDs stay precise across the JSON boundary).

---

## Relationship to Other Services

```
                                    ┌──────────────────────┐
                                    │  Vara Network        │
                                    │  (BolaoCore + Oracle)│
                                    └──────────────────────┘
                                          │
                ┌─────────────────────────┼─────────────────────────────┐
                │                         │                             │
                ▼                         ▼                             ▼
   ┌──────────────────┐        ┌──────────────────┐         ┌──────────────────┐
   │  oracle-server   │        │     indexer      │         │    api (this)    │
   │  (Node + Express)│        │  (TS + Postgres) │         │  (Python/FastAPI)│
   │                  │        │                  │         │                  │
   │  • Feeds results │        │  • Subscribes to │         │  • Wallet display│
   │    to Oracle     │        │    chain events  │         │    names         │
   │  • Drives        │        │  • Projects them │         │  • Per-bet stats │
   │    BolaoCore     │        │    into entities │         │    written by FE │
   │  • Sports API    │        │  • PostGraphile  │         │  • CoinGecko     │
   │    bridge        │        │    GraphQL :4350 │         │    price cache   │
   └──────────────────┘        └──────────────────┘         └──────────────────┘
                │                         │                             │
                └─────────────────────────┼─────────────────────────────┘
                                          ▼
                                ┌──────────────────┐
                                │     frontend     │
                                │   (Vite/React)   │
                                └──────────────────┘
```

**This API does NOT:**
- Send transactions to Vara — it never holds a chain signer.
- Mirror chain state — write-through endpoints only record what the frontend says happened *after* a successful tx. Authoritative chain data lives in the contract or in the indexer.
- Replace the indexer — the indexer's GraphQL is faster for chain-sourced aggregates.

**The frontend should prefer:**
- Indexer (`/graphql`) for on-chain aggregates (leaderboard from `userStat`, match list from `bolaoMatch`).
- This API for off-chain enrichment (display names, exact-score counts, pool distribution, prices).
- Direct chain queries for live state that must be authoritative *right now* (`pending_refunds`, `claimed` flag pre-claim).

---

## Deployment

### Docker / container platforms

The service is a stateless ASGI app. Any container platform works:

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
ENV PORT=8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### Render / Railway / Fly

`uvicorn app.main:app --host 0.0.0.0 --port $PORT` is the standard start command. Configure the Supabase secrets and `ALLOWED_ORIGINS` from the platform's env-var UI.

### Behind a reverse proxy

If you put nginx / Cloudflare in front, make sure CORS responses come from FastAPI (not the proxy) — the `CORSMiddleware` only fires for origins in `ALLOWED_ORIGINS`. Over-broad CORS combined with an unauthenticated `PUT /profiles/{wallet}` allows anyone to overwrite display names — set `ALLOWED_ORIGINS` to your frontend domain only in production.

### Production checklist

- [ ] `ALLOWED_ORIGINS` restricted to your frontend domain
- [ ] `SUPABASE_SERVICE_ROLE_KEY` stored as a secret env var, never in repo
- [ ] CoinGecko key set if you expect more than 30 RPM
- [ ] Supabase RLS policies in place (the service role key bypasses them — but if anything else accesses these tables, RLS still matters)
- [ ] Auth layer in front of `PUT /profiles/{wallet}` and `POST /stats/*` if exposed publicly
- [ ] Logs shipped to your aggregator (the app uses Python `logging` at INFO level)

---

## Troubleshooting

**`ValidationError: SUPABASE_URL field required` on startup.**
Pydantic Settings validated the env at import time and one of the required vars is missing. Check `.env` exists at `api/` root and contains both `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

**`/prices/vara` returns `source: "db"`.**
CoinGecko was unreachable when the cache expired; the service fell back to the latest snapshot in Supabase. Investigate CoinGecko rate limits or upstream outage. The API stays usable.

**`/prices/vara` errors with 503.**
Both CoinGecko AND the database fallback failed. Check `vara_price_history` in Supabase — if the table is empty, run the service for one successful CoinGecko hit to seed it.

**CORS errors in the frontend console.**
The frontend origin is not in `ALLOWED_ORIGINS`. Update the env var and restart the API. Note that browsers cache preflight responses for several minutes — hard reload after the fix.

**`/leaderboard` is empty but you see bets on chain.**
This API only sees writes from the frontend's `record-bet` / `record-claim` calls. If those calls are not firing (network tab), the API stays empty. The on-chain state and the indexer are unaffected — they are independent sources.

**Display name updates appear globally for any wallet.**
Confirmed working as designed — the API has no auth. The expectation is that the frontend only calls `PUT /profiles/{wallet}` for the connected wallet. If you need stronger guarantees, add a JWT middleware that verifies a signature from the wallet over the address being modified.

---

## License

Licensed under the [MIT License](../LICENSE). Copyright © 2026 Rafael Machtura.
