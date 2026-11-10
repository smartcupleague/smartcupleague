import resultsSnapshot from './world-cup-2026-results.snapshot.json';
import offchainSnapshot from './world-cup-2026-offchain.snapshot.json';

type Score = { home: number; away: number };
type PenaltyWinner = 'Home' | 'Away' | null;

type ArchivedPrediction = {
  matchId: number;
  score: Score;
  penaltyWinner: PenaltyWinner;
  stakeInMatchPoolPlanck: string;
  claimed: boolean;
};

type ArchivedWallet = {
  points: number;
  matchPredictionCount: number;
  championshipPickPredictionCount: number;
  championshipPick: { champion: string; runnerUp: string; thirdPlace: string } | null;
  matchRewardWalletPayoutPlanck: string;
  finalPrizeAllocationPlanck: string;
  finalPrizeClaimed: boolean;
  finalPrizeAmountClaimablePlanck?: string;
  predictions: ArchivedPrediction[];
};

type ArchivedMatch = {
  matchId: number;
  phase: string;
  home: string;
  away: string;
  kickOff: string;
  status: string;
  finalScore: (Score & { penaltyWinner: PenaltyWinner }) | null;
  participantCount?: number;
  totalClaimedPlanck?: string;
  totalWinnerStakePlanck?: string;
};

type PoolStats = {
  match_id: string;
  home_bets: number;
  draw_bets: number;
  away_bets: number;
  home_planck: string;
  draw_planck: string;
  away_planck: string;
  total_bets: number;
  total_planck: string;
};

type LeaderboardRow = {
  wallet_address: string;
  display_name: string | null;
  matches_count: number;
  exact_count: number;
  outcome_count: number;
  total_claimed_planck: string;
  final_prize_claimed_planck: string;
  updated_at: string;
  total_points: number;
};

const results = resultsSnapshot as unknown as {
  provenance: { generatedAt: string };
  reconciliation: {
    matchCount: number;
    walletCount: number;
    matchPredictionCount: number;
    championshipPickPredictionCount: number;
    consolidatedPredictionCount: number;
    allMatchesReconciled: boolean;
    finalPrizePoolPlanck: string;
  };
  matches: ArchivedMatch[];
  wallets: Record<string, ArchivedWallet>;
};

const offchain = offchainSnapshot as unknown as {
  profiles: Record<string, string>;
};

function assertArchiveData() {
  const predictionCount = Object.values(results.wallets)
    .reduce((total, wallet) => total + wallet.predictions.length, 0);
  const championshipPickSubmissionCount = Object.values(results.wallets)
    .filter((wallet) => wallet.championshipPick != null).length;

  if (
    results.reconciliation.matchCount !== 104
    || results.reconciliation.walletCount !== 267
    || results.reconciliation.matchPredictionCount !== 769
    || results.reconciliation.championshipPickPredictionCount !== 3
    || results.reconciliation.consolidatedPredictionCount !== 772
    || results.reconciliation.allMatchesReconciled !== true
    || results.matches.length !== 104
    || predictionCount !== 769
    || championshipPickSubmissionCount !== 3
  ) {
    throw new Error('Static Render replacement data is incomplete or unreconciled');
  }
}

assertArchiveData();

export function isStaticRenderDataEnabled() {
  const explicitlyConfigured = import.meta.env.VITE_STATIC_RENDER_DATA as string | undefined;
  return explicitlyConfigured === 'true'
    || (import.meta.env.PROD && explicitlyConfigured !== 'false');
}

const matchById = new Map(results.matches.map((match) => [match.matchId, match]));

function predictionOutcome(score: Score, penaltyWinner: PenaltyWinner): 'home' | 'draw' | 'away' {
  if (score.home > score.away) return 'home';
  if (score.home < score.away) return 'away';
  if (penaltyWinner === 'Home') return 'home';
  if (penaltyWinner === 'Away') return 'away';
  return 'draw';
}

function isExactPrediction(prediction: ArchivedPrediction, match: ArchivedMatch): boolean {
  const finalScore = match.finalScore;
  if (!finalScore) return false;
  if (prediction.score.home !== finalScore.home || prediction.score.away !== finalScore.away) return false;
  const decidedOnPenalties = finalScore.home === finalScore.away && finalScore.penaltyWinner !== null;
  return !decidedOnPenalties || prediction.penaltyWinner === finalScore.penaltyWinner;
}

function accuracyFor(wallet: ArchivedWallet) {
  let exact = 0;
  let outcomes = 0;

  for (const prediction of wallet.predictions) {
    const match = matchById.get(prediction.matchId);
    if (!match?.finalScore) continue;
    if (isExactPrediction(prediction, match)) {
      exact += 1;
      continue;
    }
    if (
      predictionOutcome(prediction.score, prediction.penaltyWinner)
      === predictionOutcome(match.finalScore, match.finalScore.penaltyWinner)
    ) {
      outcomes += 1;
    }
  }

  return { exact, outcomes };
}

const leaderboardRows: LeaderboardRow[] = Object.entries(results.wallets)
  .filter(([, wallet]) => wallet.matchPredictionCount > 0 || wallet.championshipPickPredictionCount > 0)
  .map(([walletAddress, wallet]) => {
    const accuracy = accuracyFor(wallet);
    return {
      wallet_address: walletAddress.toLowerCase(),
      display_name: offchain.profiles[walletAddress.toLowerCase()] ?? null,
      matches_count: wallet.matchPredictionCount,
      exact_count: accuracy.exact,
      outcome_count: accuracy.outcomes,
      total_claimed_planck: wallet.matchRewardWalletPayoutPlanck,
      final_prize_claimed_planck: wallet.finalPrizeClaimed ? wallet.finalPrizeAllocationPlanck : '0',
      updated_at: results.provenance.generatedAt,
      total_points: wallet.points,
    };
  })
  .sort((left, right) => (
    right.total_points - left.total_points
    || left.wallet_address.localeCompare(right.wallet_address)
  ));

const emptyPool = (matchId: string): PoolStats => ({
  match_id: matchId,
  home_bets: 0,
  draw_bets: 0,
  away_bets: 0,
  home_planck: '0',
  draw_planck: '0',
  away_planck: '0',
  total_bets: 0,
  total_planck: '0',
});

const poolStatsByMatch = new Map<string, PoolStats>();

for (const wallet of Object.values(results.wallets)) {
  for (const prediction of wallet.predictions) {
    const matchId = String(prediction.matchId);
    const current = poolStatsByMatch.get(matchId) ?? emptyPool(matchId);
    const outcome = predictionOutcome(prediction.score, prediction.penaltyWinner);
    const amount = BigInt(prediction.stakeInMatchPoolPlanck || '0');

    current.total_bets += 1;
    current.total_planck = String(BigInt(current.total_planck) + amount);
    if (outcome === 'home') {
      current.home_bets += 1;
      current.home_planck = String(BigInt(current.home_planck) + amount);
    } else if (outcome === 'away') {
      current.away_bets += 1;
      current.away_planck = String(BigInt(current.away_planck) + amount);
    } else {
      current.draw_bets += 1;
      current.draw_planck = String(BigInt(current.draw_planck) + amount);
    }
    poolStatsByMatch.set(matchId, current);
  }
}

const poolStats = [...poolStatsByMatch.values()]
  .sort((left, right) => Number(left.match_id) - Number(right.match_id));

const participantsByMatch = new Map<number, string[]>();
for (const [walletAddress, wallet] of Object.entries(results.wallets)) {
  for (const prediction of wallet.predictions) {
    const participants = participantsByMatch.get(prediction.matchId) ?? [];
    participants.push(walletAddress.toLowerCase());
    participantsByMatch.set(prediction.matchId, participants);
  }
}

const staticMatches = results.matches.map((match) => {
  const pool = poolStatsByMatch.get(String(match.matchId)) ?? emptyPool(String(match.matchId));
  return {
    match_id: String(match.matchId),
    phase: match.phase,
    home: match.home,
    away: match.away,
    kick_off: match.kickOff,
    result: match.finalScore
      ? {
          Finalized: {
            score: { home: match.finalScore.home, away: match.finalScore.away },
            penalty_winner: match.finalScore.penaltyWinner,
          },
        }
      : 'Unresolved',
    match_prize_pool: pool.total_planck,
    total_pool: pool.total_planck,
    pool_home: pool.home_planck,
    pool_draw: pool.draw_planck,
    pool_away: pool.away_planck,
    has_bets: pool.total_bets > 0,
    participants: participantsByMatch.get(match.matchId) ?? [],
    total_winner_stake: match.totalWinnerStakePlanck ?? '0',
    total_claimed: match.totalClaimedPlanck ?? '0',
    settlement_prepared: match.status === 'finalized',
    dust_swept: false,
    finalized_at: null,
  };
});

const finalMatch = results.matches.find((match) => match.phase.trim().toLowerCase() === 'final');
const thirdPlaceMatch = results.matches.find((match) => match.phase.trim().toLowerCase().includes('third'));
const podiumResult = finalMatch?.finalScore
  ? {
      champion: finalMatch.finalScore.home > finalMatch.finalScore.away ? finalMatch.home : finalMatch.away,
      runner_up: finalMatch.finalScore.home > finalMatch.finalScore.away ? finalMatch.away : finalMatch.home,
      third_place: thirdPlaceMatch?.finalScore
        ? (thirdPlaceMatch.finalScore.home > thirdPlaceMatch.finalScore.away ? thirdPlaceMatch.home : thirdPlaceMatch.away)
        : '',
    }
  : null;

const staticCoreState = {
  admins: [],
  operators: [],
  treasury: '0x0000000000000000000000000000000000000000000000000000000000000000',
  protocol_fee_accumulated: '0',
  final_prize_accumulated: results.reconciliation.finalPrizePoolPlanck,
  final_prize_accum: results.reconciliation.finalPrizePoolPlanck,
  matches: staticMatches,
  phases: [],
  user_points: Object.entries(results.wallets).map(
    ([wallet, value]) => [wallet.toLowerCase(), value.points] as [string, number],
  ),
  podium_finalized: podiumResult !== null,
  podium_result: podiumResult,
  r32_lock_time: null,
  final_prize_finalized: true,
  final_prize_claimable_total: results.reconciliation.finalPrizePoolPlanck,
  final_prize_rounding_dust: '0',
  vara_price_usd_micro: '0',
  price_cached_at: '0',
  price_staleness_limit_ms: '0',
  challenge_window_ms: '0',
  claim_deadline_ms: '0',
};

function normalizeWallet(wallet: string) {
  return wallet.trim().toLowerCase();
}

export function getStaticCoreState() {
  return staticCoreState;
}

export function getStaticMatch(matchId: string | number | bigint) {
  return staticMatches.find((match) => match.match_id === String(matchId)) ?? null;
}

export function getStaticMatchesByPhase(phase: string) {
  const normalized = phase.trim().toLowerCase();
  return staticMatches.filter((match) => match.phase.trim().toLowerCase() === normalized);
}

export function getStaticBetsByUser(walletAddress: string) {
  const wallet = results.wallets[normalizeWallet(walletAddress)];
  if (!wallet) return [];
  return wallet.predictions.map((prediction) => ({
    match_id: String(prediction.matchId),
    score: prediction.score,
    penalty_winner: prediction.penaltyWinner,
    stake_in_match_pool: prediction.stakeInMatchPoolPlanck,
    freebet_principal: '0',
    claimed: prediction.claimed,
  }));
}

export function getStaticUserPoints(walletAddress: string) {
  return results.wallets[normalizeWallet(walletAddress)]?.points ?? 0;
}

export function getStaticFinalPrizeClaimStatus(walletAddress: string) {
  const normalized = normalizeWallet(walletAddress);
  const wallet = results.wallets[normalized];
  return {
    wallet: normalized,
    final_prize_finalized: true,
    eligible: Boolean(wallet && BigInt(wallet.finalPrizeAllocationPlanck || '0') > 0n),
    amount_claimable: wallet?.finalPrizeAmountClaimablePlanck ?? wallet?.finalPrizeAllocationPlanck ?? '0',
    already_claimed: wallet?.finalPrizeClaimed ?? false,
    points: wallet?.points ?? 0,
  };
}

const indexerNodes = leaderboardRows.map((row) => ({
  id: row.wallet_address,
  totalPoints: row.total_points,
  exactCount: row.exact_count,
  outcomeCount: row.outcome_count,
  totalBets: row.matches_count,
  totalClaimedRaw: row.total_claimed_planck,
  finalPrizeClaimedRaw: row.final_prize_claimed_planck,
  updatedAt: row.updated_at,
}));

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' };

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function storedProfile(wallet: string): string | null {
  try {
    return window.localStorage.getItem(`smartcup:archived-profile:${wallet}`);
  } catch {
    return null;
  }
}

function saveStoredProfile(wallet: string, displayName: string) {
  try {
    window.localStorage.setItem(`smartcup:archived-profile:${wallet}`, displayName);
  } catch {
    // The preserved public profile remains available when storage is disabled.
  }
}

function isIndexerRequest(url: URL) {
  const configured = import.meta.env.VITE_INDEXER_GRAPHQL_URL as string | undefined;
  if (configured && url.href.replace(/\/$/, '') === configured.replace(/\/$/, '')) return true;
  return url.hostname.includes('smartcupagent-indexer-graphql');
}

async function staticResponse(url: URL, method: string, body: BodyInit | null | undefined) {
  if (isIndexerRequest(url) && method === 'POST') {
    return jsonResponse({
      data: {
        userStats: { nodes: indexerNodes },
        bolaoMatches: { nodes: [] },
      },
    });
  }

  if (url.pathname === '/api/v1/leaderboard' && method === 'GET') {
    return jsonResponse({ rows: leaderboardRows, total: leaderboardRows.length });
  }

  if (url.pathname === '/api/v1/stats/pools' && method === 'GET') {
    return jsonResponse({ pools: poolStats, total: poolStats.length });
  }

  const poolMatch = url.pathname.match(/^\/api\/v1\/stats\/pools\/(\d+)$/);
  if (poolMatch && method === 'GET') {
    return jsonResponse(poolStatsByMatch.get(poolMatch[1]) ?? emptyPool(poolMatch[1]));
  }

  const profileMatch = url.pathname.match(/^\/api\/v1\/profiles\/(0x[0-9a-fA-F]{64})$/);
  if (profileMatch && method === 'GET') {
    const wallet = profileMatch[1].toLowerCase();
    return jsonResponse({
      wallet_address: wallet,
      display_name: storedProfile(wallet) ?? offchain.profiles[wallet] ?? null,
    });
  }

  if (profileMatch && method === 'PUT') {
    const wallet = profileMatch[1].toLowerCase();
    let displayName = '';
    try {
      const parsed = JSON.parse(typeof body === 'string' ? body : '{}') as { display_name?: unknown };
      displayName = String(parsed.display_name ?? '').trim();
    } catch {
      return jsonResponse({ detail: 'Invalid profile payload' }, 400);
    }
    if (!displayName) return jsonResponse({ detail: 'Display name is required' }, 400);
    saveStoredProfile(wallet, displayName);
    return jsonResponse({ wallet_address: wallet, display_name: displayName });
  }

  if (
    (url.pathname === '/api/v1/stats/record-bet' || url.pathname === '/api/v1/stats/record-claim')
    && method === 'POST'
  ) {
    return jsonResponse({ recorded: false, message: 'Completed tournament data is preserved read-only' });
  }

  if (url.pathname === '/api/v1/prices/vara' && method === 'GET') {
    return jsonResponse({ detail: 'Use the existing CoinGecko fallback' }, 503);
  }

  if (url.pathname.startsWith('/api/v1/')) {
    return jsonResponse({ detail: 'Archived endpoint not available' }, 404);
  }

  return null;
}

export function installStaticRenderDataFetch() {
  if (!isStaticRenderDataEnabled() || typeof window === 'undefined') return;

  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const inputUrl = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
    const url = new URL(inputUrl, window.location.origin);
    const method = String(init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const response = await staticResponse(url, method, init?.body);
    return response ?? nativeFetch(input, init);
  };
}

export const STATIC_RENDER_DATA_SUMMARY = Object.freeze({
  matches: results.reconciliation.matchCount,
  wallets: results.reconciliation.walletCount,
  matchPredictions: results.reconciliation.matchPredictionCount,
  championshipPicks: results.reconciliation.championshipPickPredictionCount,
  totalPredictions: results.reconciliation.consolidatedPredictionCount,
  profiles: Object.keys(offchain.profiles).length,
  pools: poolStats.length,
});
