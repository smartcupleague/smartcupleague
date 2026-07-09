# SmartCup League Solana Migration Initial Technical Report

Date: 2026-07-09

Local repo checked: `smartcupleague/smartcupleague`
Local `HEAD`: `28d5f156a5fcf302b38cf14e77f16f2e3028b716`
Official GitHub `main`: `28d5f156a5fcf302b38cf14e77f16f2e3028b716`

## Executive Summary

The current SmartCup League protocol is a Vara/Gear/Sails application with three core on-chain surfaces:

- `BolaoCore`: tournament, matches, predictions, payouts, leaderboard, podium picks, refunds, migration export/import.
- `Oracle`: result ingestion and consensus.
- `DAO`: governance proposals and a factory for new BolaoCore deployments.

The fastest credible path to Solana before the Champions League 2026/27 league phase starts on 2026-09-08 is not a byte-for-byte port. It should be a Solana-native rewrite of the same product rules using Anchor, SPL token vaults, PDAs, and indexed off-chain projections. The deadline is tight: from 2026-07-09 to 2026-09-08 is about 61 calendar days. That is enough for an MVP if scope is disciplined, but not enough for a broad migration plus a fully custom DAO unless several developers work in parallel.

Updated MVP priority after product clarification:

- DAO is not mandatory for the first Solana release.
- Mandatory: a BolaoCore-style tournament factory that makes new tournaments easy to create.
- Mandatory: private/user tournaments with an easy admin/config UI for the creator.
- Mandatory: oracle/data-provider redundancy, result guards, and operational safety tooling.
- Mandatory: USDC as the prediction currency.
- Mandatory: broad Solana wallet support through Wallet Standard-compatible connection flows.

Recommended delivery strategy:

1. Build a fresh Solana protocol for Champions League 2026/27 rather than trying to transfer live World Cup state.
2. Use USDC on Solana as the initial prediction currency. Keep the 5% SmartCup fee fixed.
3. Implement official tournaments and private/user tournaments on the same core program model.
4. Prioritize a BolaoCore factory/registry account model for multi-tournament creation and discovery.
5. Prioritize private tournament admin UX: setup, invite, publish, manage fixtures, monitor bets, and handle result/finalization actions.
6. Defer DAO parity. Use an operator/multisig authority for launch, with upgrade path to DAO/governance later.
7. Keep the existing frontend multi-tournament work, but replace hard-coded tournament keys with dynamic Solana tournament discovery.

## Current Repo Findings

### Repository Freshness

The local checkout is up to date with the official GitHub `main` branch:

- Local `HEAD`: `28d5f156a5fcf302b38cf14e77f16f2e3028b716`
- Remote `refs/heads/main`: `28d5f156a5fcf302b38cf14e77f16f2e3028b716`

The official GitHub README describes SmartCup League as a fully on-chain prediction market on Vara/Gear, with a React frontend, oracle server, backend/indexing surfaces, and the three contracts `Oracle-Program`, `BolaoCore-Program`, and `DAO-SmartCupLeague-Program`.

### Important Local Caveat

The worktree is dirty with unrelated local modifications in oracle/backend/frontend files. I did not alter or revert them. This report uses the checked-out code as the analysis source.

### Current Protocol Rules In Code

The current economic constants are:

- Protocol fee: 5%.
- Final prize cut from match predictions: 10%.
- Match pool receives the remaining 85%.
- Podium picks split 95% to final prize and 5% protocol fee.
- Betting closes 10 minutes before kick-off.
- Current dev/test challenge and claim windows are 2 minutes and 4 minutes respectively, with comments indicating intended production windows of 24 hours and 72 hours.

### Current State Model

`BolaoCore` currently stores:

- Admins, operators, treasury.
- Protocol fee and final prize accumulators.
- Matches, phases, user points, bets, user bet history.
- Podium picks and podium result.
- Authorized oracles.
- Final prize allocations and claim status.
- Pending refunds.
- Price oracle cache and freebet ledger link.
- Migration lock/export/import fields.

This maps well to Solana accounts, but cannot be ported as one giant account. Solana requires state to be split across PDAs.

### Current Multi-Tournament Status

The frontend already has an early multi-tournament model, but it is static:

- `TournamentKey` is only `'leagues' | 'worldcup'`.
- `ACTIVE_TOURNAMENTS` includes only World Cup 2026.
- Tournament classification is inferred from phase names.

Private tournaments require dynamic tournament discovery, metadata, and routing. The existing modal/work is useful, but it is not yet the data model needed for user-created tournaments.

### Current DAO Status

The Vara DAO supports:

- Add phase.
- Add match.
- Set oracle authorization.
- Finalize podium.
- Cancel proposed result.
- Deploy a new BolaoCore through a factory.
- Set quorum, voting period, and default BolaoCore.

On Solana, this should become either:

- A governance-controlled registry/factory using SPL Governance/Realms for voting and execution authority.
- Or a custom Anchor DAO program if SmartCup needs one-wallet-one-vote and no governance token.

For the September deadline, the DAO should not be on the MVP critical path. The useful piece to carry forward now is the factory concept: the current DAO can deploy/list BolaoCore instances, and Solana should preserve that product capability through a dedicated factory/registry even if governance voting is deferred.

## Solana Architecture Proposal

### Recommended Program Set

Use Anchor as the default framework because it gives account validation, IDL generation, and a TypeScript client path. Solana accounts are the basic state unit, each with lamports, data, owner, executable flag, and rent requirements. PDAs are deterministic addresses derived from seeds and a program ID; they have no private key and can be signed by the program during CPIs.

Recommended Solana programs:

1. `smartcup_core`
   - Owns tournaments, phases, matches, predictions, prize accounting, claims, refunds, and payout rules.

2. `smartcup_factory`
   - Mandatory MVP component.
   - Creates official and private tournaments from bounded templates.
   - Enforces immutable protocol constraints such as USDC mint, SmartCup 5% fee floor, allowed payout schemas, and creator permissions.
   - Emits/list-stores tournament metadata so the frontend and indexer can discover all active tournaments.

3. `smartcup_registry`
   - Lists official and private tournaments.
   - Stores discovery metadata, visibility, creator, status, supported mint, moderation state, and lifecycle state.
   - Can be merged into `smartcup_factory` for MVP if reducing program count helps speed.

4. `smartcup_oracle`
   - Result feeder authorization, submitted results, finalization threshold, and dispute/cancel flow.
   - Must support provider redundancy and explicit guards for stale, conflicting, impossible, or manually overridden results.
   - Could be folded into `smartcup_core` for MVP with oracle signer authorities, then separated later.

5. `smartcup_admin_authority`
   - Optional/minimal launch component.
   - Multisig/operator authority for official tournaments, treasury changes, pause/unpause, and emergency actions.
   - This is not a DAO replacement; it is the launch-time control plane until governance is prioritized.

6. Optional later: `smartcup_governance_adapter`
   - Integration with SPL Governance/Realms or a custom DAO if/when DAO parity becomes a requirement.

7. Optional later: `smartcup_freebet`
   - Sponsored/freebet credit ledger equivalent.
   - Not required for core Champions League launch unless marketing campaigns depend on it.

### Account Model

Suggested Anchor accounts:

- `ProtocolConfig`
  - Seeds: `["protocol"]`
  - Fields: admin/governance authority, treasury token account, protocol fee bps fixed at 500, allowed mints, oracle config, version.

- `Tournament`
  - Seeds: `["tournament", tournament_id]`
  - Fields: creator, authority, title, slug/hash, visibility, status, USDC mint, min prediction amount, match pool bps, final prize bps, protocol fee bps, creator fee bps if approved, payout schema hash, start/end, metadata URI.

- `TournamentStats`
  - Seeds: `["tournament_stats", tournament]`
  - Fields: total volume, protocol fees accrued, final pool, match count, participant count, leaderboard finalization status.

- `Phase`
  - Seeds: `["phase", tournament, phase_index]`
  - Fields: name, start/end, points weight, kind.

- `Match`
  - Seeds: `["match", tournament, match_id]`
  - Fields: teams, kick-off, phase, result status, match prize pool, total winner stake, settlement status.

- `Prediction`
  - Seeds: `["prediction", match, user]`
  - Fields: predicted score, penalty winner, stake, match pool contribution, claimed/refunded status.

- `UserTournament`
  - Seeds: `["user_tournament", tournament, user]`
  - Fields: points, prediction count, final prize allocation, final prize claimed.

- `TournamentVault`
  - PDA token authority for token vaults.
  - Holds SPL token funds for match pools, final pool, pending refunds, and protocol fee accruals.

- `OracleResult`
  - Seeds: `["oracle_result", tournament, match_id]`
  - Fields: provider submissions, status, final score, penalty winner, proposed/finalized timestamps, confidence/threshold data, conflict status.

- `ProviderConfig`
  - Seeds: `["provider", tournament, provider_id]` or global provider seeds.
  - Fields: provider name/hash, authority signer, priority, enabled flag, rate-limit/staleness settings.

- `TournamentAdminRole`
  - Seeds: `["tournament_admin", tournament, wallet]`
  - Fields: role bits for creator, fixture manager, oracle reviewer, moderator, finance viewer.

- Governance adapter accounts
  - Deferred until DAO becomes mandatory.

### Payment Token Choice

Mandatory MVP choice: USDC on Solana.

Reasons:

- Predictable minimum prediction amount.
- No need for a live SOL/USD price oracle for minimum value.
- Easier reporting and user understanding.
- SPL token transfers via Anchor/SPL are standard.
- Better fit for private tournaments because creators can reason in stable units.

Alternative: SOL payments.

- Simpler wallet funding.
- Requires price feed if the product wants a USD-equivalent minimum.
- Adds volatility to prize pools.
- Not recommended for launch.

Alternative: support multiple mints.

- Best long term.
- Too much risk for the September MVP unless there is a strong business reason.
- Should be a v2 extension after USDC is stable.

## Private/User Tournament Feature

### Required Feature Shape

Users should be able to:

- Create a tournament.
- Define title, description/metadata, visibility, invitation mode, supported token/mint.
- Define minimum prediction value.
- Define match pool versus final prize percentage.
- Define final prize distribution schema.
- Invite users or publish/promote the tournament.
- Let SmartCup receive 5% from every prediction.

The creator/admin UI is mandatory for this feature. It should not require command-line scripts or dev/operator intervention for normal private tournament management.

Minimum creator admin UI:

- Create tournament from a guided form.
- Choose public, unlisted, or invite-only visibility.
- Configure minimum prediction amount, match/final pool percentages, final prize distribution, and invite policy.
- Add/edit/remove fixtures before betting opens.
- Bulk upload fixtures by CSV or paste table for small private tournaments.
- See participants, total USDC volume, SmartCup fee, creator fee if enabled, final pool, and match pools.
- Invite users by link, wallet allowlist, or one-time invite code.
- Pause/unpause tournament before launch or during incident response.
- Cancel a match and trigger refunds when needed.
- View oracle/result status and request manual review for disputed results.
- Export tournament data for community reporting.

### Recommended Constraints

For safety and simplicity:

- SmartCup protocol fee remains fixed at 5% and cannot be lowered by creators.
- Creator cannot set invalid bps totals.
- Match pool plus final pool plus protocol fee plus optional creator fee must equal 10,000 bps.
- If creator fee is allowed, define whether it comes out of creator-managed economics or in addition to SmartCup's 5%. Do not let it dilute SmartCup's fee silently.
- Minimum prediction amount must be at least a protocol floor.
- Payout schema must be bounded, for example top 1, top 3, top 5, or custom up to N entries with bps sum exactly 10,000.
- Private tournament access should use an allowlist PDA or invite-code hash, not only frontend hiding.
- Creator-configured values should become immutable after tournament activation, except narrowly defined admin fields such as metadata, invite list, and fixture edits before betting opens.
- The protocol should expose a `pause` state and clear refund path so creators cannot strand funds.

### Marketplace/Promotion

On-chain should store compact metadata and status. Rich promotion content should live off-chain:

- On-chain: metadata URI/hash, creator, visibility, status.
- Off-chain indexer/API: searchable tournament page, invite links, images, descriptions, social promotion.

This avoids expensive on-chain storage and makes moderation possible.

## Governance / DAO Position

DAO parity is not mandatory for the first Solana release. The launch should not wait for a full custom DAO.

What must be preserved now is operational control and tournament creation:

- Protocol admin authority.
- Treasury authority.
- Official tournament authority.
- Factory/registry for official and private tournaments.
- Emergency pause/cancel/refund authority.

### What Can Be Deferred

The DAO currently provides:

- Governance action proposal and voting.
- Operational authority over official tournament setup.
- Default tournament/program selection.
- Factory deployment of tournament instances.

For Solana MVP, preserve the factory behavior but defer governance voting.

For MVP:

- Use a multisig-governed authority as the upgrade/admin authority.
- Let this authority own `ProtocolConfig` and official tournament authority.
- Store official tournaments in the same registry as private tournaments, flagged `official = true`.
- Support admin instructions for:
  - add official tournament,
  - change treasury,
  - authorize oracle signer,
  - change protocol parameters,
  - pause/unpause tournament,
  - finalize podium or final leaderboard if manual approval is required.

For v2:

- Add SPL Governance/Realms or build a custom DAO if SmartCup needs exact current semantics, for example one-wallet-one-vote, custom quorum bps, or no governance token.
- Add timelock for treasury and protocol fee changes.
- Add proposal execution adapters for batch tournament actions.

## Transfer Versus Replication

There are three possible meanings of "migration":

1. Replicate SmartCup rules on Solana for the next tournament.
   - Recommended.
   - Lowest risk.
   - No need to move live Vara state.

2. Snapshot completed World Cup/Vara history into Solana as read-only legacy records.
   - Possible.
   - Useful for reputation and continuity.
   - Needs address mapping from Vara accounts to Solana wallets.

3. Transfer active balances/liabilities from Vara to Solana.
   - High risk.
   - Requires claim windows, bridge/custody design, legal/accounting clarity, and user wallet mapping.
   - Not recommended for the September launch unless there are live obligations after the World Cup.

The current BolaoCore has export/import migration methods for Vara-to-Vara contract evolution. They are useful for snapshot tooling, but they do not directly transfer assets or identities to Solana.

## Oracle And Fixture Setup

The current oracle server is strongly tied to football-data.org, Vara Gear-JS, and sequential Bolao/Oracle match IDs. For Solana:

- Reuse the football-data.org fetch, mapping, and admin setup logic conceptually.
- Replace Gear transaction calls with Anchor/TypeScript Solana transactions.
- Make tournament ID explicit in all endpoints.
- Store match IDs as `(tournament, match_id)` not global sequential IDs.
- Use dry-run fixture sync for Champions League phases before sending transactions.
- Add idempotent setup instructions so retries cannot double-register phases or matches.

Mandatory MVP oracle/data model:

- `register_match` by tournament authority/operator.
- `submit_result` by authorized feeder/provider signer.
- Multiple provider submissions per match where available.
- Provider status tracking: enabled/disabled, stale, degraded, conflicting.
- Result normalization guards: team identity mapping, full-time versus penalties, abandoned/postponed/cancelled states, impossible score checks, kick-off/final-time guards.
- Conflict handling: if providers disagree, mark result as `Disputed` and require manual operator review before finalization.
- `finalize_result` only after threshold, trusted fallback, or manual review path.
- `propose/finalize` challenge window if product still wants optimistic dispute.
- Idempotent retries so oracle workers can safely resubmit without double finalization.
- Audit log/events for provider source, submitted score, timestamp, and finalization route.

Data provider redundancy should be treated as launch-critical. If full multi-provider automation is too slow, the fallback should still be explicit: one primary API, one secondary API/manual verified source, conflict status, and human review tooling before finalization.

## Frontend And Backend Changes

Frontend:

- Replace Vara wallet/SubWallet integration with Solana wallet-standard adapters.
- Use Wallet Standard discovery-first flows so Phantom, Solflare, Backpack, Glow, Ledger-backed wallets, mobile wallet adapters, and other compatible wallets can appear without hard-coding only one provider.
- Add graceful fallback messaging when a wallet supports connection but lacks required signing or transaction features.
- Replace generated Sails clients with Anchor IDL clients.
- Replace static `TournamentKey` with dynamic tournament objects from registry/indexer.
- Add tournament detail pages for official/private tournaments.
- Add create tournament flow.
- Add private tournament admin/config UI for creators.
- Add invite/allowlist/private access UI.
- Add USDC token account detection and associated token account creation UX.
- Add SPL token transfer UX for prediction payments.
- Update prediction, claims, refunds, leaderboard, and tournament admin pages to read Solana accounts/indexed API.
- Defer DAO/governance views unless governance is reintroduced.

Backend/indexer:

- Build a Solana event/account indexer for tournaments, matches, predictions, points, claims, and private tournament discovery.
- Keep a REST API for leaderboard and UI-friendly aggregates.
- Add oracle-worker service for result ingestion.
- Add provider health checks, provider disagreement logs, and manual review/admin endpoints.
- Add admin setup scripts for Champions League fixture registration.

## Effort Estimate

Assuming one senior Solana engineer, one full-stack/frontend engineer, and one backend/oracle engineer:

- Protocol spec and account design: 4-6 days.
- Anchor core program MVP: 12-18 days.
- BolaoCore factory/registry: 7-10 days.
- Oracle/result flow with redundancy and guards: 8-12 days.
- Private tournament creator/admin UI: 10-15 days.
- Indexer/API: 7-12 days.
- Frontend Solana wallet and prediction flows: 10-15 days.
- Broad wallet support and USDC account UX: 4-7 days.
- Optional DAO/governance adapter: 5-10 days with SPL Governance; 12-20 days custom.
- Testing, security review, devnet rehearsals: 10-15 days.
- Mainnet launch runbook and monitoring: 3-5 days.

Calendar estimate:

- MVP official Champions League only, no private tournaments: 4-6 weeks with focused team.
- MVP official plus factory plus private tournaments plus creator admin UI: 6-8 weeks with parallel work.
- Full custom DAO plus polished private tournament marketplace: 8-12 weeks.

Given the 2026-09-08 target, the realistic plan is:

- Launch-ready official Champions League Solana protocol plus factory plus private tournament admin UI: achievable but tight.
- Full polished private marketplace plus custom DAO: not realistic without larger team and aggressive scope control.

## Proposed Delivery Plan

### Phase 0: Decisions, 2 days

- Confirm payment token: USDC recommended.
- Confirm whether Solana private tournaments can configure the final-prize share around the canonical 85/10/5 default.
- Confirm whether private tournament creators get a fee.
- Confirm launch authority model: multisig/operator authority now; DAO later.
- Confirm private tournament config bounds and creator admin permissions.
- Confirm data providers and manual review policy.
- Confirm target wallet support matrix and mobile requirements.
- Confirm whether World Cup/Vara history must be imported, displayed, or ignored for Solana launch.

### Phase 1: Solana Protocol MVP + Factory, 2-3 weeks

- Anchor workspace.
- `ProtocolConfig`, `Tournament`, `Phase`, `Match`, `Prediction`, `UserTournament`, vaults.
- Create tournament through factory.
- Registry/discovery for official and private tournaments.
- Register phase/match.
- Place prediction.
- Result finalization.
- Claim match rewards.
- Final leaderboard/final prize.
- Pause/cancel/refund.

### Phase 2: Private Tournaments + Creator Admin UI, 2 weeks

- Creator-controlled tournaments with bounded config.
- Public/private/allowlist modes.
- Invite links backed by allowlist or signed invite claims.
- Dynamic tournament registry reads.
- Creator dashboard.
- Fixture management UI.
- Tournament pause/cancel/refund controls.
- Participant, pool, fee, and claim monitoring.

### Phase 3: Oracle And Fixture Automation, 1-2 weeks

- Port fixture sync to Solana.
- Explicit tournament IDs.
- Dry-run and idempotency.
- Result worker and finalization runner.
- Primary/secondary provider configuration.
- Provider conflict detection.
- Manual review and override path.
- Admin runbook for Champions League matchdays.

### Phase 4: Frontend And Indexer, 2-3 weeks in parallel

- Solana wallet.
- Wallet Standard discovery and broad wallet QA.
- USDC token account creation/detection.
- Dynamic tournament selector.
- Official tournament pages.
- Private tournament creation and invitation UI.
- Prediction, claims, leaderboard, and creator admin views.
- Indexer-backed aggregates.

### Phase 5: Testnet, Security, Launch, 2 weeks

- Anchor tests for all economic paths.
- Fuzz/property tests for bps and payout rounding.
- Devnet rehearsal with simulated Champions League fixtures.
- External review of custody, vault, and claim logic.
- Mainnet deployment, monitoring, incident runbook.

## Key Risks

- Deadline risk: 61 days is tight for factory, private tournaments, admin UI, and resilient oracle.
- Economic configuration risk: private tournaments need bounded configuration around the canonical 85/10/5 default.
- Solana account design risk: large vectors from Vara must be split into many PDAs.
- Payout scaling risk: final prize and leaderboard cannot require passing thousands of accounts in one transaction.
- Oracle trust risk: provider redundancy and manual review must be implemented carefully, not bolted on at the end.
- Wallet support risk: broad wallet compatibility requires early testing across desktop extension, mobile, and hardware-backed flows.
- USDC custody risk: token vault authority, associated token account creation, and token-program validation must be heavily tested.
- Identity migration risk: Vara addresses do not map automatically to Solana wallets.
- Security risk: token vault authority, PDA seeds, signer checks, and payout math need careful review.
- Product risk: private tournaments require moderation, spam controls, and invite UX beyond smart contracts.

## Recommendation For Dev Discussion

Use this as the opening proposal:

1. Build a new Solana-native SmartCup protocol in Anchor.
2. Launch Champions League 2026/27 as a fresh official tournament on Solana.
3. Make the BolaoCore-style factory/registry a first-class MVP requirement.
4. Implement private tournaments in the same protocol model, with bounded creator config.
5. Build the creator admin/config UI as part of MVP, not after launch.
6. Use USDC, fixed 5% SmartCup fee, and configurable final-prize split.
7. Implement oracle/data provider redundancy, result guards, and manual review tooling before mainnet.
8. Use Wallet Standard discovery-first wallet UX and test as many Solana wallets as practical.
9. Defer DAO parity; use multisig/operator authority for launch and add DAO later.
10. Defer live Vara state transfer unless there are unresolved post-World-Cup balances.
11. Treat the current frontend multi-tournament modal as a UI starting point, not a complete data model.

## Sources

- Official repo: https://github.com/smartcupleague/smartcupleague
- Solana accounts documentation: https://solana.com/docs/core/accounts
- Solana PDA documentation: https://solana.com/docs/core/pda
- Anchor program structure documentation: https://www.anchor-lang.com/docs/basics/program-structure
- Local code: `smart-programs/BolaoCore-Program/app/src/services/constants.rs`
- Local code: `smart-programs/BolaoCore-Program/app/src/services/service.rs`
- Local code: `smart-programs/BolaoCore-Program/app/src/services/state.rs`
- Local code: `smart-programs/DAO-SmartCupLeague-Program/app/src/services/types.rs`
- Local code: `frontend/src/utils/tournaments.ts`
