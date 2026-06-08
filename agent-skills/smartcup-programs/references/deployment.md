# SmartCup Deployment

## Current Program IDs

These IDs are the current SmartCup testnet deployment (testnet-2026-06-08). Use `--network testnet` unless the user explicitly provides a different deployment.

| Component | ID |
| --- | --- |
| Oracle | `0xf43a4a756ea89fb4627bb6b1f10d85e83f8d3e2999ca9d84cae8d6e8aaba302d` |
| BolaoCore | `0x1f4e86dbbd05285a9046e11dc1330429891feef5ccaa437c85d7672009a66b7c` |
| FreebetLedger | `0x68d6d9858b2eb1f6c7e606e51277d58f47dd17076e7e42ab6e43342fbc715d10` |
| DAO | `0xa3ffa9bf9aa594c7676733f3c01766f30691fe8ec2027a9a3f92f70404f13cc7` |
| BolaoCore code ID | `0xe3836d11c21425c56e48f92cb5ed01bd8891c90fca4f0fd4a37cf508e16f5372` |

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
export SMARTCUP_NETWORK=testnet
export ORACLE_PROGRAM_ID=0xf43a4a756ea89fb4627bb6b1f10d85e83f8d3e2999ca9d84cae8d6e8aaba302d
export BOLAO_PROGRAM_ID=0x1f4e86dbbd05285a9046e11dc1330429891feef5ccaa437c85d7672009a66b7c
export FREEBET_LEDGER_ID=0x68d6d9858b2eb1f6c7e606e51277d58f47dd17076e7e42ab6e43342fbc715d10
export DAO_PROGRAM_ID=0xa3ffa9bf9aa594c7676733f3c01766f30691fe8ec2027a9a3f92f70404f13cc7
export BOLAO_CODE_ID=0xe3836d11c21425c56e48f92cb5ed01bd8891c90fca4f0fd4a37cf508e16f5372
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
