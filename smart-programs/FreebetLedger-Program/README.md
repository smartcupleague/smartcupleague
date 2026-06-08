# SmartCup Freebet Ledger

Sails contract that holds native VARA backing for SmartCup campaign freebets.
The rewards backend grants non-withdrawable credit by calling `grant` with
attached VARA. Users spend that credit through `spend_freebet`; the ledger then
forwards the stake to an authorized SmartCup betting program.

## Flow

1. Admin deploys with `FreebetLedgerInit { admin }`.
2. Admin authorizes SmartCup tournament contracts with `authorize_bet_program`.
3. Rewards backend calls `grant(to, grant_id, reason)` with native VARA value.
4. User calls `spend_freebet(bet_program_id, match_id, amount, score, penalty)`.
5. Ledger calls the authorized program route:
   `Service.PlaceBetFromFreebetLedger(user, match_id, score, penalty)`.
6. If a match is cancelled before settlement, authorized betting programs can
   return the unused freebet principal with `return_freebet(user, match_id)` and
   attached VARA.
7. If a match is finalized, the freebet stake stays in the match pool and the
   winner payout is withdrawable VARA.

`grant_id` is idempotent. A failed downstream spend restores the user's ledger
balance and returns `0`, while keeping the SmartCup-specific prediction payload.
