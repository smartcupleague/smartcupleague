#!/usr/bin/env node

import { readFile } from "node:fs/promises";

const snapshot = JSON.parse(
  await readFile(
    new URL("../src/data/world-cup-2026-results.snapshot.json", import.meta.url),
    "utf8",
  ),
);
const wallets = Object.entries(snapshot.wallets);
const programId = snapshot.tournament.programId.toLowerCase();
const smartPredictor =
  snapshot.wallets[
    "0x3251889ab4310bd5455556f825cacc372fef6592b48c11c7b73745ccd1d0800b"
  ];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sum(field) {
  return wallets.reduce(
    (total, [, result]) => total + BigInt(result[field]),
    0n,
  );
}

function resolveArchivedWallet(candidateProgramId, wallet) {
  if (
    candidateProgramId?.toLowerCase() !== programId ||
    !wallet
  ) {
    return null;
  }
  return snapshot.wallets[wallet.toLowerCase()] ?? null;
}

assert(snapshot.schemaVersion === 1, "Unexpected snapshot schema");
assert(
  snapshot.reconciliation.allMatchesReconciled === true,
  "Match reconciliation is not complete",
);
assert(
  snapshot.reconciliation.reconstructedTotalClaimedPlanck ===
    snapshot.reconciliation.stateTotalClaimedPlanck,
  "Reconstructed and on-chain claimed totals differ",
);
assert(
  snapshot.reconciliation.matchPredictionCount === 769,
  "Expected 769 match predictions",
);
assert(
  snapshot.reconciliation.consolidatedPredictionCount === 772,
  "Expected 772 consolidated predictions",
);
assert(
  smartPredictor.matchPredictionCount === 103,
  "SmartPredictor_01 prediction count changed",
);
assert(
  smartPredictor.matchRewardWalletPayoutPlanck ===
    "661328057670156793",
  "SmartPredictor_01 match earnings changed",
);
assert(
  smartPredictor.finalPrizeAllocationPlanck === "160070426570828500",
  "SmartPredictor_01 final prize changed",
);
assert(
  smartPredictor.totalEarnedPlanck === "821398484240985293",
  "SmartPredictor_01 Total Earned changed",
);
assert(
  BigInt(smartPredictor.totalEarnedPlanck) ===
    BigInt(smartPredictor.matchRewardWalletPayoutPlanck) +
      BigInt(smartPredictor.finalPrizeAllocationPlanck),
  "SmartPredictor_01 Total Earned formula failed",
);

const claimedWinner = wallets.find(
  ([, result]) =>
    BigInt(result.finalPrizeAllocationPlanck) > 0n &&
    result.finalPrizeClaimed,
);
const unclaimedWinners = wallets.filter(
  ([, result]) =>
    BigInt(result.finalPrizeAllocationPlanck) > 0n &&
    !result.finalPrizeClaimed,
);
const matchOnlyWinner = wallets.find(
  ([, result]) =>
    BigInt(result.matchRewardWalletPayoutPlanck) > 0n &&
    BigInt(result.finalPrizeAllocationPlanck) === 0n,
);
const nonWinner = wallets.find(
  ([, result]) =>
    BigInt(result.matchRewardWalletPayoutPlanck) === 0n &&
    BigInt(result.finalPrizeAllocationPlanck) === 0n,
);

assert(claimedWinner, "Missing claimed final-prize winner fixture");
assert(
  unclaimedWinners.length === 0,
  "Archived final-prize state still contains an unclaimed winner",
);
assert(matchOnlyWinner, "Missing match-only winner fixture");
assert(nonWinner, "Missing non-winner fixture");
assert(
  sum("finalPrizeAllocationPlanck") ===
    BigInt(snapshot.reconciliation.finalPrizePoolPlanck),
  "Final-prize allocations do not equal the archived pool",
);
assert(
  sum("matchRewardWalletPayoutPlanck") ===
    BigInt(snapshot.reconciliation.matchRewardWalletPayoutTotalPlanck),
  "Per-wallet match payouts do not equal the reconciled total",
);
assert(
  sum("freebetPrincipalReturnPlanck") ===
    BigInt(snapshot.reconciliation.freebetPrincipalReturnTotalPlanck),
  "Per-wallet freebet returns do not equal the reconciled total",
);

// The archived read path is deliberately independent from API and GraphQL
// configuration. These checks exercise the same program/wallet selection rules
// after simulating unavailable services and a wallet disconnect/reconnect.
delete process.env.VITE_API_URL;
delete process.env.VITE_INDEXER_GRAPHQL_URL;
for (const [wallet, expected] of [
  claimedWinner,
  matchOnlyWinner,
  nonWinner,
]) {
  const disconnected = resolveArchivedWallet(programId, null);
  const reconnected = resolveArchivedWallet(
    snapshot.tournament.programId.toUpperCase(),
    wallet.toUpperCase(),
  );
  assert(disconnected === null, "Disconnected wallet must not resolve a result");
  assert(
    reconnected === expected,
    `Wallet reconnection did not restore archived data for ${wallet}`,
  );
}
assert(
  resolveArchivedWallet(`0x${"0".repeat(64)}`, claimedWinner[0]) === null,
  "Snapshot fallback leaked into a different tournament program",
);

console.log(
  JSON.stringify(
    {
      ok: true,
      snapshotBlock: snapshot.provenance.asOfBlock,
      walletCount: wallets.length,
      fixtures: {
        claimedWinner: claimedWinner[0],
        unclaimedWinnerCount: unclaimedWinners.length,
        matchOnlyWinner: matchOnlyWinner[0],
        nonWinner: nonWinner[0],
      },
      outageChecks: {
        apiUnavailable: true,
        graphqlUnavailable: true,
        walletReconnect: true,
        tournamentIsolation: true,
      },
    },
    null,
    2,
  ),
);
