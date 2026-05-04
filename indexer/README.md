# Bolao Indexer

Off-chain indexer for the **BolaoCore** Sails program on Vara Network. Subscribes to on-chain events, projects them into a PostgreSQL read model, and exposes the data through an auto-generated GraphQL API.

The indexer is read-only: it never sends transactions, never writes to chain. It is the read-side of the protocol — leaderboards, activity feeds, user history, and any aggregate views the dApp needs without paying for an on-chain `queryState` call.

---

## Architecture

```
                       Vara Network
                            │
                            │ GearUserMessageSent events
                            ▼
   ┌────────────────────────────────────────────┐
   │  src/processor.ts  (SubstrateBatchProcessor)│  ← block ingestion
   └────────────────────────────────────────────┘
                            │
                            ▼
   ┌────────────────────────────────────────────┐
   │  src/sails-decoder.ts                      │  ← IDL-driven SCALE decoding
   └────────────────────────────────────────────┘
                            │
                            ▼
   ┌────────────────────────────────────────────┐
   │  src/handlers/bolao.ts (BolaoHandler)      │  ← event projection logic
   │   - per-batch state + bulk preload         │
   │   - touchUser / touchMatch deltas          │
   └────────────────────────────────────────────┘
                            │
                            ▼
   ┌────────────────────────────────────────────┐
   │  PostgreSQL (TypeORM entities)             │
   │   - bolao_match, bet, user_stat,           │
   │     match_reward, final_prize_claim,       │
   │     refund_claim, activity_record          │
   └────────────────────────────────────────────┘
                            │
                            ▼
   ┌────────────────────────────────────────────┐
   │  src/api.ts  (PostGraphile)                │  ← GraphQL on :4350
   └────────────────────────────────────────────┘
                            │
                            ▼
                   frontend, dashboards
```

Two long-running processes, one DB:

| Process | Entrypoint | Purpose |
|---|---|---|
| **Processor** | `src/main.ts` | Chain ingestion + projection. Writes to Postgres. |
| **API** | `src/api.ts` | PostGraphile server. Reads from Postgres, exposes GraphQL. |

They run independently. You can stop the API while the processor keeps catching up, and vice versa.

---

## Prerequisites

- **Node.js** ≥ 20.0.0 (see `engines` in `package.json`)
- **Yarn** 1.22.x (the repo pins `yarn@1.22.22`)
- **Docker** + Docker Compose (for the local Postgres)
- A Vara archive endpoint (defaults to public testnet — see [Configuration](#configuration))

---

## Quick start (development)

```bash
# 1. Install dependencies
yarn install

# 2. Start Postgres (docker-compose, foreground)
yarn db:up

# 3. Apply migrations against the DB
yarn db:apply

# 4. In one terminal — run the chain processor
yarn dev:processor

# 5. In another terminal — run the GraphQL API
yarn dev:api
```

Once both are running:

- **Processor** logs progress per batch (block height, events processed). Initial sync may take several minutes depending on `VARA_FROM_BLOCK`.
- **GraphQL endpoint** → `http://localhost:4350/graphql`
- **GraphiQL playground** → `http://localhost:4350/graphiql`

To stop:

```bash
# Ctrl-C in each terminal, then:
yarn db:down            # stops Postgres (volume persists)
```

To wipe data (e.g. after redeploying the contract):

```bash
yarn db:down
docker volume rm indexer_postgres-data
yarn db:up && yarn db:apply
```

---

## Configuration

All configuration is via environment variables. Defaults live in `src/config.ts`. Create an `.env` at the indexer root to override:

| Variable | Default | Purpose |
|---|---|---|
| `VARA_ARCHIVE_URL` | `https://v2.archive.subsquid.io/network/vara-testnet` | Subsquid archive — fast historical sync |
| `VARA_RPC_URL` | `wss://archive-rpc.vara.network` | Vara RPC — recent / hot blocks |
| `VARA_RPC_RATE_LIMIT` | `20` | Max RPC requests per second |
| `VARA_FROM_BLOCK` | `26000000` | First block to index. Set to the deploy block of `programId` to skip wasted work |
| `VARA_PROGRAM_ID` | (testnet default in `config.ts`) | The BolaoCore program address (`0x…`) |
| `DATABASE_URL` | `postgres://postgres:postgres@localhost:5432/bolao_indexer` | Postgres connection string |
| `GQL_PORT` | `4350` | Port for the PostGraphile API |
| `FRONTEND_URL` | `http://localhost:5173` | Allowed CORS origin for the API |

The IDL path is hard-coded at `assets/bolao_program.idl` (relative to compiled output) — see [Updating the IDL](#updating-the-idl).

---

## Data model

Defined in `src/model/entities.ts`. Each entity becomes a Postgres table and a GraphQL type.

### `bolao_match`
Per-match state. One row per registered match.

| Column | Type | Notes |
|---|---|---|
| `id`, `matchId` | varchar / bigint | Mirror of on-chain `match_id` |
| `phase`, `home`, `away` | varchar | Static metadata |
| `kickOff` | bigint | Unix milliseconds |
| `status` | varchar | `UNRESOLVED` → `PROPOSED` → `FINALIZED` → `SETTLED`, or `CANCELLED` |
| `scoreHome`, `scoreAway`, `penaltyWinner` | int / varchar | Set when `ResultProposed` / `ResultFinalized` arrives |
| `prizePoolRaw` | numeric | u128 in planck — zeroed on cancellation |
| `betsCount` | int | Increment per `BetAccepted` |

### `bet`
One row per `BetAccepted` event (idempotent on chain message id).

### `user_stat`
Per-wallet aggregates. Maintained incrementally via `touchUser` deltas.

| Column | Source |
|---|---|
| `totalBets` | `BetAccepted` |
| `totalStakedRaw` | `BetAccepted` |
| `totalPoints` | `PointsAwarded` + `PodiumBonusAwarded` |
| `totalClaimedRaw` | `MatchRewardClaimed` |
| `finalPrizeClaimedRaw` | `FinalPrizeClaimed` |
| `totalRefundClaimedRaw` | `RefundClaimed` |

### `match_reward`, `final_prize_claim`, `refund_claim`
Append-only ledgers — one row per claim event. Useful for auditing and per-wallet activity timelines.

### `activity_record`
Generic event log (type, user, matchId, amount, points, JSON meta). Powers activity feeds without joining ledgers.

---

## Querying via GraphQL

PostGraphile auto-generates camelCase queries from the snake_case tables. A few useful examples:

### Top 50 leaderboard
```graphql
query Leaderboard {
  userStats(orderBy: TOTAL_POINTS_DESC, first: 50) {
    nodes {
      id
      totalPoints
      totalBets
      totalClaimedRaw
    }
  }
}
```

### Upcoming matches (not yet finalized)
```graphql
query UpcomingMatches {
  bolaoMatches(
    filter: { status: { in: ["UNRESOLVED", "PROPOSED"] } }
    orderBy: KICK_OFF_ASC
    first: 10
  ) {
    nodes { matchId phase home away kickOff }
  }
}
```

### One wallet's history
```graphql
query WalletProfile($wallet: String!) {
  userStat(id: $wallet) {
    totalPoints totalBets totalClaimedRaw totalRefundClaimedRaw
  }
  bets(filter: { user: { equalTo: $wallet } }, orderBy: TIMESTAMP_DESC, first: 100) {
    nodes {
      id matchId scoreHome scoreAway stakeRaw timestamp
      matchRef { status home away phase scoreHome scoreAway }
    }
  }
  matchRewards(filter: { user: { equalTo: $wallet } }, orderBy: TIMESTAMP_DESC) {
    nodes { id matchId amountRaw timestamp }
  }
  refundClaims(filter: { user: { equalTo: $wallet } }, orderBy: TIMESTAMP_DESC) {
    nodes { id amountRaw timestamp }
  }
}
```

### Recent protocol activity
```graphql
query Activity {
  activityRecords(orderBy: TIMESTAMP_DESC, first: 100) {
    nodes { type user matchId amountRaw points timestamp }
  }
}
```

`postgraphile-plugin-connection-filter` is enabled, so you can filter on most fields with `equalTo`, `in`, `greaterThan`, etc.

### What the indexer cannot answer

Some data lives only in the contract's storage and is not in any event. Read those directly from chain:

- `pending_refunds[wallet]` — current pull balance
- `bet.claimed` flag — derive from presence of `match_reward` / `refund_claim` rows, accepting indexer lag
- Live `match_prize_pool` mid-block before settlement

---

## Updating the IDL

The Sails decoder uses `assets/bolao_program.idl` to interpret raw event payloads. Whenever the BolaoCore contract changes its surface (events added/renamed, types changed), the IDL must be refreshed:

```bash
# 1. Rebuild the contract (regenerates the IDL)
cd ../smart-programs/BolaoCore-Program
cargo build

# 2. Copy the regenerated IDL into the indexer
cp wasm/bolao_program.idl ../../indexer/assets/bolao_program.idl
```

If the new IDL adds events, you also need to extend `src/handlers/bolao.ts` (payload type + case in `handleEvent` + projection method). If it adds entities/columns, update `src/model/entities.ts` and run `yarn db:generate` to produce a new migration.

---

## Schema migrations

Schema changes are versioned in `db/migrations/*.js`.

### Generate a migration after entity changes
```bash
yarn db:generate
```
This diffs the entities in `src/model/entities.ts` against the live schema and writes a new timestamped migration. **Review the generated SQL before applying** — auto-generated migrations can be lossy (e.g., column rename appears as drop + add).

### Apply pending migrations
```bash
yarn db:apply
```

### Reset (development only)
```bash
yarn db:down && docker volume rm indexer_postgres-data && yarn db:up && yarn db:apply
```

---

## Production notes

### Hot blocks and reorgs
The processor uses `supportHotBlocks: true` in `src/main.ts`, so it tracks unfinalized blocks and rolls back on reorgs. The state schema `gear_processor` keeps its own metadata.

### Redeploying the contract
A new contract deployment means a new `programId` and (usually) a new starting block.

1. Stop the processor.
2. Update `.env`:
   ```
   VARA_PROGRAM_ID=0x<new-program-id>
   VARA_FROM_BLOCK=<deploy-block>
   ```
3. Wipe the database (data from the old contract is no longer relevant).
4. Refresh the IDL (see above).
5. Apply migrations and start fresh:
   ```bash
   yarn db:apply
   yarn dev:processor
   ```

### Scaling the API
PostGraphile is stateless — run multiple instances behind a load balancer and point them all at the same Postgres. The processor must remain a singleton (only one writer per database).

### Observability
Both processes log to stdout. The processor logs per-batch progress; the API logs requests in dev mode (`enhanceGraphiql: true`). Pipe to your log shipper of choice.

### Backfills and resyncs
To resync from a different block without losing schema:

```bash
# Stop the processor, then wipe just the indexer state and entity tables:
psql $DATABASE_URL -c "DROP SCHEMA gear_processor CASCADE;"
psql $DATABASE_URL -c "TRUNCATE bolao_match, bet, user_stat, match_reward, final_prize_claim, refund_claim, activity_record CASCADE;"
yarn dev:processor
```

The processor will recreate its state schema and replay events from `VARA_FROM_BLOCK`.

---

## Repository layout

```
indexer/
├── assets/
│   └── bolao_program.idl       # IDL — copy from contract build output
├── db/
│   └── migrations/             # Squid TypeORM migrations
├── src/
│   ├── api.ts                  # PostGraphile server entrypoint
│   ├── main.ts                 # Processor entrypoint
│   ├── config.ts               # Environment configuration
│   ├── processor.ts            # SubstrateBatchProcessor wiring
│   ├── sails-decoder.ts        # IDL-driven SCALE decoder
│   ├── handlers/
│   │   ├── base.ts             # Abstract handler with batch lifecycle
│   │   ├── bolao.ts            # BolaoCore event projection
│   │   └── index.ts
│   ├── helpers/
│   │   └── is.ts               # Event type guards
│   ├── model/
│   │   ├── entities.ts         # TypeORM entities (the read model)
│   │   └── index.ts
│   └── types/
│       ├── gear-events.ts
│       └── index.ts
├── docker-compose.yml          # Local Postgres
├── package.json
├── tsconfig.json
└── README.md
```

---

## Available scripts

| Script | What it does |
|---|---|
| `yarn build` | Compile TypeScript → `lib/` |
| `yarn clean` | Remove `lib/` |
| `yarn codegen` | Regenerate entities from `schema.graphql` (Squid TypeORM codegen) |
| `yarn db:up` | Start the local Postgres container |
| `yarn db:down` | Stop the local Postgres container |
| `yarn db:generate` | Generate a migration from entity diffs |
| `yarn db:apply` | Apply pending migrations |
| `yarn dev:processor` | Run the chain processor (tsx, hot-reload-friendly) |
| `yarn dev:api` | Run the GraphQL API (tsx) |
| `yarn start:processor` | Run the compiled processor (production) |
| `yarn start:api` | Run the compiled API (production) |

---

## Troubleshooting

**`Failed to handle event` warnings in processor logs.**
Usually caused by an outdated IDL — the decoder cannot match the SCALE-encoded payload to a known event shape. Refresh `assets/bolao_program.idl` from the contract build.

**Empty leaderboard / no matches in DB.**
Either the processor has not caught up yet (check its logs for current block vs. tip), or `VARA_PROGRAM_ID` / `VARA_FROM_BLOCK` are stale. Verify that the configured program emitted events between `fromBlock` and chain tip.

**`relation "user_stat" does not exist`.**
Migrations have not been applied — run `yarn db:apply`. If the entities have changed since the last applied migration, run `yarn db:generate` first.

**Frontend shows on-chain data instead of indexer data.**
The frontend falls back to on-chain queries if the indexer is unreachable. Confirm `VITE_INDEXER_GRAPHQL_URL` is set in the frontend `.env`, the GraphQL server is running, and CORS allows the frontend origin (`FRONTEND_URL` env var).

**CORS rejected requests.**
PostGraphile is configured to allow `FRONTEND_URL`, `http://localhost:3000`, and `http://127.0.0.1:5173` by default (see `src/api.ts`). Adjust `FRONTEND_URL` or extend the list for additional origins.

---

## License

Licensed under the [MIT License](../LICENSE). Copyright © 2026 Rafael Machtura.
