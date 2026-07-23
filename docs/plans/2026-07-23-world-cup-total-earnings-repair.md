# World Cup 2026 Total Earnings Display Repair

## Objective

Preserve and display the correct historical participation and earnings data for
the closed World Cup 2026 tournament, even after match dust was swept, the final
prize pool was finalized, winners claimed, or live read services return empty
values.

This is a temporary, tournament-specific read model. Repairing and replaying the
general-purpose indexer is intentionally out of scope for this checklist.

## Authoritative Rules

- [x] Treat Vara contract events as the authoritative historical source.
- [x] Define **Total Earned** as:
  `claimed match-prize wallet payouts + final-prize amount won`.
- [x] Exclude freebet-principal returns from **Total Earned**.
- [x] Exclude stakes or credits returned to internal/freebet balances from
  **Total Earned**.
- [x] Preserve the original finalized prize-pool value after claims.
- [x] Display `Available to claim` separately from the historical `You won`
  amount.
- [x] Restrict the snapshot fallback to the World Cup contract program ID.

## 1. Audit the World Cup Contract History

- [x] Identify and record the contract deployment/start event block:
  `33706810`.
- [x] Record a finalized state block after the relevant prize claims:
  `34869504`.
- [x] Extract the available program-event archive from block `33000000`
  through block `34860000` for supporting evidence.
- [x] Collect every claimed match reward per wallet by reconstructing the
  finalized contract state with the deployed payout formula.
- [x] Separate wallet payouts from freebet-principal returns.
- [x] Collect the six finalized prize allocations.
- [x] Confirm the finalized prize allocations total exactly
  `355,712.059046285553 VARA`.
- [x] Confirm SmartPredictor_01 received a final-prize allocation of
  `160,070.426570828500 VARA`.
- [x] Confirm SmartPredictor_01 submitted `103` match predictions.
- [x] Confirm the tournament-wide display count is `772`: `769` match
  predictions plus `3` championship picks.
- [x] Reconcile event totals and document the SQD archive gaps. The event
  archive is supporting evidence; it is not used as the complete earnings
  source.
- [x] Record the last audited Vara block and extraction timestamp.
- [x] Produce a human-readable audit report with per-wallet totals.

### Audit acceptance checks

- [x] Every displayed match-reward amount is backed by finalized Vara state and
  the deployed contract's exact payout formula.
- [x] All six final-prize allocations reconcile exactly with the finalized pool.
- [x] SmartPredictor_01 has exactly `103` accepted match bets in the audit.
- [x] The audit uses finalized state at block `34869504`; the partial archive
  response is not accepted as the complete earnings source.

## 2. Create the Immutable Results Snapshot

- [x] Add `frontend/src/data/world-cup-2026-results.snapshot.json`.
- [x] Include tournament name and version.
- [x] Include the World Cup contract program ID.
- [x] Include generation time and the finalized audited block.
- [x] Include event-audit digest and reconciliation metadata.
- [x] Store all token amounts as Planck integer strings.
- [x] Store, per wallet:
  - [x] Claimed match-prize wallet payout.
  - [x] Freebet-principal return.
  - [x] Final-prize allocation.
  - [x] Final-prize claim status.
  - [x] Total earned.
  - [x] Match prediction count.
  - [x] Championship-pick count.
- [x] Store tournament-wide:
  - [x] Original finalized prize pool.
  - [x] Match-prediction count.
  - [x] Championship-pick count.
  - [x] Consolidated prediction count.
- [x] Add a typed loader and runtime validation for the snapshot.
- [x] Match wallet addresses case-insensitively.

## 3. Connect the Snapshot to the Frontend

- [x] Remove the incomplete hardcoded finalized-prize archive from
  `frontend/src/pages/home/Home.tsx`.
- [x] Use the snapshot as the authoritative historical source when the World Cup
  tournament is finalized.
- [x] Prevent empty API, Supabase, GraphQL, or post-claim contract values from
  replacing verified historical values with zero.
- [x] Continue using live contract data only for genuinely live state such as
  current claim availability.
- [x] Ensure the fallback never affects another tournament or program ID.

## 4. Correct the My Progress Widgets

- [x] **Total Earned** displays:
  `historical match-prize wallet payouts + final prize won`.
- [x] **Net Performance** uses the corrected **Total Earned**.
- [x] **Final Prize Pool** continues to display `355,712.06 VARA` after
  finalization and claims.
- [x] A winner who already claimed sees:
  - [x] `You won: [historical allocation]`.
  - [x] `Available to claim: 0.00 VARA` in the archived claim data.
  - [x] `Status: Claimed`.
- [x] A winner who has not claimed sees the correct available amount and status.
- [x] A non-winner displays zero won without an eligibility error.
- [x] SmartPredictor_01 continues to display `103/104` match predictions.
- [x] Tournament-wide predictions display `772`, including the three
  championship picks.
- [x] Championship-pick results remain visible after podium finalization.

## 5. Verification

- [x] Add a test for a final-prize winner who already claimed.
- [x] Add a test for a winner whose prize remains claimable.
- [x] Add a test for a wallet that won only match prizes.
- [x] Add a test for a non-winning wallet.
- [x] Test with the API unavailable.
- [x] Test with GraphQL unavailable.
- [x] Test snapshot re-resolution after wallet disconnect and reconnection.
- [x] Assert that historical claimed values never return to zero.
- [x] Assert that the six final allocations equal the finalized pool exactly.
- [x] Compare snapshot totals with the Vara audit report.
- [x] Run the frontend TypeScript build and production Vite build successfully.
- [x] Verify the UI-facing values for multiple known wallets: a claimed
  final-prize winner, an unclaimed final-prize winner, a match-only winner, and
  a non-winner.

## 6. Release

- [x] Review the final diff without modifying unrelated local work.
- [x] Commit the audit report, snapshot, loader, UI changes, and tests together.
- [x] Push the commit to the main repository.
- [x] Verify the deployed production page.
- [x] Record the deployment URL and verification date below.

## Evidence and Decisions

- World Cup BolaoCore program ID:
  `0x3fec9d4b68f95917e572e03f8615b2512b8a5051d462dcacb8e4fdc97e8b4894`
- Finalized pool:
  `355712059046285553` Planck (`355,712.059046285553 VARA`)
- SmartPredictor_01 wallet:
  `0x3251889ab4310bd5455556f825cacc372fef6592b48c11c7b73745ccd1d0800b`
- SmartPredictor_01 final-prize allocation:
  `160070426570828500` Planck (`160,070.426570828500 VARA`)
- Current partial match-reward archive results are **not accepted** as final
  because they do not reconcile with finalized on-chain `total_claimed` values.
- Finalized state reconstruction:
  `4481830653792311816` Planck in claimed match shares, reconciled exactly
  across all 104 matches.
- Wallet match-prize payouts:
  `3107988487298595685` Planck.
- Freebet principal returned:
  `1373842166493716131` Planck.
- SmartPredictor_01 match-prize wallet payout:
  `661328057670156793` Planck.
- SmartPredictor_01 corrected Total Earned:
  `821398484240985293` Planck (`821,398.484240985293 VARA`).
- Offline/reconnection verification command:
  `node frontend/scripts/verify-world-cup-results.mjs`.
- Verification fixtures:
  - Claimed winner:
    `0x3251889ab4310bd5455556f825cacc372fef6592b48c11c7b73745ccd1d0800b`.
  - Unclaimed winner:
    `0x063c82480466e721d9ed2a7968f3c1f2095be77353837ddfc586df3b502d7b5b`.
  - Match-only winner:
    `0x04851ed8f419706069ea9d9548110751d5f46178a84e40fa0506cb59629d106c`.
  - Non-winner:
    `0x00666df16c074894760b12df559af7db779f62f6bbea8ef7c2ecf80627edf448`.

## Deployment Record

- Implementation commit: `9eed60fee019057eedb6ae63c2c1b785d9b742f2`.
- Deployment URL: `https://www.smartcupleague.com/progress`.
- Production bundle: `assets/index-By3KpmSy.js`.
- Verified at: `2026-07-24` (Europe/Madrid).
- Production evidence: the deployed bundle contains the audited World Cup
  program ID, finalized pool amount `355712059046285553`, SmartPredictor_01
  Total Earned amount `821398484240985293`, and the `You won` UI label.
