# Claim Match Reward

Use when the user asks to claim a finalized match reward.

## Prechecks

1. Run `skills/preflight.md`.
2. Read `references/safety-matrix.md` and apply the `ClaimMatchReward` confirmation rules.
3. Run `skills/read_matches.md` or `Service/QueryMatch` for the target `match_id`.
4. Run `skills/check_user_bets.md` for the wallet.
5. Confirm:
   - match `result` is `Finalized`
   - `settlement_prepared=true`
   - user has a bet for `match_id`
   - bet `claimed=false`
   - user explicitly asks to claim

For a freebet bet, principal returns to FreebetLedger; only net winnings go to the wallet.

## Dry Run

```bash
vara-wallet --network "$SMARTCUP_NETWORK" --json call "$BOLAO_PROGRAM_ID" Service/ClaimMatchReward --args '[<match_id>]' --dry-run --idl "$BOLAO_IDL"
```

## Live Call

Only after explicit user confirmation, remove `--dry-run`:

```bash
vara-wallet --network "$SMARTCUP_NETWORK" --json call "$BOLAO_PROGRAM_ID" Service/ClaimMatchReward --args '[<match_id>]' --idl "$BOLAO_IDL"
```

## UI Verification

After a successful live call, query `Service/QueryWalletClaimStatus(wallet)` and `Service/QueryBetsByUser(wallet)`. The claim UI should no longer show the same reward as claimable, and the matching bet should be `claimed=true`; if the app disagrees, use `references/ui-verification.md`.
