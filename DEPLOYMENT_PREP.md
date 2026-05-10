# Deployment Prep Before Contract Launch

Use this checklist when the frontend and backend infrastructure should be ready before the Vara smart contracts are deployed.

## Current Goal

Prepare Vercel and Render so the final launch only requires:

1. Deploying the Vara programs.
2. Replacing placeholder program IDs and signer env vars.
3. Redeploying the affected services.
4. Enabling oracle automation.


## Deployment Phases

### Phase 1: Frontend Shell and API Backend

Status: in progress.

- Vercel frontend is deployed at `https://smartcupleague-lotbq3zmk-smart-cup-league-s-projects.vercel.app`.
- Render API backend is deployed at `https://smartcupleague-api.onrender.com`.
- API health check: `https://smartcupleague-api.onrender.com/api/v1/health/`.
- CORS currently points to the Vercel URL, not `smartcupleague.com`.
- CoinMarketCap migration is skipped for now. CoinGecko API access is also not set up yet: `COINGECKO_API_KEY` is intentionally empty, so the API only uses the existing unauthenticated/public CoinGecko path for now.

### Phase 2: Oracle Server Staging

Create the Render oracle service before contracts are deployed, but keep automation disabled:

```env
AUTO_FEED_INTERVAL_MS=0
```

The oracle service should not be considered fully production-ready until real program IDs, signer seeds, and fixture mappings are configured.

### Phase 3: Smart Contract Deployment

Deploy the Vara programs last:

1. `Oracle-Program`
2. `BolaoCore-Program` initialized with the Oracle program address
3. `DAO-SmartCupLeague-Program`, if DAO UI should be live

### Phase 4: Final Wiring

Replace placeholders in Render and Vercel with real deployed addresses, redeploy, sync tournament fixtures, then enable oracle automation with:

```env
AUTO_FEED_INTERVAL_MS=120000
```

## Frontend: Vercel

Project settings:

```text
Root Directory: frontend
Framework Preset: Vite
Install Command: corepack enable && yarn install --immutable
Build Command: yarn build
Output Directory: dist
```

Environment variables:

```env
VITE_NODE_ADDRESS=wss://testnet.vara.network
VITE_BOLAOCOREPROGRAM=0xREPLACE_AFTER_BOLAOCORE_DEPLOY
VITE_DAOPROGRAM=0xREPLACE_AFTER_DAO_DEPLOY
VITE_ORACLE_URL=https://smartcupleague-oracle.onrender.com
VITE_API_URL=https://smartcupleague-api.onrender.com
VITE_INDEXER_GRAPHQL_URL=
```

The frontend can be deployed before contracts, but contract-backed pages will not work until `VITE_BOLAOCOREPROGRAM` and `VITE_DAOPROGRAM` are real program IDs.

Temporary production origin: use the current Vercel URL for CORS until `smartcupleague.com` is connected:

```text
https://smartcupleague-lotbq3zmk-smart-cup-league-s-projects.vercel.app
```

## API Backend: Render

Create a Render Web Service from the repo, or use the root `render.yaml` blueprint.

Manual settings:

```text
Root Directory: api
Runtime: Python 3
Build Command: pip install -r requirements.txt
Start Command: uvicorn app.main:app --host 0.0.0.0 --port $PORT
Health Check Path: /api/v1/health/
```

Required environment variables:

```env
ALLOWED_ORIGINS=https://smartcupleague-lotbq3zmk-smart-cup-league-s-projects.vercel.app
SUPABASE_URL=https://REPLACE_WITH_SUPABASE_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=REPLACE_WITH_SUPABASE_SERVICE_ROLE_KEY
```

Optional environment variables:

```env
COINGECKO_API_KEY=
COINGECKO_BASE_URL=https://api.coingecko.com/api/v3
VARA_TOKEN_ID=vara-network
PRICE_CACHE_TTL_SECONDS=300
```

CoinMarketCap migration is intentionally skipped for now. CoinGecko API access is not set up yet either: keep `COINGECKO_API_KEY` empty and use the existing unauthenticated/public CoinGecko path until a price-provider decision is made.

Smoke test:

```text
https://smartcupleague-api.onrender.com/api/v1/health/
```

## Oracle Server: Render

Create a Render Web Service from the repo, or use the root `render.yaml` blueprint.

Manual settings:

```text
Root Directory: oracle-server
Runtime: Node
Build Command: yarn install && yarn build
Start Command: yarn start
Health Check Path: /health
```

Before contracts are deployed, keep the feeder disabled and use staging placeholders only:

```env
ORACLE_PROGRAM_ID=0x0000000000000000000000000000000000000000000000000000000000000000
BOLAO_PROGRAM_ID=
GATEWAY_SEED=//Alice
OPERATOR_SEED=
AUTO_FEED_INTERVAL_MS=0
```

These placeholders are only for bootstrapping the Render service. Replace them before any real oracle/admin operation.

Required environment variables after contract deployment:

```env
VARA_WS=wss://testnet.vara.network
ORACLE_PROGRAM_ID=0xREPLACE_AFTER_ORACLE_DEPLOY
BOLAO_PROGRAM_ID=0xREPLACE_AFTER_BOLAOCORE_DEPLOY
GATEWAY_SEED=REPLACE_WITH_GATEWAY_HEX_SEED
OPERATOR_SEED=REPLACE_WITH_OPERATOR_HEX_SEED
SPORTS_API_KEY=REPLACE_WITH_FOOTBALL_DATA_KEY
SPORTS_COMPETITION_CODE=WC
FRIENDLIES_COMPETITION_CODES=PL,CL
CHALLENGE_WINDOW_MS=120000
FINALIZE_BUFFER_MS=15000
ALLOWED_ORIGINS=https://smartcupleague-lotbq3zmk-smart-cup-league-s-projects.vercel.app
```

Smoke test after real program IDs and signer seeds are set:

```text
https://smartcupleague-oracle.onrender.com/health
```

## Final Launch Order

1. Deploy `Oracle-Program`.
2. Deploy `BolaoCore-Program` initialized with the Oracle program address.
3. Deploy `DAO-SmartCupLeague-Program`, if the production frontend should expose DAO features.
4. Update Render oracle env vars: `ORACLE_PROGRAM_ID`, `BOLAO_PROGRAM_ID`, `GATEWAY_SEED`, `OPERATOR_SEED`.
5. Update Vercel frontend env vars: `VITE_BOLAOCOREPROGRAM`, `VITE_DAOPROGRAM`.
6. Redeploy oracle and frontend.
7. Register or sync tournament fixtures in the oracle server so `data/match-mapping.json` is populated.
8. Set `AUTO_FEED_INTERVAL_MS=120000` on the oracle server and redeploy.
