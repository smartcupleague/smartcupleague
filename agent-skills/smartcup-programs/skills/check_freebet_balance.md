# Check Freebet Balance

Use before a freebet-funded prediction or Rewards screen debugging.

Normalize wallet to full `0x...` hex before querying.

## Balance

```bash
vara-wallet --network "$SMARTCUP_NETWORK" --json call "$FREEBET_LEDGER_ID" FreebetLedger/BalanceOf --args '["<wallet>"]' --idl "$FREEBET_LEDGER_IDL"
```

The returned `u128` is the user's non-withdrawable freebet credit.

## Authorized BolaoCore

```bash
vara-wallet --network "$SMARTCUP_NETWORK" --json call "$FREEBET_LEDGER_ID" FreebetLedger/IsBetProgramAuthorized --args "[\"$BOLAO_PROGRAM_ID\"]" --idl "$FREEBET_LEDGER_IDL"
```

If false, do not attempt `SpendFreebet` for the current BolaoCore.

## Ledger Totals

```bash
vara-wallet --network "$SMARTCUP_NETWORK" --json call "$FREEBET_LEDGER_ID" FreebetLedger/TotalLiability --idl "$FREEBET_LEDGER_IDL"
vara-wallet --network "$SMARTCUP_NETWORK" --json call "$FREEBET_LEDGER_ID" FreebetLedger/SurplusVara --idl "$FREEBET_LEDGER_IDL"
```
