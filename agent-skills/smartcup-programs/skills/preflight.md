# Preflight

Use before any SmartCup program interaction.

## Check `vara-wallet`

```bash
command -v vara-wallet
vara-wallet --version
```

If missing:

```bash
npm install -g vara-wallet
```

Stop and ask the user for permission before installing. Never ask the user to paste seed, mnemonic, or private keys into chat.

## Mainnet Program Access

Set the runtime constants from `references/deployment.md` before running these commands.

Run read-only calls:

```bash
vara-wallet --network "$SMARTCUP_NETWORK" --json call "$BOLAO_PROGRAM_ID" Service/QueryState --idl "$BOLAO_IDL"
vara-wallet --network "$SMARTCUP_NETWORK" --json call "$ORACLE_PROGRAM_ID" Service/QueryState --idl "$ORACLE_IDL"
vara-wallet --network "$SMARTCUP_NETWORK" --json call "$FREEBET_LEDGER_ID" FreebetLedger/TotalLiability --idl "$FREEBET_LEDGER_IDL"
vara-wallet --network "$SMARTCUP_NETWORK" --json call "$DAO_PROGRAM_ID" Service/QueryState --idl "$DAO_IDL"
```

Expected linkage:

- BolaoCore `freebet_ledger_program_id` equals the current FreebetLedger ID.
- Oracle `bolao_program_id` equals the current BolaoCore ID.
- DAO `bolao_program` equals the current BolaoCore ID.
- DAO `bolao_code_registered` is `true`.
