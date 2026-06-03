# Place Freebet Bet

Use only when the user explicitly asks to place a real freebet-funded prediction.

Do not call `BolaoCore.Service.PlaceBet` directly for freebet predictions. Call `FreebetLedger.FreebetLedger.SpendFreebet`; the ledger forwards to BolaoCore.

## Required Inputs

- wallet/account to sign with
- `match_id`
- freebet amount
- predicted score using `{"home":<u8>,"away":<u8>}`
- `penalty_winner`: `null`, `"Home"`, or `"Away"`

## Prechecks

1. Run `skills/preflight.md`.
2. Read `references/safety-matrix.md` and apply the `SpendFreebet` confirmation rules.
3. Run `skills/read_matches.md` and inspect the target match.
4. Run `skills/check_user_bets.md` for the wallet.
5. Run `skills/check_freebet_balance.md` for the wallet.
6. Confirm:
   - no existing bet for `match_id`
   - freebet balance covers `amount`
   - current BolaoCore is authorized in FreebetLedger
   - `result` is `Unresolved`
   - current time is more than 10 minutes before `kick_off`
   - user explicitly confirmed amount, score, match, wallet/account, and network

## Dry Run

```bash
vara-wallet --network "$SMARTCUP_NETWORK" --json call "$FREEBET_LEDGER_ID" FreebetLedger/SpendFreebet --args "[\"$BOLAO_PROGRAM_ID\",<match_id>,\"<amount>\",{\"home\":<home_score>,\"away\":<away_score>},null]" --dry-run --idl "$FREEBET_LEDGER_IDL"
```

Represent `u128` amounts as strings unless the local client proves numeric encoding is safe.

Use `references/vara-wallet-encoding.md` for `Score`, `PenaltyWinner`, `u128`, and `actor_id` CLI JSON forms. Replace the final `null` with `"Home"` or `"Away"` when the prediction includes penalties.

## Live Call

Only after explicit user confirmation, remove `--dry-run`:

```bash
vara-wallet --network "$SMARTCUP_NETWORK" --json call "$FREEBET_LEDGER_ID" FreebetLedger/SpendFreebet --args "[\"$BOLAO_PROGRAM_ID\",<match_id>,\"<amount>\",{\"home\":<home_score>,\"away\":<away_score>},null]" --idl "$FREEBET_LEDGER_IDL"
```

## UI Verification

After a successful live call, query `Service/QueryBetsByUser(wallet)` and verify the new `match_id`, score, `freebet_principal > 0`, and `claimed=false`. The frontend `My Predictions` and Rewards views should reflect that the bet used freebet credit; if they disagree, use `references/ui-verification.md`.
