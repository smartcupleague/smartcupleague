# SmartCup Deployment

## Current Program IDs

These IDs are the current SmartCup mainnet deployment (mainnet-2026-06-10). Use `--network mainnet` unless the user explicitly provides a different deployment.

| Component | ID |
| --- | --- |
| Oracle | `0x7c4fa90ac5672a0d7bc22d227962704b14690e2e14fc20098501eea37af36315` |
| BolaoCore | `0x3fec9d4b68f95917e572e03f8615b2512b8a5051d462dcacb8e4fdc97e8b4894` |
| FreebetLedger | `0x9541487e75500c80f18cc03d08abb24681df6b19c28064e8503f0dd76175239e` |
| DAO | `0xed44644f7cb9d06e089df764afc78b3788ee58b16b3cb5fcf1351977c1bbdbfe` |
| BolaoCore code ID | `0xba6ba195ca96084c4bd381973926c563f6e5d3ea0674c3fcf77c1d6b86d73f70` |

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
export ORACLE_PROGRAM_ID=0x7c4fa90ac5672a0d7bc22d227962704b14690e2e14fc20098501eea37af36315
export BOLAO_PROGRAM_ID=0x3fec9d4b68f95917e572e03f8615b2512b8a5051d462dcacb8e4fdc97e8b4894
export FREEBET_LEDGER_ID=0x9541487e75500c80f18cc03d08abb24681df6b19c28064e8503f0dd76175239e
export DAO_PROGRAM_ID=0xed44644f7cb9d06e089df764afc78b3788ee58b16b3cb5fcf1351977c1bbdbfe
export BOLAO_CODE_ID=0xba6ba195ca96084c4bd381973926c563f6e5d3ea0674c3fcf77c1d6b86d73f70
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
