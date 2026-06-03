# Place Wallet Bet

Use only when the user explicitly asks to place a real wallet-funded prediction.

## Required Inputs

- wallet/account to sign with
- `match_id`
- predicted score using `{"home":<u8>,"away":<u8>}`
- `penalty_winner`: `null`, `"Home"`, or `"Away"`
- VARA amount to attach

## Prechecks

1. Run `skills/preflight.md`.
2. Read `references/safety-matrix.md` and apply the `PlaceBet` confirmation rules.
3. Run `skills/read_matches.md` and inspect the target match.
4. Run `skills/check_user_bets.md` for the wallet.
5. Confirm:
   - no existing bet for `match_id`
   - `result` is `Unresolved`
   - current time is more than 10 minutes before `kick_off`
   - user explicitly confirmed amount, score, match, wallet/account, and network

## Dry Run

Use dry-run before any live submission:

```bash
vara-wallet --network "$SMARTCUP_NETWORK" --json call "$BOLAO_PROGRAM_ID" Service/PlaceBet --args '[<match_id>,{"home":<home_score>,"away":<away_score>},null]' --value <vara_amount> --units human --dry-run --idl "$BOLAO_IDL"
```

Use `references/vara-wallet-encoding.md` for `Score`, `PenaltyWinner`, and `u128` CLI JSON forms. Replace the final `null` with `"Home"` or `"Away"` when the prediction includes penalties.

## Live Call

Only after explicit user confirmation, remove `--dry-run`:

```bash
vara-wallet --network "$SMARTCUP_NETWORK" --json call "$BOLAO_PROGRAM_ID" Service/PlaceBet --args '[<match_id>,{"home":<home_score>,"away":<away_score>},null]' --value <vara_amount> --units human --idl "$BOLAO_IDL"
```

## UI Verification

After a successful live call, query `Service/QueryBetsByUser(wallet)` and verify the new `match_id`, score, stake, and `claimed=false`. The frontend `My Predictions` screen should show the same bet; if it does not, use `references/ui-verification.md`.
