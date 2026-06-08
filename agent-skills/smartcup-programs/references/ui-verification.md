# UI Verification

Use this reference after a SmartCup read/write action or when a user reports that a frontend screen does not match expected state.

## Principle

Frontend screens are workflow context, not the source of truth. Verify contract/backend state first, then explain what the matching screen should display.

If frontend state disagrees with program state:

- trust `BolaoCore` or `FreebetLedger` for on-chain betting facts
- check wallet normalization and selected network
- check program IDs against `references/deployment.md`
- check `match_id`, score, `penalty_winner`, and funding source
- allow for frontend cache/indexer/API delay before calling it a bug

## Screen Map

| Screen | Verify with |
| --- | --- |
| All Matches | `BolaoCore.Service.QueryState`, `QueryMatch`, or `QueryMatchesByPhase` |
| My Predictions | `BolaoCore.Service.QueryBetsByUser(wallet)` |
| Rewards | `FreebetLedger.BalanceOf(wallet)`, rewards-backend state if available |
| Claim UI | `QueryWalletClaimStatus(wallet)`, `QueryPendingRefund(wallet)`, bet-level `claimed` |
| Leaderboard | `QueryUserPoints(wallet)` and the app projection/indexer, if available |

## After Prediction

After a successful wallet or freebet prediction, query:

```bash
vara-wallet --network "$SMARTCUP_NETWORK" --json call "$BOLAO_PROGRAM_ID" Service/QueryBetsByUser --args '["<wallet>"]' --idl "$BOLAO_IDL"
```

The frontend `My Predictions` screen should show the same `match_id`, score, `penalty_winner`, stake, and `claimed=false`.

For freebet predictions, `freebet_principal > 0` should be visible in program state and may appear in the app as a freebet-funded bet.

## After Claim Or Refund

After a match reward claim, verify `QueryWalletClaimStatus(wallet)` and the bet-level `claimed` field. The claim UI should no longer show the same amount as claimable.

After a refund claim, verify `QueryPendingRefund(wallet)`. The claim/refund UI should no longer show the same pending refund amount.

For freebet bets, remember that principal returns to `FreebetLedger`; only net winnings are wallet-claimable.

## Response Shape

When reporting a UI verification, include:

```text
Contract state: <canonical result>
Expected screen: <All Matches/My Predictions/Rewards/Claim UI/Leaderboard>
Expected UI change: <short statement>
If UI differs: <most likely checks>
```
