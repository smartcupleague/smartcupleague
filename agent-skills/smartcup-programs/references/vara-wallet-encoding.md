# Vara Wallet Encoding

Use this reference when constructing `vara-wallet call` JSON args for SmartCup prediction methods.

Verified on 2026-06-03 with `vara-wallet 0.16.0`, `--network mainnet`, bundled IDLs, and `--dry-run`. The dry-run outputs had `willSubmit:false`; no transaction was signed or submitted.

## Canonical Forms

- `Score`: use object form `{"home":<u8>,"away":<u8>}`.
- `PenaltyWinner`: use `null`, `"Home"`, or `"Away"`.
- `u128` amounts: pass as JSON strings, for example `"1000000000000"`.
- `actor_id` values: pass full hex strings, for example `"0x2c80..."`.

`vara-wallet` also accepted `Score` tuple form `[1,0]` for `PlaceBet`, and accepted enum object form `{"Home":null}` for `PenaltyWinner`. Avoid those forms in SmartCup recipes unless a generated client specifically requires them; strings/objects above are the canonical CLI style.

## Verified Dry-Runs

Wallet-funded prediction without penalties:

```bash
vara-wallet --network mainnet --json call "$BOLAO_PROGRAM_ID" Service/PlaceBet --args '[0,{"home":1,"away":0},null]' --value 1 --units human --dry-run --idl "$BOLAO_IDL"
```

Wallet-funded prediction with penalties:

```bash
vara-wallet --network mainnet --json call "$BOLAO_PROGRAM_ID" Service/PlaceBet --args '[0,{"home":1,"away":0},"Home"]' --value 1 --units human --dry-run --idl "$BOLAO_IDL"
vara-wallet --network mainnet --json call "$BOLAO_PROGRAM_ID" Service/PlaceBet --args '[0,{"home":1,"away":0},"Away"]' --value 1 --units human --dry-run --idl "$BOLAO_IDL"
```

Freebet-funded prediction:

```bash
vara-wallet --network mainnet --json call "$FREEBET_LEDGER_ID" FreebetLedger/SpendFreebet --args "[\"$BOLAO_PROGRAM_ID\",0,\"1000000000000\",{\"home\":1,\"away\":0},null]" --dry-run --idl "$FREEBET_LEDGER_IDL"
vara-wallet --network mainnet --json call "$FREEBET_LEDGER_ID" FreebetLedger/SpendFreebet --args "[\"$BOLAO_PROGRAM_ID\",0,\"1000000000000\",{\"home\":1,\"away\":0},\"Home\"]" --dry-run --idl "$FREEBET_LEDGER_IDL"
vara-wallet --network mainnet --json call "$FREEBET_LEDGER_ID" FreebetLedger/SpendFreebet --args "[\"$BOLAO_PROGRAM_ID\",0,\"1000000000000\",{\"home\":1,\"away\":0},\"Away\"]" --dry-run --idl "$FREEBET_LEDGER_IDL"
```

For live calls, keep the same args and remove only `--dry-run` after the required explicit confirmation.
