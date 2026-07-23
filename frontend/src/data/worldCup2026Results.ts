import rawSnapshot from './world-cup-2026-results.snapshot.json';

export type WorldCupWalletResult = {
  points: number;
  matchPredictionCount: number;
  championshipPickPredictionCount: number;
  championshipPick: {
    champion: string;
    runnerUp: string;
    thirdPlace: string;
    blockNumber: number;
  } | null;
  totalStakedPlanck: string;
  settledStakedPlanck: string;
  matchRewardWalletPayoutPlanck: string;
  freebetPrincipalReturnPlanck: string;
  finalPrizeAllocationPlanck: string;
  finalPrizeClaimed: boolean;
  finalPrizeAmountClaimablePlanck: string;
  totalEarnedPlanck: string;
};

export type WorldCup2026ResultsSnapshot = {
  schemaVersion: 1;
  tournament: {
    id: 'world-cup-2026';
    name: string;
    status: 'closed';
    programId: string;
  };
  provenance: {
    generatedAt: string;
    network: 'vara-mainnet';
    asOfBlock: number;
    asOfBlockHash: string;
    calculation: string;
  };
  reconciliation: {
    matchCount: number;
    walletCount: number;
    matchPredictionCount: number;
    championshipPickPredictionCount: number;
    consolidatedPredictionCount: number;
    reconstructedTotalClaimedPlanck: string;
    stateTotalClaimedPlanck: string;
    matchRewardWalletPayoutTotalPlanck: string;
    freebetPrincipalReturnTotalPlanck: string;
    finalPrizePoolPlanck: string;
    finalPrizeAllocationTotalPlanck: string;
    allMatchesReconciled: boolean;
  };
  wallets: Record<string, WorldCupWalletResult>;
};

const PLANCK_RE = /^\d+$/;
const PROGRAM_ID_RE = /^0x[0-9a-f]{64}$/;

function assertPlanck(value: unknown, path: string): asserts value is string {
  if (typeof value !== 'string' || !PLANCK_RE.test(value)) {
    throw new Error(`Invalid World Cup results snapshot amount at ${path}`);
  }
}

function validateSnapshot(value: unknown): WorldCup2026ResultsSnapshot {
  const snapshot = value as WorldCup2026ResultsSnapshot;
  if (
    snapshot?.schemaVersion !== 1 ||
    snapshot.tournament?.id !== 'world-cup-2026' ||
    snapshot.tournament?.status !== 'closed' ||
    !PROGRAM_ID_RE.test(snapshot.tournament?.programId ?? '') ||
    snapshot.reconciliation?.matchCount !== 104 ||
    snapshot.reconciliation?.matchPredictionCount !== 769 ||
    snapshot.reconciliation?.consolidatedPredictionCount !== 772 ||
    snapshot.reconciliation?.allMatchesReconciled !== true
  ) {
    throw new Error('Invalid or unreconciled World Cup results snapshot');
  }

  assertPlanck(
    snapshot.reconciliation.finalPrizePoolPlanck,
    'reconciliation.finalPrizePoolPlanck',
  );
  assertPlanck(
    snapshot.reconciliation.finalPrizeAllocationTotalPlanck,
    'reconciliation.finalPrizeAllocationTotalPlanck',
  );
  if (
    snapshot.reconciliation.finalPrizePoolPlanck !==
    snapshot.reconciliation.finalPrizeAllocationTotalPlanck
  ) {
    throw new Error('World Cup final-prize allocations do not equal the archived pool');
  }

  for (const [wallet, result] of Object.entries(snapshot.wallets ?? {})) {
    if (!PROGRAM_ID_RE.test(wallet)) {
      throw new Error(`Invalid wallet in World Cup results snapshot: ${wallet}`);
    }
    for (const field of [
      'totalStakedPlanck',
      'settledStakedPlanck',
      'matchRewardWalletPayoutPlanck',
      'freebetPrincipalReturnPlanck',
      'finalPrizeAllocationPlanck',
      'finalPrizeAmountClaimablePlanck',
      'totalEarnedPlanck',
    ] as const) {
      assertPlanck(result[field], `wallets.${wallet}.${field}`);
    }
    if (
      BigInt(result.totalEarnedPlanck) !==
      BigInt(result.matchRewardWalletPayoutPlanck) +
        BigInt(result.finalPrizeAllocationPlanck)
    ) {
      throw new Error(`World Cup Total Earned mismatch for ${wallet}`);
    }
  }

  return snapshot;
}

export const WORLD_CUP_2026_RESULTS = validateSnapshot(rawSnapshot);

export function getWorldCup2026Results(
  programId: string | null | undefined,
): WorldCup2026ResultsSnapshot | null {
  return programId?.toLowerCase() ===
    WORLD_CUP_2026_RESULTS.tournament.programId.toLowerCase()
    ? WORLD_CUP_2026_RESULTS
    : null;
}

export function getWorldCup2026WalletResult(
  programId: string | null | undefined,
  wallet: string | null | undefined,
): WorldCupWalletResult | null {
  const snapshot = getWorldCup2026Results(programId);
  if (!snapshot || !wallet) return null;
  return snapshot.wallets[wallet.toLowerCase()] ?? null;
}
