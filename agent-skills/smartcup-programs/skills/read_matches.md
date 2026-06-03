# Read Matches

Use to inspect all matches, a single match, or a phase.

## All Matches

```bash
vara-wallet --network "$SMARTCUP_NETWORK" --json call "$BOLAO_PROGRAM_ID" Service/QueryState --idl "$BOLAO_IDL"
```

Read `matches`, `phases`, `r32_lock_time`, `final_prize_finalized`, and `freebet_ledger_program_id`.

For each match inspect:

- `match_id`
- `phase`
- `home`
- `away`
- `kick_off`
- `result`
- `has_bets`
- `match_prize_pool`
- `settlement_prepared`
- `participants`

## One Match

```bash
vara-wallet --network "$SMARTCUP_NETWORK" --json call "$BOLAO_PROGRAM_ID" Service/QueryMatch --args '[<match_id>]' --idl "$BOLAO_IDL"
```

## Matches By Phase

```bash
vara-wallet --network "$SMARTCUP_NETWORK" --json call "$BOLAO_PROGRAM_ID" Service/QueryMatchesByPhase --args '["<phase>"]' --idl "$BOLAO_IDL"
```

Treat frontend labels as presentation only. The match state from BolaoCore is canonical.
