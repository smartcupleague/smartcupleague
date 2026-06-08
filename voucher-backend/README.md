# SmartCup League Voucher Backend

Gas voucher distribution service for SmartCup League campaigns.

The service issues Vara Network gas vouchers so selected SmartCup accounts can
send whitelisted program calls without holding their own VARA for gas. It is
intended for capped campaign flows: mini-tournament predictions, agent-operated
transactions, freebet ledger calls, and future tournament-specific contracts.

## Behavior

One voucher is tracked per account. A single batched `POST /voucher` registers
all requested whitelisted programs and funds the voucher with
`HOURLY_TRANCHE_VARA`. Every `TRANCHE_INTERVAL_SEC`, the same account may POST
again for another tranche. Each funded top-up also extends `validUpTo` by
`TRANCHE_DURATION_SEC`.

Rate limits:

- Per wallet: one funded POST per `TRANCHE_INTERVAL_SEC`.
- Per IP: `PER_IP_TRANCHES_PER_DAY` funded tranches per UTC day.
- `GET /voucher/:account` is read-only and should be called before POST.

If a wallet POSTs inside the cooldown window, the service returns `429` with
`retryAfterSec`. Clients should reuse the voucher id from the prior GET.

## Quick Start

```bash
cd voucher-backend
cp .env.example .env
npm install
npm run seed
npm run start:dev
```

## Program Whitelist

`npm run seed` populates the `gasless_program` table.

Preferred multi-program format:

```env
SMARTCUP_GASLESS_PROGRAMS=BolaoCoreMini:0x...,BolaoCoreWorldCup:0x...,FreebetLedger:0x...
```

Fallback convenience envs:

```env
BOLAO_PROGRAM_ID=0x...
ORACLE_PROGRAM_ID=0x...
DAO_PROGRAM_ID=0x...
FREEBET_LEDGER_ID=0x...
```

Only whitelisted programs can be included in `POST /voucher`.

## API

### `POST /voucher`

```json
{
  "account": "0x...",
  "programs": ["0x<BolaoCore>", "0x<FreebetLedger>"]
}
```

Returns:

```json
{ "voucherId": "0x..." }
```

### `GET /voucher/:account`

```json
{
  "voucherId": "0x...",
  "programs": ["0x..."],
  "validUpTo": "2026-06-02T12:00:00.000Z",
  "varaBalance": "1757000000000000",
  "balanceKnown": true,
  "lastRenewedAt": "2026-06-01T11:00:00.000Z",
  "nextTopUpEligibleAt": "2026-06-01T12:00:00.000Z",
  "canTopUpNow": false
}
```

`balanceKnown=false` means the backend could not reach the Vara node. Do not
treat the returned balance as drained in that case.

### `GET /info`

Returns voucher issuer address and balance. Requires `x-api-key: <INFO_API_KEY>`.

### `GET /health`

Returns service health.

## Environment

| Var | Description |
| --- | --- |
| `NODE_URL` | Vara RPC endpoint |
| `VOUCHER_ACCOUNT` | Voucher issuer seed phrase, hex seed, or dev URI |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Postgres connection |
| `PORT` | HTTP port |
| `HOURLY_TRANCHE_VARA` | VARA added on each funded POST |
| `TRANCHE_INTERVAL_SEC` | Seconds between funded top-ups per wallet |
| `TRANCHE_DURATION_SEC` | Voucher validity extension per top-up |
| `PER_IP_TRANCHES_PER_DAY` | Max funded tranches per IP per UTC day; `0` disables |
| `INFO_API_KEY` | API key for `GET /info` |
| `SMARTCUP_GASLESS_PROGRAMS` | Comma-separated `Name:0xProgramId` whitelist |
| `BOLAO_PROGRAM_ID`, `ORACLE_PROGRAM_ID`, `DAO_PROGRAM_ID`, `FREEBET_LEDGER_ID` | Fallback whitelist envs |

## Operational Notes

- The per-IP counter is stored in Postgres and is safe across multiple pods.
- Per-wallet requests use Postgres advisory locks to avoid duplicate voucher
  updates for the same account.
- Voucher issuer transactions are serialized with an issuer-level advisory lock
  to avoid nonce races.
- The service keeps `gasless_program` and `voucher` schema names from the donor
  backend for compatibility with the existing code.
