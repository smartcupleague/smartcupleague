# DAO SmartCupLeague Program

A Vara Network (Gear Protocol) governance contract that controls and deploys [`BolaoCore`](../BolaoCore-Program/README.md) prediction-market instances. The DAO acts as both a **governance layer** (proposals, voting, execution) and an **on-chain factory** for new BolaoCore programs, while owning admin rights on the BolaoCore programs it manages.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Governance Model](#governance-model)
- [Factory Model](#factory-model)
- [Proposal Kinds](#proposal-kinds)
- [Proposal Lifecycle](#proposal-lifecycle)
- [Module Reference](#module-reference)
- [Function Reference](#function-reference)
- [Events](#events)
- [Security Properties](#security-properties)
- [Build & Test](#build--test)
- [Deployment](#deployment)

---

## Overview

- **Two-track governance.** The DAO supports both immediate-action paths (owner-only) and proposal-based paths (1 wallet = 1 vote, quorum-gated).
- **BolaoCore admin.** The DAO program ID is the admin of the BolaoCore programs it manages. Successful proposals translate into raw SCALE-encoded messages dispatched to BolaoCore's `Service` route.
- **On-chain factory.** Once a BolaoCore WASM `code_id` is registered, the DAO can deploy new BolaoCore instances either directly (owner-only) or through a `DeployBolao` proposal.
- **Generic `ProposalKind` enum.** All actions are typed enum variants — no free-form bytes or unsafe execution paths.
- **One vote per wallet per proposal.** Sybil resistance is delegated to off-chain KYC (`kyc_contract` field is informational and unused at the contract level today).

---

## Architecture

```
DAO-SmartCupLeague-Program/
├── Cargo.toml              Root package "dao-smart-cup-league" + workspace (app, client)
├── build.rs                Builds WASM, generates IDL and client
├── src/lib.rs              WASM_BINARY + re-exports client crate
├── rust-toolchain.toml     Rust 1.91, target wasm32v1-none
│
├── app/                    Crate: dao-app (program logic, no_std)
│   └── src/
│       ├── lib.rs          Program entry — seeds state, exposes Service
│       └── services/
│           ├── mod.rs
│           ├── constants.rs    DEFAULT_QUORUM_BPS, DEFAULT_VOTING_PERIOD_MS,
│           │                   DEFAULT_BOLAO_DEPLOY_GAS, MAX_DESCRIPTION_LEN
│           ├── types.rs        VoteChoice, ProposalStatus, ProposalKind, Proposal,
│           │                   BolaoInstance, IoDaoState
│           ├── events.rs       DaoEvent enum
│           ├── state.rs        DaoState + IoDaoState projection
│           ├── utils.rs        compute_status() — quorum + tally evaluation
│           └── service.rs      Service — exported governance + factory functions,
│                               + dispatch_bolao() helper for SCALE call encoding
│
├── client/                 Crate: dao-client (auto-generated from IDL)
│   ├── build.rs            Regenerates dao_smart_cup_league_client.rs each build
│   └── src/
│       ├── lib.rs
│       └── dao_smart_cup_league_client.rs   ← generated, do not edit
│
└── tests/                  Integration tests (cargo test)
```

The DAO uses Gear's static mutable state pattern (`static mut DAO_STATE`). All durations are `u64` milliseconds; quorum is in basis points (`u16`, 10 000 = 100 %).

---

## Governance Model

| Parameter | Default | Configurable via |
|---|---|---|
| Voting period | 24 hours (`DEFAULT_VOTING_PERIOD_MS`) | `SetVotingPeriod` proposal |
| Quorum | 20 % of voters (`DEFAULT_QUORUM_BPS = 2_000`) | `SetQuorum` proposal |
| Voting weight | 1 wallet = 1 vote | n/a (not delegated) |
| Vote choices | Yes / No / Abstain | n/a |

Status is computed by `compute_status` after voting ends:

```
total = yes + no + abstain
participation = total
quorum_met    = participation * 10_000 >= total_eligible * quorum_bps   (off-chain in current MVP)

if not quorum_met → Defeated
elif yes > no     → Succeeded
else              → Defeated
```

> **Current implementation note:** `compute_status` in this MVP applies a simple yes-vs-no rule on the votes recorded; the quorum field is wired through but not enforced against an external "eligible voter" count. The architecture leaves room to plug in a token-weighted module later without changing the public API.

---

## Factory Model

The DAO can deploy new BolaoCore programs through the on-chain factory. This requires a one-time setup:

```
1.  register_bolao_code(code_id)        [owner]
        ↓ stores the BolaoCore WASM hash in DaoState

2a. deploy_bolao(admin, salt, gas)      [owner]               immediate path
2b. proposal: DeployBolao { admin, salt, gas_limit }          governance path
        ↓
    gstd::prog::create_program_bytes_with_gas() with the registered code_id
        ↓
    new BolaoInstance recorded in state.bolao_instances
```

The deployed BolaoCore program's constructor is `New(admin: ActorId)`. To make the DAO itself the admin of the new BolaoCore (the recommended pattern), pass `exec::program_id()` as `admin` from a proposal-execution context, or use the DAO's own program ID.

`salt` must be unique per deployment to avoid deterministic address collisions.

---

## Proposal Kinds

All variants of `ProposalKind` and what they dispatch:

### BolaoCore configuration (sent as admin)

| Variant | Maps to BolaoCore method |
|---|---|
| `AddPhase { name, start_time, end_time, points_weight }` | `register_phase` |
| `AddMatch { phase, home, away, kick_off }` | `register_match` |
| `SetOracleAuthorized { oracle, authorized }` | `set_oracle_authorized` |
| `FinalizePodium { champion, runner_up, third_place }` | `finalize_podium` |
| `CancelMatchResult { match_id }` | `cancel_proposed_result` |

### BolaoCore factory

| Variant | Action |
|---|---|
| `DeployBolao { admin, salt, gas_limit }` | Calls the on-chain factory to instantiate a new BolaoCore program from the registered `code_id`. Requires `register_bolao_code` to have been called previously. |

### DAO governance

| Variant | Action |
|---|---|
| `SetQuorum { new_quorum_bps }` | Updates `state.quorum_bps` |
| `SetVotingPeriod { new_voting_period }` | Updates `state.voting_period` |
| `SetDefaultBolao { new_bolao }` | Updates `state.bolao_program` — the default target for BolaoCore-bound proposals |

---

## Proposal Lifecycle

```
1.  create_proposal(kind, description)   [anyone]   → Active, voting window opens
        │
        ▼
2.  vote(proposal_id, choice)            [anyone]   1 wallet = 1 vote, until end_time
        │
        ├── (end_time reached)
        ▼
3.  finalize_proposal(proposal_id)       [anyone]   compute_status → Succeeded | Defeated
        │
        ├── if Succeeded:
        ▼
4.  execute(proposal_id)                 [anyone]   dispatches the encoded action
        │                                           emits ProposalExecuted, then
        │                                           BolaoCallDispatched if applicable
        │
        └── proposal.executed = true (idempotent)
```

Steps 3 and 4 are **permissionless** — anyone can finalize or execute. Step 1 is **open** to any caller. Step 2 is **one vote per address per proposal**.

---

## Module Reference

### `constants.rs`

| Constant | Value | Purpose |
|---|---|---|
| `DEFAULT_QUORUM_BPS` | 2 000 (20 %) | Initial quorum threshold |
| `DEFAULT_VOTING_PERIOD_MS` | 86 400 000 (24h) | Initial voting window length |
| `DEFAULT_BOLAO_DEPLOY_GAS` | 10 000 000 000 | Gas reserved for BolaoCore init message |
| `MAX_DESCRIPTION_LEN` | 512 bytes | Upper bound on proposal description |

### `types.rs`

| Type | Purpose |
|---|---|
| `VoteChoice` | `Yes \| No \| Abstain` |
| `ProposalStatus` | `Active \| Defeated \| Succeeded \| Executed \| Expired` |
| `ProposalKind` | Tagged enum of every action governance can take (see [Proposal Kinds](#proposal-kinds)) |
| `Proposal` | Full proposal record with vote tallies, status, executed flag |
| `BolaoInstance` | Metadata for a BolaoCore deployed via the factory: `program_id`, `admin`, `deployed_at` |
| `IoDaoState` | Read-only state projection returned by `query_state` |

### `state.rs`

`DaoState` fields:

| Field | Type | Description |
|---|---|---|
| `owner` | `ActorId` | Privileged caller (immediate-action paths, code registration) |
| `bolao_program` | `ActorId` | Default BolaoCore that proposals dispatch to |
| `bolao_code_id` | `Option<[u8; 32]>` | Registered WASM code_id used by the factory |
| `bolao_instances` | `Vec<BolaoInstance>` | Programs deployed through the factory |
| `kyc_contract` | `Option<ActorId>` | Reserved for off-chain Sybil resistance integration |
| `quorum_bps` | `u16` | Current quorum threshold |
| `voting_period` | `u64` | Voting window in ms |
| `proposal_count` | `u64` | Monotonic ID counter |
| `proposals` | `HashMap<u64, Proposal>` | All proposals keyed by ID |
| `votes` | `HashMap<(u64, ActorId), VoteChoice>` | Per `(proposal_id, voter)` vote record |

---

## Function Reference

### Owner-only (immediate)

| Function | Description |
|---|---|
| `set_bolao_program(new_bolao)` | Update the default BolaoCore that proposals target |
| `set_owner(new_owner)` | Single-step ownership transfer (zero address rejected) |
| `register_bolao_code(code_id)` | Store the BolaoCore WASM hash for the factory |
| `deploy_bolao(admin, salt, gas_limit)` | Deploy a new BolaoCore via the factory without a vote |

### Anyone (governance)

| Function | Description |
|---|---|
| `create_proposal(kind, description)` | Open a new proposal — voting window starts now |
| `vote(proposal_id, choice)` | Cast `Yes` / `No` / `Abstain`; one vote per address per proposal |
| `finalize_proposal(proposal_id)` | Compute final status after voting period — permissionless |
| `execute(proposal_id)` | Dispatch a `Succeeded` proposal's action — permissionless |

### Queries (read-only)

| Function | Returns |
|---|---|
| `query_state()` | `IoDaoState` — full state snapshot |
| `query_proposal(id)` | `Option<Proposal>` |
| `query_proposals(offset, limit)` | `Vec<Proposal>` — paginated list |
| `query_vote(proposal_id, voter)` | `Option<VoteChoice>` |
| `query_bolao_instances()` | `Vec<BolaoInstance>` — all factory-deployed programs |

> Some query names may differ slightly — the IDL is the source of truth. Run `cargo build` to regenerate the client and check `client/src/dao_smart_cup_league_client.rs`.

---

## Events

| Event | Emitted by |
|---|---|
| `ProposalCreated(id, proposer)` | `create_proposal` |
| `Voted(id, voter, choice)` | `vote` |
| `ProposalFinalized(id, status)` | `finalize_proposal` |
| `ProposalExecuted(id)` | `execute` (after `Succeeded`) |
| `BolaoCallDispatched(id)` | `execute` for BolaoCore-bound variants — emitted **after** the SCALE message has been sent to BolaoCore |
| `BolaoDeployed(program_id, admin)` | `deploy_bolao` and `execute` of `DeployBolao` |
| `BolaoCodeRegistered` | `register_bolao_code` (no arguments — the code hash is omitted from the event payload) |
| `GovernanceParamUpdated` | `set_bolao_program`, executed `SetQuorum` / `SetVotingPeriod` / `SetDefaultBolao` |
| `OwnerChanged(new_owner)` | `set_owner` |

---

## Security Properties

### Access control
- `only_owner()` guard on `set_owner`, `set_bolao_program`, `register_bolao_code`, `deploy_bolao`.
- `set_owner` rejects `ActorId::zero()`, preventing accidental lockout.
- All other state-mutating entry points are open by design (proposal creation, voting, finalization, execution) — the gating happens through proposal status checks inside `execute`.

### Vote integrity
- One vote per `(proposal_id, voter)` enforced via `state.votes` map; second attempt panics with "Already voted".
- Vote tallies use `saturating_add(1)` — counts cannot overflow within practical bounds.
- `vote` rejects votes after `end_time` and on non-`Active` proposals.

### Execution integrity
- `execute` requires `status == Succeeded`. Active proposals panic; defeated proposals are no-ops.
- `proposal.executed = true` after a successful execute, preventing replay of the same dispatch.
- BolaoCore dispatches use `msg::send_bytes` with zero value — the DAO never moves funds; it only sends governance commands.

### Factory integrity
- `deploy_bolao` panics if `bolao_code_id` is `None`. The owner must call `register_bolao_code` first.
- `salt` collisions cause `create_program_bytes_with_gas` to fail, surfacing the error as a panic — no silent overwrite.

### Description size
- Descriptions are capped at `MAX_DESCRIPTION_LEN = 512` bytes to prevent storage bloat / gas DoS attacks via free-form text.

### What is NOT covered
- **Sybil resistance.** 1 wallet = 1 vote; nothing stops a single human from creating multiple wallets. Production deployment expects an off-chain KYC layer or a token-weighted voting upgrade.
- **Time-lock between Succeeded and Executed.** The `Expired` status is reserved in the enum but unused — there is currently no enforced delay between vote close and execution. Add one if the DAO governs treasury-sensitive actions.

---

## Build & Test

```bash
cd smart-programs/DAO-SmartCupLeague-Program

# Remove stale lockfile on first run
rm -f Cargo.lock

# Build (compiles WASM + generates IDL + regenerates client)
cargo build

# Run gtest integration tests (no node required)
cargo test

# Faster type-check, skips WASM build
cargo check
```

The optimised WASM binary lands at `target/wasm32v1-none/release/dao_smart_cup_league_program.opt.wasm`.

---

## Deployment

The constructor takes one argument: the initial **default BolaoCore program ID** that this DAO will manage.

```bash
gear program upload \
  --code target/wasm32v1-none/release/dao_smart_cup_league_program.opt.wasm \
  --payload <bolao_program_id_hex>
```

**Post-deploy checklist:**

1. Call `register_bolao_code(code_id)` with the BolaoCore WASM hash — required before any `deploy_bolao` or `DeployBolao` proposal.
2. Optionally update `set_bolao_program` if you intend to govern an existing BolaoCore that wasn't passed at construction.
3. Transfer admin rights of the target BolaoCore program to this DAO's `program_id` (using BolaoCore's `add_admin` / `remove_admin`). Without this step, BolaoCore-bound proposals will execute but be rejected by BolaoCore's `only_admin()` guard.

**Frontend environment variable:**

| Variable | Description |
|---|---|
| `VITE_DAOPROGRAM` | On-chain program ID of this deployed DAO |

---

## License

Licensed under the [MIT License](../../LICENSE). Copyright © 2026 Rafael Machtura.

## Contact

Rafael Machtura — rafael.machtura@gmail.com
