# SmartCup Program Reference

## Architecture

- `BolaoCore` is the canonical tournament contract. It stores matches, predictions, results, prize pools, accruals, and claim/refund status.
- `Oracle` is the result-fixation contract or layer. Use it for result proposal/finalization work, then verify through `BolaoCore`.
- `FreebetLedger` stores non-withdrawable VARA credit that can be spent on predictions.
- `DAO` handles governance proposals, voting, default BolaoCore selection, and BolaoCore factory deployment.
- `rewards-backend` issues freebet credit for campaigns and referrals.
- `voucher-backend` issues gas vouchers for gasless user flows.
- `frontend` reads these surfaces for All Matches, My Predictions, Rewards, and Leaderboard.

## IDL Files

The installable skill bundles exact IDL under `references/idl/`:

- `bolao_program.idl`: `service Service` for `BolaoCore`.
- `freebet-ledger.idl`: `service FreebetLedger`.
- `oracle_program.idl`: `service Service` for `Oracle`.
- `dao_program.idl`: `service Service` for DAO governance.

Read these files before generating client calls, CLI invocations, typed payloads, or docs.

For current program IDs, BolaoCore code ID, and concrete IDL path examples, read `deployment.md`.

## Canonical Reads

Use `BolaoCore.Service.QueryState` for tournament and match truth.

For each match, inspect:

- `match_id`
- `home`
- `away`
- `kick_off`
- `phase`
- `result`
- `has_bets`
- `match_prize_pool`
- `settlement_prepared`
- `participants`
- `total_winner_stake` after settlement

Use `BolaoCore.Service.QueryBetsByUser(wallet)` for user predictions.

For each user bet, inspect:

- `match_id`
- `score`
- `stake_in_match_pool`
- `freebet_principal`
- `claimed`

Use `BolaoCore.Service.QueryWalletClaimStatus(wallet)` for payout readiness.

Inspect:

- `amount_claimable`
- `already_claimed`

Use `FreebetLedger.BalanceOf(wallet)` before freebet spending.

## Match Result States

- `Unresolved`: match is not completed/finalized. It can be eligible for prediction if phase and cutoff also allow it.
- `Proposed`: Oracle has proposed a result, but the challenge window has not passed.
- `Finalized`: result is final.
- `Cancelled`: match is cancelled.

## Prediction Eligibility

Treat a prediction as eligible only when all checks pass:

```text
wallet = normalize_hex(wallet)
state = BolaoCore.Service.QueryState()
bets = BolaoCore.Service.QueryBetsByUser(wallet)
match = state.matches[match_id]

no_existing_bet = match_id not in [bet.match_id for bet in bets]
time_open = now < match.kick_off - 10 minutes
result_open = match.result == Unresolved
phase_open = phase allows predictions

eligible = no_existing_bet && time_open && result_open && phase_open
```

If any field name or enum representation differs in generated clients, adapt the check to the local type definitions but preserve the same invariants.

## Funding Semantics

- Wallet-funded predictions attach VARA value to `BolaoCore.Service.PlaceBet`.
- Freebet-funded predictions go through `FreebetLedger.FreebetLedger.SpendFreebet`; do not bypass the ledger.
- `freebet_principal > 0` on a bet means the prediction used freebet credit.

## Claim And Refund Semantics

After result finalization, verify `settlement_prepared=true` before presenting claim actions.

If `amount_claimable > 0`, a claim can be prepared. If the bet used freebet principal, principal returns to `FreebetLedger`; only net winnings are payable to the wallet.

`claimed=true` means the reward was already claimed or the bet was closed through refund/cancellation handling. Do not retry blindly.

`WalletClaimStatus` has `wallet`, `amount_claimable`, and `already_claimed`. `FinalPrizeClaimStatus` additionally includes `final_prize_finalized`, `eligible`, and `points`.

## Frontend Trace Map

- All Matches: `BolaoCore.Service.QueryState`
- My Predictions: `BolaoCore.Service.QueryBetsByUser(wallet)`
- Rewards: `rewards-backend`, `voucher-backend`, and `FreebetLedger.BalanceOf(wallet)`
- Leaderboard: derived from `BolaoCore` state/projections
- Claim UI: `BolaoCore.Service.QueryWalletClaimStatus(wallet)` plus bet-level `claimed`

For after-action screen checks and frontend discrepancy triage, read `ui-verification.md`.
