#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { GearApi } from "@gear-js/api";
import { Sails } from "sails-js";
import { SailsIdlParser } from "sails-js-parser";

const INDEXER_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = resolve(INDEXER_ROOT, "..");
const PROGRAM_ID =
  "0x3fec9d4b68f95917e572e03f8615b2512b8a5051d462dcacb8e4fdc97e8b4894";
const RPC_URL =
  process.env.WORLD_CUP_AUDIT_RPC_URL ?? "wss://archive-rpc.vara.network";
const DEPLOYED_IDL_PATH = resolve(
  REPO_ROOT,
  "scripts/assets/world-cup-2026-deployed-state.idl",
);
const EVENT_AUDIT_PATH = resolve(
  REPO_ROOT,
  "docs/audits/world-cup-2026-vara-events.json",
);
const SNAPSHOT_PATH = resolve(
  REPO_ROOT,
  "frontend/src/data/world-cup-2026-results.snapshot.json",
);
const AUDIT_REPORT_PATH = resolve(
  REPO_ROOT,
  "docs/audits/world-cup-2026-results-audit.md",
);
const FINAL_PRIZE_POOL_PLANCK = 355_712_059_046_285_553n;
const FINAL_PRIZE_ALLOCATIONS = new Map([
  [
    "0x3251889ab4310bd5455556f825cacc372fef6592b48c11c7b73745ccd1d0800b",
    160_070_426_570_828_500n,
  ],
  [
    "0x12e8c864702d5222d6dc55555584be1d1aec2bdbda528559d7ff616fb4fc226f",
    88_928_014_761_571_389n,
  ],
  [
    "0x3aebcf27a685b45aebbfc2e37356a64998ebc73d5fc76b00b91c8f436791375a",
    53_356_808_856_942_833n,
  ],
  [
    "0xb86859c7c896f62392d46cae64716b9e560dc418e9efc436f633f0ec6bb0467d",
    35_571_205_904_628_555n,
  ],
  [
    "0x063c82480466e721d9ed2a7968f3c1f2095be77353837ddfc586df3b502d7b5b",
    8_892_801_476_157_138n,
  ],
  [
    "0x30523bd7e55fb5047c89eed602876d7b20a4a37241435eb192f12b0736126670",
    8_892_801_476_157_138n,
  ],
]);
const EXPECTED_MATCH_COUNT = 104;
const EXPECTED_MATCH_PREDICTION_COUNT = 769;
const EXPECTED_SMART_PREDICTOR_BETS = 103;
const SMART_PREDICTOR =
  "0x3251889ab4310bd5455556f825cacc372fef6592b48c11c7b73745ccd1d0800b";
const EXPECTED_SMART_PREDICTOR_FINAL_PRIZE = 160_070_426_570_828_500n;

function normalizeWallet(value) {
  return String(value).toLowerCase();
}

function asBigInt(value) {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(value);
  if (typeof value === "string" && value.length > 0) return BigInt(value);
  throw new Error(`Cannot convert ${String(value)} to bigint`);
}

function valueAt(object, snakeCase, camelCase) {
  return object?.[snakeCase] ?? object?.[camelCase];
}

function scoreOutcome(score) {
  if (score.home > score.away) return 1;
  if (score.home < score.away) return -1;
  return 0;
}

function normalizePenalty(value) {
  if (value == null) return null;
  return String(value).toLowerCase();
}

function advanceOutcome(score, penaltyWinner) {
  const outcome = scoreOutcome(score);
  if (outcome !== 0) return outcome;
  const normalized = normalizePenalty(penaltyWinner);
  if (normalized === "home") return 1;
  if (normalized === "away") return -1;
  throw new Error("Penalty winner required for a knockout draw");
}

function isEligibleForPayout(
  betScore,
  betPenaltyWinner,
  finalScore,
  finalPenaltyWinner,
  phaseWeight,
) {
  const knockout = phaseWeight > 1;
  const drawFinal = finalScore.home === finalScore.away;
  const exact =
    betScore.home === finalScore.home && betScore.away === finalScore.away;

  if (exact) {
    if (knockout && drawFinal) {
      return (
        betPenaltyWinner != null &&
        normalizePenalty(betPenaltyWinner) ===
          normalizePenalty(finalPenaltyWinner)
      );
    }
    return true;
  }

  if (!knockout) {
    return scoreOutcome(betScore) === scoreOutcome(finalScore);
  }

  if (betScore.home === betScore.away && betPenaltyWinner == null) {
    return false;
  }

  return (
    advanceOutcome(betScore, betPenaltyWinner) ===
    advanceOutcome(finalScore, finalPenaltyWinner)
  );
}

function finalizedResult(match) {
  const result = match.result;
  const finalized = result?.finalized ?? result?.Finalized;
  return finalized ?? null;
}

function cancelledResult(match) {
  const result = match.result;
  return (
    result === "cancelled" ||
    result === "Cancelled" ||
    (result != null &&
      typeof result === "object" &&
      ("cancelled" in result || "Cancelled" in result))
  );
}

async function withRetry(operation, label, attempts = 5) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      const delayMs = Math.min(750 * 2 ** (attempt - 1), 8_000);
      process.stderr.write(
        `[snapshot] ${label} failed (${attempt}/${attempts}); retrying in ${delayMs}ms\n`,
      );
      await new Promise((resolvePromise) =>
        setTimeout(resolvePromise, delayMs),
      );
    }
  }
  throw lastError;
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, items.length) },
      () => worker(),
    ),
  );
  return results;
}

function formatVara(planck) {
  const value = asBigInt(planck);
  const whole = value / 1_000_000_000_000n;
  const fraction = (value % 1_000_000_000_000n)
    .toString()
    .padStart(12, "0")
    .replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

async function main() {
  const [idl, eventAuditText] = await Promise.all([
    readFile(DEPLOYED_IDL_PATH, "utf8"),
    readFile(EVENT_AUDIT_PATH, "utf8"),
  ]);
  const eventAudit = JSON.parse(eventAuditText);
  const parser = await SailsIdlParser.new();
  const api = await GearApi.create({ providerAddress: RPC_URL });

  try {
    const finalizedHead = await api.rpc.chain.getFinalizedHead();
    const finalizedHeader = await api.rpc.chain.getHeader(finalizedHead);
    const asOfBlock = finalizedHeader.number.toNumber();
    const asOfBlockHash = finalizedHead.toHex();

    const sails = new Sails(parser)
      .parseIdl(idl)
      .setApi(api)
      .setProgramId(PROGRAM_ID);
    const queries = sails.services.Service.queries;

    process.stderr.write("[snapshot] reading finalized tournament state\n");
    const state = await withRetry(
      () => queries.QueryState().atBlock(asOfBlockHash).call(),
      "QueryState",
    );
    const matches = state.matches;
    if (matches.length !== EXPECTED_MATCH_COUNT) {
      throw new Error(
        `Expected ${EXPECTED_MATCH_COUNT} matches, found ${matches.length}`,
      );
    }
    if (!state.final_prize_finalized || !state.podium_finalized) {
      throw new Error("World Cup tournament is not fully finalized");
    }
    if (matches.some((match) => !match.dust_swept)) {
      throw new Error("At least one World Cup match has not been swept");
    }

    const uniqueWallets = [
      ...new Set(
        matches
          .flatMap((match) => match.participants)
          .map(normalizeWallet),
      ),
    ].sort();
    const pointsByWallet = new Map(
      state.user_points.map(([wallet, points]) => [
        normalizeWallet(wallet),
        Number(points),
      ]),
    );

    process.stderr.write(
      `[snapshot] reading bets for ${uniqueWallets.length} wallets\n`,
    );
    let completedWallets = 0;
    const walletRows = await mapWithConcurrency(
      uniqueWallets,
      6,
      async (wallet) => {
        const bets = await withRetry(
          () => queries.QueryBetsByUser(wallet).atBlock(asOfBlockHash).call(),
          `QueryBetsByUser(${wallet})`,
        );
        completedWallets += 1;
        if (
          completedWallets % 20 === 0 ||
          completedWallets === uniqueWallets.length
        ) {
          process.stderr.write(
            `[snapshot] read ${completedWallets}/${uniqueWallets.length} wallets\n`,
          );
        }
        return {
          wallet,
          points: pointsByWallet.get(wallet) ?? 0,
          bets,
        };
      },
    );

    const totalBetRecords = walletRows.reduce(
      (total, row) => total + row.bets.length,
      0,
    );
    if (totalBetRecords !== EXPECTED_MATCH_PREDICTION_COUNT) {
      throw new Error(
        `Expected ${EXPECTED_MATCH_PREDICTION_COUNT} bet records, found ${totalBetRecords}`,
      );
    }
    const smartPredictorRow = walletRows.find(
      (row) => row.wallet === SMART_PREDICTOR,
    );
    if (smartPredictorRow?.bets.length !== EXPECTED_SMART_PREDICTOR_BETS) {
      throw new Error(
        `Expected SmartPredictor_01 to have ${EXPECTED_SMART_PREDICTOR_BETS} bets, found ${smartPredictorRow?.bets.length ?? 0}`,
      );
    }

    const betsByMatch = new Map();
    for (const row of walletRows) {
      for (const bet of row.bets) {
        const matchId = Number(bet.match_id);
        const records = betsByMatch.get(matchId) ?? [];
        records.push({ wallet: row.wallet, bet });
        betsByMatch.set(matchId, records);
      }
    }

    const earningsByWallet = new Map(
      uniqueWallets.map((wallet) => [
        wallet,
        {
          matchRewardWalletPayoutPlanck: 0n,
          freebetPrincipalReturnPlanck: 0n,
          totalStakedPlanck: 0n,
          settledStakedPlanck: 0n,
        },
      ]),
    );
    let reconstructedTotalClaimed = 0n;

    for (const match of matches) {
      const matchId = Number(match.match_id);
      const records = betsByMatch.get(matchId) ?? [];
      const participants = new Set(
        match.participants.map(normalizeWallet),
      );
      if (
        records.length !== participants.size ||
        records.some((record) => !participants.has(record.wallet))
      ) {
        throw new Error(
          `Match ${matchId} participants and user bet records do not reconcile`,
        );
      }

      for (const { wallet, bet } of records) {
        earningsByWallet.get(wallet).totalStakedPlanck += asBigInt(
          bet.stake_in_match_pool,
        );
      }

      if (cancelledResult(match)) continue;
      for (const { wallet, bet } of records) {
        earningsByWallet.get(wallet).settledStakedPlanck += asBigInt(
          bet.stake_in_match_pool,
        );
      }
      const finalResult = finalizedResult(match);
      if (!finalResult) {
        throw new Error(`Match ${matchId} has no terminal result`);
      }

      const originalPool = records.reduce(
        (total, { bet }) => total + asBigInt(bet.stake_in_match_pool),
        0n,
      );
      const winnerStake = asBigInt(match.total_winner_stake);
      const phaseWeight =
        Number(
          state.phases.find((phase) => phase.name === match.phase)
            ?.points_weight,
        ) || 1;
      let reconstructedMatchClaimed = 0n;

      for (const { wallet, bet } of records) {
        if (
          !bet.claimed ||
          !isEligibleForPayout(
            bet.score,
            bet.penalty_winner,
            finalResult.score,
            finalResult.penalty_winner,
            phaseWeight,
          )
        ) {
          continue;
        }
        if (winnerStake === 0n) {
          throw new Error(`Match ${matchId} has a claimed bet and zero winner stake`);
        }

        const share =
          (asBigInt(bet.stake_in_match_pool) * originalPool) / winnerStake;
        const freebetPrincipal = asBigInt(bet.freebet_principal);
        const principalReturn =
          freebetPrincipal < share ? freebetPrincipal : share;
        const walletPayout = share - principalReturn;
        const earnings = earningsByWallet.get(wallet);
        earnings.matchRewardWalletPayoutPlanck += walletPayout;
        earnings.freebetPrincipalReturnPlanck += principalReturn;
        reconstructedMatchClaimed += share;
      }

      const stateMatchClaimed = asBigInt(match.total_claimed);
      if (reconstructedMatchClaimed !== stateMatchClaimed) {
        throw new Error(
          `Match ${matchId} claimed total mismatch: reconstructed ${reconstructedMatchClaimed}, state ${stateMatchClaimed}`,
        );
      }
      reconstructedTotalClaimed += reconstructedMatchClaimed;
    }

    const stateTotalClaimed = matches.reduce(
      (total, match) => total + asBigInt(match.total_claimed),
      0n,
    );
    if (reconstructedTotalClaimed !== stateTotalClaimed) {
      throw new Error(
        `Tournament claimed total mismatch: reconstructed ${reconstructedTotalClaimed}, state ${stateTotalClaimed}`,
      );
    }

    const leaderboard = walletRows
      .filter((row) =>
        row.bets.some(
          (bet) => asBigInt(bet.stake_in_match_pool) > 0n,
        ),
      )
      .sort(
        (left, right) =>
          right.points - left.points ||
          left.wallet.localeCompare(right.wallet),
      );
    const topFinalPrizeWallets = new Set(
      leaderboard
        .filter(
          (row) =>
            row.points >= leaderboard[4].points,
        )
        .map((row) => row.wallet),
    );
    if (
      topFinalPrizeWallets.size !== FINAL_PRIZE_ALLOCATIONS.size ||
      [...FINAL_PRIZE_ALLOCATIONS.keys()].some(
        (wallet) => !topFinalPrizeWallets.has(wallet),
      )
    ) {
      throw new Error(
        "Exact final-prize allocation wallets do not match the finalized leaderboard",
      );
    }
    const finalPrizeAllocations = FINAL_PRIZE_ALLOCATIONS;
    const allocatedFinalPrizeTotal = [...finalPrizeAllocations.values()].reduce(
      (total, amount) => total + amount,
      0n,
    );
    if (allocatedFinalPrizeTotal !== FINAL_PRIZE_POOL_PLANCK) {
      throw new Error(
        `Final allocations ${allocatedFinalPrizeTotal} do not equal pool ${FINAL_PRIZE_POOL_PLANCK}`,
      );
    }
    if (
      finalPrizeAllocations.get(SMART_PREDICTOR) !==
      EXPECTED_SMART_PREDICTOR_FINAL_PRIZE
    ) {
      throw new Error("SmartPredictor_01 final-prize allocation mismatch");
    }

    process.stderr.write(
      `[snapshot] reading ${finalPrizeAllocations.size} final-prize statuses\n`,
    );
    const finalPrizeStatuses = new Map(
      await mapWithConcurrency(
        [...finalPrizeAllocations.keys()],
        3,
        async (wallet) => [
          wallet,
          await withRetry(
            () =>
              queries
                .QueryFinalPrizeClaimStatus(wallet)
                .atBlock(asOfBlockHash)
                .call(),
            `QueryFinalPrizeClaimStatus(${wallet})`,
          ),
        ],
      ),
    );

    const podiumSubmissions = new Map(
      eventAudit.decodedEvents
        .filter((event) => event.event === "PodiumPickSubmitted")
        .map((event) => [
          normalizeWallet(event.payload[0]),
          {
            champion: event.payload[1],
            runnerUp: event.payload[2],
            thirdPlace: event.payload[3],
            blockNumber: event.blockNumber,
          },
        ]),
    );
    if (podiumSubmissions.size !== 3) {
      throw new Error(
        `Expected 3 championship-pick submissions, found ${podiumSubmissions.size}`,
      );
    }

    const wallets = Object.fromEntries(
      walletRows
        .sort((left, right) => left.wallet.localeCompare(right.wallet))
        .map((row) => {
          const earnings = earningsByWallet.get(row.wallet);
          const finalPrizeAllocation =
            finalPrizeAllocations.get(row.wallet) ?? 0n;
          const finalStatus = finalPrizeStatuses.get(row.wallet);
          const podiumSubmission = podiumSubmissions.get(row.wallet) ?? null;
          return [
            row.wallet,
            {
              points: row.points,
              matchPredictionCount: row.bets.length,
              championshipPickPredictionCount: podiumSubmission ? 3 : 0,
              championshipPick: podiumSubmission,
              totalStakedPlanck: earnings.totalStakedPlanck.toString(),
              settledStakedPlanck:
                earnings.settledStakedPlanck.toString(),
              matchRewardWalletPayoutPlanck:
                earnings.matchRewardWalletPayoutPlanck.toString(),
              freebetPrincipalReturnPlanck:
                earnings.freebetPrincipalReturnPlanck.toString(),
              finalPrizeAllocationPlanck:
                finalPrizeAllocation.toString(),
              finalPrizeClaimed: Boolean(finalStatus?.already_claimed),
              finalPrizeAmountClaimablePlanck: asBigInt(
                finalStatus?.amount_claimable ?? 0,
              ).toString(),
              totalEarnedPlanck: (
                earnings.matchRewardWalletPayoutPlanck +
                finalPrizeAllocation
              ).toString(),
            },
          ];
        }),
    );

    const totalWalletPayout = [...earningsByWallet.values()].reduce(
      (total, earnings) =>
        total + earnings.matchRewardWalletPayoutPlanck,
      0n,
    );
    const totalFreebetPrincipal = [...earningsByWallet.values()].reduce(
      (total, earnings) =>
        total + earnings.freebetPrincipalReturnPlanck,
      0n,
    );
    const snapshot = {
      schemaVersion: 1,
      tournament: {
        id: "world-cup-2026",
        name: "World Cup 2026",
        status: "closed",
        programId: PROGRAM_ID,
      },
      provenance: {
        generatedAt: new Date().toISOString(),
        network: "vara-mainnet",
        rpcUrl: RPC_URL,
        asOfBlock,
        asOfBlockHash,
        deployedIdl:
          "scripts/assets/world-cup-2026-deployed-state.idl",
        eventAudit:
          "docs/audits/world-cup-2026-vara-events.json",
        eventAuditEvidenceSha256:
          eventAudit.source.evidenceSha256,
        calculation:
          "finalized on-chain match state + QueryBetsByUser + deployed eligible_for_payout/share formula",
      },
      reconciliation: {
        matchCount: matches.length,
        walletCount: uniqueWallets.length,
        matchPredictionCount: totalBetRecords,
        championshipPickPredictionCount: 3,
        consolidatedPredictionCount: totalBetRecords + 3,
        reconstructedTotalClaimedPlanck:
          reconstructedTotalClaimed.toString(),
        stateTotalClaimedPlanck: stateTotalClaimed.toString(),
        matchRewardWalletPayoutTotalPlanck:
          totalWalletPayout.toString(),
        freebetPrincipalReturnTotalPlanck:
          totalFreebetPrincipal.toString(),
        finalPrizePoolPlanck: FINAL_PRIZE_POOL_PLANCK.toString(),
        finalPrizeAllocationTotalPlanck:
          allocatedFinalPrizeTotal.toString(),
        allMatchesReconciled: true,
      },
      wallets,
    };
    const serializedSnapshot = `${JSON.stringify(snapshot, null, 2)}\n`;
    const snapshotSha256 = createHash("sha256")
      .update(serializedSnapshot)
      .digest("hex");

    const finalWinnerRows = [...finalPrizeAllocations.entries()]
      .sort((left, right) => {
        const amountOrder = right[1] > left[1] ? 1 : right[1] < left[1] ? -1 : 0;
        return amountOrder || left[0].localeCompare(right[0]);
      })
      .map(([wallet, amount]) => {
        const status = finalPrizeStatuses.get(wallet);
        return `| \`${wallet}\` | ${formatVara(amount)} | ${
          status?.already_claimed ? "Claimed" : "Unclaimed"
        } |`;
      })
      .join("\n");
    const report = `# World Cup 2026 Results Audit

Generated from finalized Vara mainnet state at block
\`${asOfBlock}\` (\`${asOfBlockHash}\`).

## Reconciliation

- Program: \`${PROGRAM_ID}\`
- Matches: ${matches.length}
- Wallets: ${uniqueWallets.length}
- Match predictions: ${totalBetRecords}
- Championship-pick predictions added to the tournament display: 3
- Consolidated tournament prediction count: ${totalBetRecords + 3}
- On-chain match total claimed: ${formatVara(stateTotalClaimed)} VARA
- Reconstructed match total claimed: ${formatVara(reconstructedTotalClaimed)} VARA
- Wallet match-prize payouts: ${formatVara(totalWalletPayout)} VARA
- Freebet principal returned: ${formatVara(totalFreebetPrincipal)} VARA
- Final prize pool: ${formatVara(FINAL_PRIZE_POOL_PLANCK)} VARA
- Snapshot SHA-256: \`${snapshotSha256}\`

Every match's reconstructed claimed total equals its finalized on-chain
\`total_claimed\` value. Wallet earnings exclude freebet-principal returns.

## Final Prize Winners

| Wallet | Final prize (VARA) | Status at audited block |
| --- | ---: | --- |
${finalWinnerRows}

## Formula

\`Total Earned = claimed match-prize wallet payouts + final-prize allocation\`

Freebet-principal returns are recorded separately and excluded from Total Earned.
`;

    await Promise.all([
      mkdir(dirname(SNAPSHOT_PATH), { recursive: true }),
      mkdir(dirname(AUDIT_REPORT_PATH), { recursive: true }),
    ]);
    await Promise.all([
      writeFile(SNAPSHOT_PATH, serializedSnapshot),
      writeFile(AUDIT_REPORT_PATH, report),
    ]);
    process.stdout.write(
      `${JSON.stringify(
        {
          snapshotPath: SNAPSHOT_PATH,
          auditReportPath: AUDIT_REPORT_PATH,
          snapshotSha256,
          asOfBlock,
          matchCount: matches.length,
          walletCount: uniqueWallets.length,
          matchPredictionCount: totalBetRecords,
          reconstructedTotalClaimedPlanck:
            reconstructedTotalClaimed.toString(),
          stateTotalClaimedPlanck: stateTotalClaimed.toString(),
          allMatchesReconciled: true,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    await api.disconnect();
  }
}

main().catch((error) => {
  process.stderr.write(
    `${JSON.stringify(
      {
        code: "WORLD_CUP_SNAPSHOT_FAILED",
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    )}\n`,
  );
  process.exitCode = 1;
});
