# Claim Refund

Use when the user asks to claim pending refunds from cancelled matches.

## Prechecks

1. Run `skills/preflight.md`.
2. Read `references/safety-matrix.md` and apply the `ClaimRefund` confirmation rules.
3. Normalize wallet to full `0x...`.
4. Query pending refund:

```bash
vara-wallet --network "$SMARTCUP_NETWORK" --json call "$BOLAO_PROGRAM_ID" Service/QueryPendingRefund --args '["<wallet>"]' --idl "$BOLAO_IDL"
```

5. Confirm returned amount is greater than `0`.
6. Confirm the user explicitly asks to claim the refund.

## Dry Run

```bash
vara-wallet --network "$SMARTCUP_NETWORK" --json call "$BOLAO_PROGRAM_ID" Service/ClaimRefund --dry-run --idl "$BOLAO_IDL"
```

## Live Call

Only after explicit user confirmation, remove `--dry-run`:

```bash
vara-wallet --network "$SMARTCUP_NETWORK" --json call "$BOLAO_PROGRAM_ID" Service/ClaimRefund --idl "$BOLAO_IDL"
```

## UI Verification

After a successful live call, query `Service/QueryPendingRefund(wallet)`. The claim/refund UI should no longer show the same pending refund amount; if it does, use `references/ui-verification.md`.
