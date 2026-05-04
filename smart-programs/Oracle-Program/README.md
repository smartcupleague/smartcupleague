# Oracle Program

A Vara Network (Gear Protocol) smart contract that acts as a decentralized data oracle for sports match results. Multiple authorized feeders submit results independently; the oracle auto-finalizes a result once enough feeders agree (configurable consensus threshold). Designed to feed verified results into the BolaoCore prediction-market program.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Consensus Model](#consensus-model)
- [Module Reference](#module-reference)
- [Function Reference](#function-reference)
- [Events](#events)
- [Security Properties](#security-properties)
- [Setup](#setup)
- [Build & Test](#build--test)
- [Deployment](#deployment)

---

## Overview

- **Admin** pre-registers match IDs before feeders can submit results — prevents phantom entries.
- **Feeders** submit `(home, away, penalty_winner)` independently; no feeder can submit twice for the same match.
- **Consensus** is reached when `N` currently-authorized feeders agree on the same result (`N` = `consensus_threshold`, default 2).
- **Revocation** — revoking a feeder excludes their past submissions from future consensus checks without finalizing a disputed result.
- **Admin override** — `force_finalize_result` bypasses consensus entirely when needed.
- **2-step admin transfer** — `propose_admin` → `accept_admin` prevents permanent lockout from a wrong address.

---

## Architecture

```
Oracle-Program/
├── Cargo.toml              Root package "oracle-program" + workspace (app, client)
├── build.rs                Builds WASM, generates IDL and client file
├── src/lib.rs              Exposes WASM_BINARY + re-exports client crate
├── rust-toolchain.toml     Rust 1.91, target wasm32v1-none
│
├── app/                    Crate: oracle-app  (program logic, no_std)
│   └── src/
│       ├── lib.rs          Program entry point — seeds state, exposes Service
│       └── services/
│           ├── mod.rs      Module declarations
│           ├── constants.rs  DEFAULT_CONSENSUS_THRESHOLD, MAX_FEEDERS, MAX_MATCH_ID
│           ├── types.rs    Score, PenaltyWinner, FinalResult, OracleMatchEntry…
│           ├── errors.rs   OracleError enum
│           ├── events.rs   OracleEvent enum
│           ├── state.rs    OracleState + IoOracleState query projection
│           ├── utils.rs    find_consensus(), feeder_already_submitted()
│           └── service.rs  Service — all exported contract functions
│
├── client/                 Crate: oracle-client  (auto-generated from IDL)
│   ├── build.rs            Regenerates oracle_client.rs on each cargo build
│   └── src/
│       ├── lib.rs          include!("oracle_client.rs")
│       └── oracle_client.rs  Generated client (TemplateFactory, Service, types)
│
└── tests/                  Integration tests (cargo test)
    ├── fixture/mod.rs      Deploy helper, svc_as() helper
    ├── utils.rs            ONE_TVARA constant
    └── test.rs             13 gtest cases covering all oracle behaviour
```

---

## Consensus Model

```
Admin registers match_id
        │
Feeders submit (home, away, penalty_winner)
        │
        ├── count agreeing votes from currently-authorized feeders
        │
        ├── count < consensus_threshold  →  Pending (waiting for more votes)
        │
        └── count >= consensus_threshold →  Finalized (ConsensusReached event)
                                             result locked, cannot be changed
```

Constants (in `app/src/services/constants.rs`):

| Constant | Value | Description |
|----------|-------|-------------|
| `DEFAULT_CONSENSUS_THRESHOLD` | 2 | Minimum agreeing votes to auto-finalize |
| `MAX_FEEDERS` | 20 | Hard cap on simultaneously active feeders |
| `MAX_MATCH_ID` | 10 000 | Valid match ID range |

---

## Module Reference

### `types.rs`

| Type | Description |
|------|-------------|
| `Score` | `{ home: u8, away: u8 }` — final score of a match |
| `PenaltyWinner` | `Home \| Away` — required for drawn knockout matches |
| `OracleResultStatus` | `Pending \| Finalized` — lifecycle of a match oracle entry |
| `ResultSubmission` | Per-feeder vote record `{ feeder, score, penalty_winner, submitted_at }` |
| `FinalResult` | Locked result `{ score, penalty_winner, finalized_at }` |
| `OracleMatchEntry` | Full entry: submissions list + status + final result |
| `IoOracleState` | Read-only state projection returned by `query_state()` |
| `IoMatchResult` | Flat view per match: `{ match_id, status, final_result, submissions: u32 }` |

### `errors.rs`

| Error | Trigger |
|-------|---------|
| `Unauthorized` | Caller is not admin |
| `NotAuthorizedFeeder` | Caller is not an active feeder |
| `MaxFeedersReached` | Trying to authorize a feeder when 20 are already active |
| `InvalidMatchId` | `match_id > MAX_MATCH_ID` |
| `AlreadyFinalized` | Trying to submit/cancel a finalized match |
| `FeederAlreadySubmitted` | Same feeder submits twice for the same match |
| `MatchNotFound` | `cancel_result` on a non-existent match ID |
| `MatchNotRegistered` | Feeder submits to a match not pre-registered by admin |
| `MatchAlreadyRegistered` | `register_match` called twice for the same ID |
| `NoPendingAdmin` | `accept_admin` called when no transfer is in progress |
| `NotPendingAdmin` | `accept_admin` caller is not the proposed admin |
| `ThresholdMustBeAtLeastOne` | `set_consensus_threshold(0)` |
| `ThresholdExceedsMaxFeeders` | Threshold > `MAX_FEEDERS` makes consensus unreachable |
| `InvalidAdmin` | `propose_admin(ActorId::zero())` |

### `state.rs`

`OracleState` fields:

| Field | Type | Description |
|-------|------|-------------|
| `admin` | `ActorId` | Current admin |
| `pending_admin` | `Option<ActorId>` | Proposed admin awaiting confirmation |
| `authorized_feeders` | `HashMap<ActorId, bool>` | Feeder access list (false = revoked) |
| `consensus_threshold` | `u8` | Agreeing votes required to finalize |
| `bolao_program_id` | `Option<ActorId>` | Registered BolaoCore address (informational) |
| `match_results` | `HashMap<u64, OracleMatchEntry>` | All oracle entries keyed by match ID |

---

## Function Reference

### Admin

| Function | Description |
|----------|-------------|
| `register_match(match_id)` | Pre-registers a match ID so feeders can submit results |
| `set_feeder_authorized(feeder, bool)` | Authorizes or revokes a data feeder |
| `set_consensus_threshold(threshold)` | Sets the number of agreeing votes to auto-finalize (1–20) |
| `set_bolao_program(program_id)` | Registers the BolaoCore program address |
| `force_finalize_result(match_id, home, away, penalty_winner)` | Bypasses consensus, finalizes directly |
| `cancel_result(match_id)` | Resets a Pending match, clearing all submissions |
| `propose_admin(new_admin)` | Step 1: proposes a new admin (cannot be zero address) |
| `accept_admin()` | Step 2: proposed admin confirms ownership transfer |

### Feeder

| Function | Description |
|----------|-------------|
| `submit_result(match_id, home, away, penalty_winner)` | Submits a result for a pre-registered match; triggers consensus check |

### Queries (read-only)

| Function | Returns |
|----------|---------|
| `query_state()` | `IoOracleState` — full state snapshot |
| `query_match_result(match_id)` | `Option<FinalResult>` — finalized result or `None` if still pending |
| `query_pending_matches()` | `Vec<u64>` — match IDs still awaiting consensus |
| `query_all_results()` | `Vec<IoMatchResult>` — flat view of all oracle entries |
| `query_feeder_submissions(feeder)` | `Vec<(u64, Score, Option<PenaltyWinner>)>` — matches where feeder submitted |

---

## Events

| Event | Emitted by |
|-------|-----------|
| `MatchRegistered(match_id)` | `register_match` |
| `FeederSet(feeder, authorized)` | `set_feeder_authorized` |
| `ConsensusThresholdSet(threshold)` | `set_consensus_threshold` |
| `BolaoProgram(program_id)` | `set_bolao_program` |
| `ResultSubmitted(match_id, feeder, score)` | `submit_result` — vote recorded, consensus not yet reached |
| `ConsensusReached(match_id, score, penalty_winner)` | `submit_result` — threshold met, result finalized |
| `ResultForced(match_id, score, penalty_winner)` | `force_finalize_result` |
| `ResultCancelled(match_id)` | `cancel_result` |
| `AdminProposed(old, proposed)` | `propose_admin` |
| `AdminChanged(old, new)` | `accept_admin` |

---

## Security Properties

**Access control**
- `ensure_admin()` and `ensure_feeder()` guards on all privileged functions.
- Admin transfer is 2-step (`propose_admin` → `accept_admin`), zero address rejected.
- Constructor panics if `admin == ActorId::zero()`.

**Revocation safety**
- Revoking a feeder excludes their votes from ALL future consensus checks, including votes already submitted before revocation.

**No phantom entries**
- Feeders cannot create match entries; only admin can pre-register a match ID. Submission to an unregistered ID is rejected with `MatchNotRegistered`.

**Finalization is irreversible**
- A `Finalized` match cannot be cancelled — `cancel_result` returns `AlreadyFinalized`. This prevents state inconsistency with downstream consumers (BolaoCore).

**Double-submit protection**
- One submission per feeder per match. `FeederAlreadySubmitted` on the second attempt.

**Feeder cap**
- Maximum 20 simultaneously active feeders (`MAX_FEEDERS`). Revoking one active feeder frees a slot.

---

## Setup

**Requirements:**

```bash
# Rust toolchain (handled by rust-toolchain.toml automatically)
rustup show   # should activate 1.91

# WASM target
rustup target add wasm32v1-none

# Binaryen (for wasm-opt)
# macOS:
brew install binaryen
# Ubuntu:
apt install binaryen
```

---

## Build & Test

```bash
cd smart-programs/Oracle-Program

# Remove stale lockfile on first run after migration
rm -f Cargo.lock

# Build (compiles WASM + generates IDL + regenerates oracle_client.rs)
cargo build

# Run all 13 gtest cases (local, no node required)
cargo test

# Run a specific test
cargo test consensus_happy_path

# Check only (faster, no WASM build)
cargo check
```

The 13 test cases in `tests/test.rs` cover:

| # | Test | What it verifies |
|---|------|-----------------|
| 1 | `deploy_and_query_state` | Initial state: admin, threshold=2, empty feeders/matches |
| 2 | `register_match_only_admin` | Non-admin cannot register; admin can |
| 3 | `submit_requires_registration` | Feeder cannot submit to an unregistered match |
| 4 | `consensus_happy_path` | 2 feeders agree → result finalized |
| 5 | `revoked_feeder_excluded_from_consensus` | Revoked votes don't count toward threshold |
| 6 | `cancel_result_blocks_finalized` | Cannot cancel Finalized; can cancel Pending |
| 7 | `threshold_bounds` | `0` and `>20` rejected; `1` and `20` accepted |
| 8 | `propose_admin_rejects_zero` | Zero address rejected in admin transfer |
| 9 | `admin_two_step_transfer` | Full propose → accept flow; stranger cannot accept |
| 10 | `force_finalize_bypasses_consensus` | Admin override works without feeders |
| 11 | `feeder_cannot_double_submit` | Second submit by same feeder is rejected |
| 12 | `max_feeders_limit` | 21st feeder rejected; slot freed after revocation |
| 13 | `constructor_rejects_zero_admin` | Deploy with zero admin panics |

---

## Deployment

The constructor takes one argument: the initial admin `ActorId`.

```bash
# Optimized WASM binary is produced at:
target/wasm32v1-none/release/oracle_program.opt.wasm

# Deploy via Gear CLI
gear program upload \
  --code target/wasm32v1-none/release/oracle_program.opt.wasm \
  --payload <admin_actor_id_hex>
```

Or use the [Gear IDEA](https://idea.gear-tech.io) web interface.

**Frontend environment variable:**

| Variable | Description |
|----------|-------------|
| `VITE_ORACLEPROGRAM` | On-chain program ID of this deployed oracle |

---

## License

Licensed under the [MIT License](../../LICENSE). Copyright © 2026 Rafael Machtura.
