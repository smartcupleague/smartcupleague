# Check User Bets

Use before placing any prediction or explaining a user's position.

Normalize wallet to full `0x...` hex before querying.

## User Bets

```bash
vara-wallet --network "$SMARTCUP_NETWORK" --json call "$BOLAO_PROGRAM_ID" Service/QueryBetsByUser --args '["<wallet>"]' --idl "$BOLAO_IDL"
```

For each bet inspect:

- `match_id`
- `score`
- `penalty_winner`
- `stake_in_match_pool`
- `freebet_principal`
- `claimed`

If any returned bet has the target `match_id`, do not place another prediction for that match.

## Claim Status

```bash
vara-wallet --network "$SMARTCUP_NETWORK" --json call "$BOLAO_PROGRAM_ID" Service/QueryWalletClaimStatus --args '["<wallet>"]' --idl "$BOLAO_IDL"
```

`WalletClaimStatus` has `wallet`, `amount_claimable`, and `already_claimed`.
