# SmartCup Deployment

## Current Program IDs

These IDs were provided as the current SmartCup mainnet deployment. Use `--network mainnet` unless the user explicitly provides a different deployment.

| Component | ID |
| --- | --- |
| Oracle | `0xe2b3216f2d1115f74c58786d2e9a5068c36a18c2005d24b78a6543609305a00e` |
| BolaoCore | `0x2c80eb710d966c5a2ddc9273e4b5e249c4d22dabd8934c3031fdaeacda1e4a1b` |
| FreebetLedger | `0x16ddfe734e0861dc45de0f87ca68fbb0e5b0c649b4b381f9af4e1949222bd443` |
| DAO | `0x005b96df6e65675e81de9503294a1df5aedfd6c111968b7092836799e5008b99` |
| BolaoCore code ID | `0x169788a862973a8f7d4fb4a333a1d48dbe35dbad14c8d1461b7ebc72db76a8df` |

## IDL Paths

When working from the repository checkout:

```text
agent-skills/smartcup-programs/references/idl/bolao_program.idl
agent-skills/smartcup-programs/references/idl/freebet-ledger.idl
agent-skills/smartcup-programs/references/idl/oracle_program.idl
agent-skills/smartcup-programs/references/idl/dao_program.idl
```

After installing into Codex:

```text
~/.codex/skills/smartcup-programs/references/idl/bolao_program.idl
~/.codex/skills/smartcup-programs/references/idl/freebet-ledger.idl
~/.codex/skills/smartcup-programs/references/idl/oracle_program.idl
~/.codex/skills/smartcup-programs/references/idl/dao_program.idl
```

After installing into `.agents`:

```text
~/.agents/skills/smartcup-programs/references/idl/bolao_program.idl
~/.agents/skills/smartcup-programs/references/idl/freebet-ledger.idl
~/.agents/skills/smartcup-programs/references/idl/oracle_program.idl
~/.agents/skills/smartcup-programs/references/idl/dao_program.idl
```

## Component To IDL Map

- BolaoCore program ID uses `bolao_program.idl` and `service Service`.
- Oracle program ID uses `oracle_program.idl` and `service Service`.
- FreebetLedger program ID uses `freebet-ledger.idl` and `service FreebetLedger`.
- DAO program ID uses `dao_program.idl` and `service Service`.

## Runtime Constants

Use these constants in command examples. If running outside the repository checkout, replace the IDL paths with the installed paths shown above.

```bash
export SMARTCUP_NETWORK=mainnet
export ORACLE_PROGRAM_ID=0xe2b3216f2d1115f74c58786d2e9a5068c36a18c2005d24b78a6543609305a00e
export BOLAO_PROGRAM_ID=0x2c80eb710d966c5a2ddc9273e4b5e249c4d22dabd8934c3031fdaeacda1e4a1b
export FREEBET_LEDGER_ID=0x16ddfe734e0861dc45de0f87ca68fbb0e5b0c649b4b381f9af4e1949222bd443
export DAO_PROGRAM_ID=0x005b96df6e65675e81de9503294a1df5aedfd6c111968b7092836799e5008b99
export BOLAO_CODE_ID=0x169788a862973a8f7d4fb4a333a1d48dbe35dbad14c8d1461b7ebc72db76a8df
export BOLAO_IDL=agent-skills/smartcup-programs/references/idl/bolao_program.idl
export FREEBET_LEDGER_IDL=agent-skills/smartcup-programs/references/idl/freebet-ledger.idl
export ORACLE_IDL=agent-skills/smartcup-programs/references/idl/oracle_program.idl
export DAO_IDL=agent-skills/smartcup-programs/references/idl/dao_program.idl
```

## CLI Placeholders

Before running these commands, complete the `vara-wallet` preflight in `wallet-setup.md` and set the runtime constants above.

```bash
vara-wallet --network "$SMARTCUP_NETWORK" --json call "$BOLAO_PROGRAM_ID" Service/QueryState --idl "$BOLAO_IDL"
vara-wallet --network "$SMARTCUP_NETWORK" --json call "$BOLAO_PROGRAM_ID" Service/QueryBetsByUser --args '["<wallet>"]' --idl "$BOLAO_IDL"
vara-wallet --network "$SMARTCUP_NETWORK" --json call "$FREEBET_LEDGER_ID" FreebetLedger/BalanceOf --args '["<wallet>"]' --idl "$FREEBET_LEDGER_IDL"
vara-wallet --network "$SMARTCUP_NETWORK" --json call "$ORACLE_PROGRAM_ID" Service/QueryState --idl "$ORACLE_IDL"
vara-wallet --network "$SMARTCUP_NETWORK" --json call "$DAO_PROGRAM_ID" Service/QueryState --idl "$DAO_IDL"
```

For write calls, preserve the safety rules in `SKILL.md`: verify eligibility/state first and only execute when the user explicitly requests the write.
