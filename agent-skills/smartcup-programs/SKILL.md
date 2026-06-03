---
name: smartcup-programs
description: Interact safely with SmartCup/Vara tournament programs and support services. Use when Codex needs to read SmartCup matches, inspect user predictions, check freebet balances, place wallet or freebet predictions, reason about BolaoCore/Oracle/FreebetLedger state, prepare claim/refund actions, or debug frontend/backend flows involving All Matches, My Predictions, Rewards, Leaderboard, rewards-backend, or voucher-backend.
---

# SmartCup Programs

## Overview

Use this skill to work with SmartCup program state and transaction flows without trusting frontend labels as the source of truth. Treat `BolaoCore.Service.QueryState` as canonical for tournament/match state, and read [references/smartcup-program-reference.md](references/smartcup-program-reference.md) when field semantics or method names matter.

Exact IDL files are bundled under `references/idl/`. Current deployment IDs and IDL path examples are in [references/deployment.md](references/deployment.md). Always prefer these files over memory when constructing calls, generated clients, payloads, or docs.

## Ground Rules

- Run the `vara-wallet` preflight in [references/wallet-setup.md](references/wallet-setup.md) before any on-chain SmartCup program call. If `vara-wallet` is missing, stop and ask permission to install it.
- Normalize every wallet address to full hex `0x...` before querying or comparing.
- Do not submit a real bet, claim, refund, oracle result, or backend reward/voucher mutation unless the user explicitly asks for that write action.
- Before any prediction write, show or verify `match_id`, score, penalty winner if any, amount, funding source, wallet, and current eligibility.
- Before any write, admin, oracle, governance, emergency, or migration action, read [references/safety-matrix.md](references/safety-matrix.md) and follow the required confirmation level.
- Prefer program queries over frontend-derived state. Use frontend labels only as presentation hints.
- Discover program IDs, RPC endpoints, wallet command syntax, IDL paths, and network from the local repo/env before live calls.
- Use exact service names from IDL: BolaoCore, Oracle, and DAO expose `service Service`; FreebetLedger exposes `service FreebetLedger`.

## Operating Model

- For read-only work, choose the relevant recipe under `skills/`.
- For write-capable work, read `references/safety-matrix.md` first and use the matching recipe.
- For field semantics, use `references/smartcup-program-reference.md`.
- For program IDs, IDL paths, and reusable shell constants, use `references/deployment.md`.
- For `vara-wallet` JSON argument encoding, use `references/vara-wallet-encoding.md`.
- For expected frontend screen effects after reads/writes, use `references/ui-verification.md`.
- For exact method signatures and enum shapes, inspect the bundled IDL directly.

## Recipe Files

Read only the recipe needed for the user's request:

- `skills/preflight.md` - verify `vara-wallet` and read-only access to all SmartCup mainnet programs.
- `skills/read_matches.md` - read all matches, one match, or matches by phase.
- `skills/check_user_bets.md` - inspect a user's bets and claim status.
- `skills/check_freebet_balance.md` - inspect FreebetLedger balance, authorization, and totals.
- `skills/recommend_prediction.md` - read-only strategic prediction recommendation with proposed tx but no execution.
- `skills/place_wallet_bet.md` - wallet-funded prediction flow with duplicate/cutoff checks and dry-run-first command.
- `skills/place_freebet_bet.md` - freebet-funded prediction flow through FreebetLedger with balance/authorization checks.
- `skills/claim_match_reward.md` - finalized match reward claim flow.
- `skills/claim_refund.md` - cancelled-match refund claim flow.
- `skills/post_match_review.md` - read-only result review, error labeling, and optional local memory record.
- `skills/oracle_read_results.md` - read-only Oracle result/state inspection.
- `skills/dao_read_proposals.md` - read-only DAO governance inspection.

## Reference

Read [references/smartcup-program-reference.md](references/smartcup-program-reference.md) for the compact architecture map, state fields, eligibility rules, and funding/claim semantics.

Read [references/deployment.md](references/deployment.md) for current program IDs, the BolaoCore code ID, IDL paths, and CLI placeholders. Confirm the network/RPC from the user's environment before live calls.

Read [references/wallet-setup.md](references/wallet-setup.md) for the required `vara-wallet` preflight and installation requirement.

Read [references/vara-wallet-encoding.md](references/vara-wallet-encoding.md) before building `PlaceBet` or `SpendFreebet` CLI args.

Read [references/ui-verification.md](references/ui-verification.md) when a user asks what should appear in the app after a SmartCup action, or when frontend state disagrees with program state.

Read [references/safety-matrix.md](references/safety-matrix.md) before write/admin/oracle/governance/dangerous/migration actions.

Read [references/prediction-memory.md](references/prediction-memory.md) before recording recommendation, execution, or post-match review memory.

Read IDL directly when exact signatures matter:

- `references/idl/bolao_program.idl` - BolaoCore match, bet, settlement, claim/refund, admin, migration, and pricing calls.
- `references/idl/freebet-ledger.idl` - Freebet balance, grant, spend, return, and authorized bet program calls.
- `references/idl/oracle_program.idl` - result feeder, consensus/finalization, price oracle, and oracle state calls.
- `references/idl/dao_program.idl` - governance proposals, voting, Bolao factory deployment, and DAO state calls.
