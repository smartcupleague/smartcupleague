# Vara Wallet Setup

SmartCup program interaction uses the `vara-wallet` CLI for Sails IDL calls. Agents must verify it is available before reading or writing program state.

## Preflight

Run before any `vara-wallet` command:

```bash
if command -v vara-wallet >/dev/null 2>&1; then
  echo "[PREFLIGHT] OK: vara-wallet present ($(vara-wallet --version 2>/dev/null || true))"
else
  echo "[PREFLIGHT] MISSING: vara-wallet CLI is not on PATH."
  echo "[PREFLIGHT] Install: npm install -g vara-wallet"
  echo "[PREFLIGHT] Then restart the shell or agent session if PATH did not refresh."
fi
```

If `vara-wallet` is missing, stop before program calls and ask the user for permission to install it. Do not attempt SmartCup live reads or writes until the CLI is present or the user provides another supported client.

## Install

Preferred install command:

```bash
npm install -g vara-wallet
```

Known working local version observed during skill preparation:

```text
vara-wallet 0.16.0
```

## Required Capabilities

The CLI must support:

- `vara-wallet --network <name> --json call <programId> <method> --idl <path>`
- `vara-wallet --version`
- Sails IDL method paths such as `Service/QueryState` and `FreebetLedger/BalanceOf`

Use `--network mainnet`, `--network testnet`, `--network local`, or `--ws <endpoint>` according to the deployment environment. Confirm the correct network/RPC before live calls.

## Safety

- Never ask the user to paste mnemonic, seed, or private key material into chat.
- For write calls, require explicit user instruction and confirm method, program ID, wallet/account, args, attached value if any, and network.
- For read-only calls, prefer `--json` output and summarize only the relevant fields.
