# SmartCup League Rewards Backend

Verifies SmartCup campaign tasks and grants non-withdrawable native VARA
freebet credit through the SmartCup freebet-ledger contract.

On startup, the service runs an idempotent Postgres schema migration before
starting Nest. Keep `DB_SYNCHRONIZE=false` in production unless you are doing a
temporary manual bootstrap.

## Campaign Tasks

The SmartCup campaign narrows the public task surface to weekly X actions:

- `repost`: 100 VARA freebet once per wallet/week. The user can submit either a
  direct repost of an official `@SmartCupLeague` post, or the original
  SmartCup post URL plus their X username. The backend verifies the repost via
  X API.
- `post`: 300 VARA freebet once per wallet/week. The user submits a quote of
  an official SmartCup post, or a standalone campaign post that mentions
  SmartCup/freebet/predictions/World Cup/agent context and includes the
  SmartCup app URL.
Task amounts live in `src/rewards/reward-utils.ts` and can be adjusted before
campaign launch.

## Referral Program

Users can share a referral link with `?ref=<wallet-or-actor-id>`. A friend can
accept only one referrer and self-referrals are rejected. The referrer receives
one freebet grant after the friend places at least 5 SmartCup bets.

Progress is synced through the admin-only referral activity endpoint, usually
from an indexer, cron job, or ops script that counts accepted `BetAccepted`
events.

## API

### `GET /rewards/tasks`

Returns the active task catalog and configured freebet amounts for frontend
rendering.

### `POST /rewards/x/submit`

```json
{
  "wallet": "5...",
  "taskType": "repost",
  "tweetUrl": "https://x.com/SmartCupLeague/status/123",
  "xUsername": "user"
}
```

The service verifies the submitted X link, stores the submission, and calls
Ledger `Grant` with the reward amount attached as native VARA and an
idempotent grant id.

Each X task is limited to once per wallet/week and once per X username/week.
A username can claim a specific task post only once ever.

### `POST /rewards/grants/manual`

Admin-only escape hatch for ops and backfills.

### `POST /rewards/referrals/register`

Public endpoint used after a friend opens a referral link and connects wallet.

```json
{
  "referrer": "5...",
  "friend": "5..."
}
```

### `GET /rewards/referrals/:wallet`

Returns invited friends, accepted referral status, 5-bet progress, and paid
freebet rewards.

### `POST /rewards/referrals/activity`

Admin-only endpoint for syncing verified betting progress.

```json
{
  "friend": "5...",
  "betCount": 5,
  "activeDays": 1,
  "qualifyingActiveDays": 1
}
```

## Environment

```env
PORT=3002
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=smartcup_rewards
DB_SYNCHRONIZE=false

NODE_URL=wss://archive-rpc.vara.network
FREEBET_LEDGER_ID=0x...
REWARDS_ACCOUNT="seed phrase or //Alice or 0x..."

X_BEARER_TOKEN=...
SMARTCUP_X_USERNAME=SmartCupLeague
SMARTCUP_APP_URL=https://app.smartcupleague.com/
ADMIN_API_KEY=
```

## Notes

The Ledger contract holds the native VARA backing each user's freebet balance.
Users cannot withdraw that balance directly. When they spend it on a SmartCup
prediction, Ledger moves the backing VARA into the match pool. After a match is
finalized, winner payouts from that pool are withdrawable VARA. This service
only verifies off-chain facts and triggers idempotent Ledger grants.
