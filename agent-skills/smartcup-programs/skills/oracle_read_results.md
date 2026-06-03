# Oracle Read Results

Use for read-only Oracle inspection, result debugging, and frontend/admin verification.

## Oracle State

```bash
vara-wallet --network "$SMARTCUP_NETWORK" --json call "$ORACLE_PROGRAM_ID" Service/QueryState --idl "$ORACLE_IDL"
```

Inspect `bolao_program_id`, `authorized_feeders`, `consensus_threshold`, `match_results`, `vara_price_usd_micro`, and `price_updated_at`.

## All Results

```bash
vara-wallet --network "$SMARTCUP_NETWORK" --json call "$ORACLE_PROGRAM_ID" Service/QueryAllResults --idl "$ORACLE_IDL"
```

## One Result

```bash
vara-wallet --network "$SMARTCUP_NETWORK" --json call "$ORACLE_PROGRAM_ID" Service/QueryMatchResult --args '[<match_id>]' --idl "$ORACLE_IDL"
```

## Pending Matches

```bash
vara-wallet --network "$SMARTCUP_NETWORK" --json call "$ORACLE_PROGRAM_ID" Service/QueryPendingMatches --idl "$ORACLE_IDL"
```

Do not submit, force-finalize, or cancel Oracle results unless the user explicitly requests that admin/operator action.
