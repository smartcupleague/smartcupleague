import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './leaderboards.css';
import { useAccount, useApi } from '@gear-js/react-hooks';
import { useToast } from '@/hooks/useToast';
import { usePodiumPick } from '@/hooks/usePodiumPick';
import { web3Enable } from '@polkadot/extension-dapp';
import { Program, Service } from '@/hocs/lib';
import { StyledWallet } from '../wallet/Wallet';
import { useWalletProfile } from '@/hooks/useWalletProfile';
import { API_BASE_URL } from '@/utils/api';
import { useNavigate } from 'react-router-dom';
import { useTournamentSelection } from '@/hooks/useTournamentSelection';
import {
  TOURNAMENT_TAB_ORDER,
  WORLD_CUP_2026_TOURNAMENT,
  addressKey,
  getAddressMapValue,
  getTournamentByKey,
  isWCPhase,
  matchPath,
  setAddressMapValue,
  toHexAddress,
} from '@/utils';
import { WORLD_CUP_TEAM_LABELS } from '@/utils/teams';
import {
  getPodiumCorrectCount,
  getPodiumEarnedPoints,
  getPreviewPodiumPick,
  getPreviewPodiumResult,
  getPodiumResultRows,
  normalizePodiumStanding,
  PodiumStanding,
} from '@/utils/podium';
import { UserProfileModal } from './UserProfileModal';
import { TeamFlag } from '@/components/common/TeamFlag';
import { PiArrowClockwiseBold, PiMagnifyingGlassBold } from 'react-icons/pi';

const PROGRAM_ID = import.meta.env.VITE_BOLAOCOREPROGRAM as `0x${string}`;
const MY_LB_KEY = 'scl_my_leaderboard_v1';
const INDEXER_URL = import.meta.env.VITE_INDEXER_GRAPHQL_URL as string | undefined;
const INDEXER_TIMEOUT_MS = 4_000;

function isLocalLeaderboardPreview() {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  const isLocalhost = host === 'localhost' || host === '127.0.0.1';
  if (!isLocalhost) return false;
  const params = new URLSearchParams(window.location.search);
  return params.get('previewLeaderboard') === '1';
}

type ApiStatsRow = {
  wallet_address: string;
  display_name?: string | null;
  matches_count: number;
  exact_count: number;
  outcome_count?: number;
  total_claimed_planck: string;
};

type LbRow = {
  rank: number;
  wallet: string;
  displayName?: string | null;
  totalPoints: number;
  matches: number;
  exact: number;
  outcomes: number;
};

const PREVIEW_WALLETS = [
  '0x1111111111111111111111111111111111111111111111111111111111111111',
  '0x2222222222222222222222222222222222222222222222222222222222222222',
  '0x3333333333333333333333333333333333333333333333333333333333333333',
  '0x4444444444444444444444444444444444444444444444444444444444444444',
  '0x5555555555555555555555555555555555555555555555555555555555555555',
  '0x6666666666666666666666666666666666666666666666666666666666666666',
];

function buildPreviewRows(): LbRow[] {
  return [
    { rank: 1, wallet: PREVIEW_WALLETS[0], displayName: 'Machtura FC', totalPoints: 184, matches: 18, exact: 7, outcomes: 12 },
    { rank: 2, wallet: PREVIEW_WALLETS[1], displayName: 'Vara Victor', totalPoints: 171, matches: 17, exact: 6, outcomes: 13 },
    { rank: 3, wallet: PREVIEW_WALLETS[2], displayName: 'Cup Oracle', totalPoints: 163, matches: 16, exact: 5, outcomes: 12 },
    { rank: 4, wallet: PREVIEW_WALLETS[3], displayName: 'Penalty King', totalPoints: 139, matches: 15, exact: 4, outcomes: 11 },
    { rank: 5, wallet: PREVIEW_WALLETS[4], displayName: 'Golden Boot', totalPoints: 126, matches: 14, exact: 3, outcomes: 10 },
    { rank: 6, wallet: PREVIEW_WALLETS[5], displayName: 'Clean Sheet', totalPoints: 112, matches: 13, exact: 3, outcomes: 9 },
  ];
}

function previewKickoff(offsetDays: number) {
  return String(Math.floor((Date.now() + offsetDays * 24 * 60 * 60 * 1000) / 1000));
}

function buildPreviewMatches(): LeaderboardMatch[] {
  const participants = PREVIEW_WALLETS.map((wallet) => wallet.toLowerCase());
  return [
    {
      match_id: '901',
      phase: 'GROUP_STAGE',
      home: 'Mexico',
      away: 'Canada',
      kick_off: previewKickoff(1),
      result: null,
      participants,
    },
    {
      match_id: '902',
      phase: 'ROUND_OF_16',
      home: 'Brazil',
      away: 'Belgium',
      kick_off: previewKickoff(3),
      result: null,
      participants,
    },
    {
      match_id: '903',
      phase: 'FINAL',
      home: 'Spain',
      away: 'France',
      kick_off: previewKickoff(-1),
      result: { finalized: { score: { home: 2, away: 1 } } },
      participants,
    },
  ];
}

// Tabs — removed Match Performance, R32 Bonus (Picks), Earnings/ROI per spec
const tabs = ['Global Leaderboard', 'My Leaderboard'] as const;
type Tab = (typeof tabs)[number];

function shortHex(addr: string) {
  if (!addr) return '-';
  if (!addr.startsWith('0x') || addr.length < 16) return addr;
  return addr.slice(0, 6) + '…' + addr.slice(-4);
}

function kickOffToMs(input: number) {
  if (!input || !Number.isFinite(input)) return 0;
  return input < 10_000_000_000 ? input * 1000 : input;
}

function formatDateTime(ms: number) {
  if (!ms) return '—';
  const d = new Date(ms);
  return (
    d.toLocaleDateString(undefined, { year: '2-digit', month: 'short', day: 'numeric' }) +
    ' ' +
    d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  );
}

function timestampToMs(value?: string | number | bigint | null) {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n < 10_000_000_000 ? n * 1000 : n;
}

function displayTeamName(team: string) {
  if (WORLD_CUP_TEAM_LABELS[team]) return WORLD_CUP_TEAM_LABELS[team];
  return team;
}

function isFinalizedMatch(m: LeaderboardMatch) {
  return !!((m.result as any)?.Finalized || (m.result as any)?.finalized);
}

type Score = { home: number; away: number };
type PenaltyWinner = 'Home' | 'Away' | null;

function normalizePenaltyWinner(value: unknown): PenaltyWinner {
  if (!value) return null;
  if (value === 'Home' || value === 'Away') return value;
  if (typeof value === 'object') {
    if ('Home' in (value as Record<string, unknown>)) return 'Home';
    if ('Away' in (value as Record<string, unknown>)) return 'Away';
  }
  return null;
}

function getFinalizedResult(result: unknown): { score?: Score; penaltyWinner: PenaltyWinner } {
  const finalized = (result as any)?.Finalized ?? (result as any)?.finalized;
  const score = finalized?.score;
  if (!score) return { penaltyWinner: null };
  return {
    score: {
      home: Number(score.home ?? 0) || 0,
      away: Number(score.away ?? 0) || 0,
    },
    penaltyWinner: normalizePenaltyWinner(finalized?.penalty_winner),
  };
}

function outcome(score: Score, penaltyWinner: PenaltyWinner = null): 'home' | 'draw' | 'away' {
  if (score.home > score.away) return 'home';
  if (score.home < score.away) return 'away';
  if (penaltyWinner === 'Home') return 'home';
  if (penaltyWinner === 'Away') return 'away';
  return 'draw';
}

function isExactPrediction(betScore: Score, betPenalty: PenaltyWinner, finalScore: Score, finalPenalty: PenaltyWinner) {
  if (betScore.home !== finalScore.home || betScore.away !== finalScore.away) return false;
  const finalDrawWithPenalty = finalScore.home === finalScore.away && !!finalPenalty;
  return !finalDrawWithPenalty || (!!betPenalty && betPenalty === finalPenalty);
}

function normalizeMatch(m: any): LeaderboardMatch {
  return {
    match_id: String(m?.match_id ?? m?.matchId ?? ''),
    phase: String(m?.phase ?? ''),
    home: String(m?.home ?? ''),
    away: String(m?.away ?? ''),
    kick_off: String(m?.kick_off ?? m?.kickOff ?? '0'),
    result: m?.result ?? null,
    participants: Array.isArray(m?.participants) ? m.participants.map((p: any) => String(p ?? '').toLowerCase()) : [],
  };
}

async function deriveOnChainAccuracy(rows: LbRow[], svc: Service | null, matches: LeaderboardMatch[]): Promise<LbRow[]> {
  if (!svc || !rows.length) return rows;

  const finalizedById = new Map<string, { score: Score; penaltyWinner: PenaltyWinner }>();
  for (const match of matches) {
    const finalized = getFinalizedResult(match.result);
    if (finalized.score) finalizedById.set(String(match.match_id), { score: finalized.score, penaltyWinner: finalized.penaltyWinner });
  }
  if (!finalizedById.size) return rows;

  const rowsNeedingFallback = rows.filter((row) => row.exact === 0 && row.outcomes === 0 && row.matches > 0);
  if (!rowsNeedingFallback.length) return rows;

  const derived = new Map<string, Pick<LbRow, 'exact' | 'outcomes'>>();
  await Promise.allSettled(rowsNeedingFallback.map(async (row) => {
    const wallet = addressKey(row.wallet);
    if (!wallet) return;

    const bets = (await (svc as any).queryBetsByUser(wallet)) as any[];
    let exact = 0;
    let outcomes = 0;

    for (const bet of bets ?? []) {
      const finalized = finalizedById.get(String(bet?.match_id ?? ''));
      const betScore = bet?.score;
      if (!finalized || !betScore) continue;

      const score = {
        home: Number(betScore.home ?? 0) || 0,
        away: Number(betScore.away ?? 0) || 0,
      };
      const betPenalty = normalizePenaltyWinner(bet?.penalty_winner);
      const exactHit = isExactPrediction(score, betPenalty, finalized.score, finalized.penaltyWinner);
      if (exactHit) exact += 1;
      if (!exactHit && outcome(score, betPenalty) === outcome(finalized.score, finalized.penaltyWinner)) outcomes += 1;
    }

    if (exact > 0 || outcomes > 0) derived.set(wallet, { exact, outcomes });
  }));

  if (!derived.size) return rows;
  return rows.map((row) => {
    const wallet = addressKey(row.wallet);
    const stats = wallet ? derived.get(wallet) : null;
    return stats ? { ...row, ...stats } : row;
  });
}

type QueryStateResponse = {
  user_points?: Array<[string, number]>;
  matches?: any[];
  podium_finalized?: boolean;
  r32_lock_time?: string | number | bigint | null;
  podium_result?: unknown;
  podiumResult?: unknown;
};

type LeaderboardMatch = {
  match_id: string;
  phase: string;
  home: string;
  away: string;
  kick_off: string;
  result?: any;
  participants?: string[];
};

type IndexerResult = {
  rows: LbRow[];
  upcomingMatches: any[];
};

type ConnectedProfileFallback = {
  walletHex: string | null;
  displayName: string | null;
};

/**
 * Try to load the leaderboard from the indexer (GraphQL).
 * Returns rows + upcoming matches sourced exclusively from the indexer.
 * Throws on any failure — caller is expected to fall back to on-chain.
 *
 * Failure modes that trigger fallback:
 *   - VITE_INDEXER_GRAPHQL_URL not configured
 *   - HTTP error / network unreachable
 *   - Request timeout (INDEXER_TIMEOUT_MS)
 *   - GraphQL `errors` field present
 *   - Empty leaderboard (probably stale DB or wrong programId)
 */
async function fetchFromIndexer(
  apiStats: Map<string, ApiStatsRow>,
  connectedProfile: ConnectedProfileFallback
): Promise<IndexerResult> {
  if (!INDEXER_URL) {
    throw new Error('VITE_INDEXER_GRAPHQL_URL not set');
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), INDEXER_TIMEOUT_MS);

  try {
    const query = `
      query LeaderboardData {
        userStats(orderBy: TOTAL_POINTS_DESC, first: 2000) {
          nodes {
            id
            totalPoints
            exactCount
            outcomeCount
            totalBets
            totalClaimedRaw
          }
        }
        bolaoMatches(
          filter: { status: { in: ["UNRESOLVED", "PROPOSED"] } }
          orderBy: KICK_OFF_ASC
          first: 10
        ) {
          nodes { matchId phase home away kickOff }
        }
      }
    `;

    const res = await fetch(INDEXER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
      signal: ctrl.signal,
    });

    if (!res.ok) {
      throw new Error(`Indexer HTTP ${res.status}`);
    }

    const json = await res.json();
    if (json.errors && json.errors.length > 0) {
      throw new Error(`Indexer GraphQL: ${json.errors[0]?.message ?? 'unknown error'}`);
    }

    const userNodes: any[] = json?.data?.userStats?.nodes ?? [];
    const matchNodes: any[] = json?.data?.bolaoMatches?.nodes ?? [];

    if (!Array.isArray(userNodes) || userNodes.length === 0) {
      throw new Error('Indexer returned no leaderboard rows');
    }

    // Map UserStat → LbRow, enriched with /api/v1/leaderboard when available
    const rows: LbRow[] = userNodes.map((u) => {
      const wallet = addressKey(String(u.id ?? '')) ?? String(u.id ?? '').toLowerCase();
      const apiRow = getAddressMapValue(apiStats, wallet);
      const isConnectedWallet = !!connectedProfile.walletHex && addressKey(wallet) === connectedProfile.walletHex;
      return {
        rank: 0,
        wallet,
        displayName: apiRow?.display_name ?? (isConnectedWallet ? connectedProfile.displayName : null),
        totalPoints: Number(u.totalPoints ?? 0),
        matches: apiRow?.matches_count ?? Number(u.totalBets ?? 0),
        exact: Number(u.exactCount ?? apiRow?.exact_count ?? 0),
        outcomes: Number(u.outcomeCount ?? apiRow?.outcome_count ?? 0),
      };
    });

    rows.sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
      return a.wallet.localeCompare(b.wallet);
    });
    const ranked = rows.map((r, idx) => ({ ...r, rank: idx + 1 }));

    // Upcoming matches: filter by kickoff > now (status filter already excludes finalized/cancelled)
    const now = Date.now();
    const upcomingMatches = matchNodes
      .map(normalizeMatch)
      .filter((m) => {
        const n = Number(m.kick_off);
        if (!Number.isFinite(n) || n <= 0) return false;
        const ms = n < 10_000_000_000 ? n * 1000 : n;
        return ms > now;
      })
      .slice(0, 3);

    return { rows: ranked, upcomingMatches };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch supplementary stats from the legacy /api/v1/leaderboard endpoint.
 * Always best-effort — never throws. Used as enrichment in both indexer
 * and on-chain paths to populate display_name / exact_count / total_claimed.
 */
async function fetchApiStats(): Promise<Map<string, ApiStatsRow>> {
  const map = new Map<string, ApiStatsRow>();
  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/leaderboard?limit=2000`);
    if (!res.ok) return map;
    const data: { rows: ApiStatsRow[] } = await res.json();
    for (const row of data.rows ?? []) {
      setAddressMapValue(map, row.wallet_address, row);
    }
  } catch { /* API unavailable — empty map is fine */ }
  return map;
}

export default function Leaderboards() {
  const [activeTab, setActiveTab] = useState<Tab>('Global Leaderboard');
  const [query, setQuery] = useState('');
  const navigate = useNavigate();
  const previewLeaderboard = isLocalLeaderboardPreview();

  const { api, isApiReady } = useApi();
  const toast = useToast();
  const { account } = useAccount();
  const { displayName: connectedDisplayName } = useWalletProfile();
  const podiumPick = usePodiumPick();
  const previewPodiumPick = useMemo(() => getPreviewPodiumPick(), []);
  const previewPodiumResult = useMemo(() => getPreviewPodiumResult(), []);
  const displayedPodiumPick = previewPodiumPick ?? podiumPick.pick;
  const isPodiumPreview = !!previewPodiumPick;

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<LbRow[]>([]);
  const [upcomingMatches, setUpcomingMatches] = useState<any[]>([]);
  const [stateMatches, setStateMatches] = useState<LeaderboardMatch[]>([]);
  const [predictedMatchIds, setPredictedMatchIds] = useState<Set<string>>(new Set());
  const [profileRow, setProfileRow] = useState<LbRow | null>(null);
  const [podiumFinalized, setPodiumFinalized] = useState(false);
  const [r32LockTime, setR32LockTime] = useState<string | number | bigint | null>(null);
  const [podiumResult, setPodiumResult] = useState<PodiumStanding | null>(null);

  const listRef = useRef<HTMLDivElement | null>(null);

  // "My Leaderboard" — list of followed wallet addresses (localStorage)
  const [followedWallets, setFollowedWallets] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(MY_LB_KEY) ?? '[]');
    } catch {
      return [];
    }
  });

  const toggleFollow = (wallet: string) => {
    setFollowedWallets((prev) => {
      const next = prev.includes(wallet) ? prev.filter((w) => w !== wallet) : [...prev, wallet];
      try {
        localStorage.setItem(MY_LB_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const myWalletHex = useMemo(() => {
    const addr = account?.decodedAddress ?? (account as any)?.address ?? null;
    return toHexAddress(addr);
  }, [account]);

  useEffect(() => {
    void web3Enable('Leaderboards dApp');
  }, []);

  const fetchLeaderboard = useCallback(async () => {
    if (previewLeaderboard) {
      const previewMatches = buildPreviewMatches();
      setLoading(false);
      setRows(buildPreviewRows());
      setStateMatches(previewMatches);
      setUpcomingMatches(previewMatches.filter((match) => kickOffToMs(Number(match.kick_off)) > Date.now()));
      setPredictedMatchIds(new Set(['901']));
      setPodiumFinalized(!!previewPodiumResult);
      setR32LockTime(Date.now() + 7 * 24 * 60 * 60 * 1000);
      setPodiumResult(previewPodiumResult);
      return;
    }

    if (!api || !isApiReady) return;

    setLoading(true);
    try {
      // Always fetch the supplementary API stats (used by both paths).
      const statsMap = await fetchApiStats();

      let chainState: QueryStateResponse | null = null;
      let svc: Service | null = null;
      try {
        svc = new Service(new Program(api, PROGRAM_ID));
        chainState = (await (svc as any).queryState()) as QueryStateResponse;
      } catch { /* non-fatal; indexer path can still render leaderboard */ }

      setPodiumFinalized(Boolean(chainState?.podium_finalized));
      setR32LockTime(chainState?.r32_lock_time ?? null);
      setPodiumResult(normalizePodiumStanding(chainState?.podium_result ?? chainState?.podiumResult ?? null));

      if (svc && myWalletHex) {
        try {
          const bets = (await (svc as any).queryBetsByUser(myWalletHex)) as any[];
          setPredictedMatchIds(new Set((bets ?? []).map((b) => String(b?.match_id ?? '')).filter(Boolean)));
        } catch {
          setPredictedMatchIds(new Set());
        }
      } else {
        setPredictedMatchIds(new Set());
      }

      const normalizedStateMatches = Array.isArray(chainState?.matches)
        ? chainState.matches.map(normalizeMatch)
        : [];
      setStateMatches(normalizedStateMatches);

      // ── Path 1: indexer-first ─────────────────────────────────────────────
      try {
        const { rows: idxRows, upcomingMatches: idxUpcoming } = await fetchFromIndexer(statsMap, {
          walletHex: myWalletHex,
          displayName: connectedDisplayName,
        });
        setRows(await deriveOnChainAccuracy(idxRows, svc, normalizedStateMatches));
        setUpcomingMatches(idxUpcoming);
        return;
      } catch (indexerErr) {
        // Any failure → fall through to the on-chain path below.
        console.warn('[Leaderboard] Indexer path failed, using on-chain fallback:', indexerErr);
      }

      // ── Path 2: on-chain fallback (original logic) ────────────────────────
      const state = chainState ?? ({ matches: [], user_points: [] } as QueryStateResponse);

      const points = Array.isArray(state?.user_points) ? state.user_points : [];

      // Build a map of wallet → points
      const pointsMap = new Map<string, number>();
      for (const [wallet, pts] of points) {
        const key = addressKey(String(wallet ?? ''));
        if (key) pointsMap.set(key, Number(pts ?? 0));
      }

      // Build match count per wallet from participants lists
      const matchCountMap = new Map<string, number>();
      if (Array.isArray(state?.matches)) {
        for (const m of state.matches as any[]) {
          if (Array.isArray(m?.participants)) {
            for (const p of m.participants) {
              const hw = addressKey(String(p ?? ''));
              if (hw) {
                matchCountMap.set(hw, (matchCountMap.get(hw) ?? 0) + 1);
                if (!pointsMap.has(hw)) pointsMap.set(hw, 0);
              }
            }
          }
        }
      }

      // Ensure wallets that only have claims but no on-chain points appear
      for (const wallet of statsMap.keys()) {
        if (!pointsMap.has(wallet)) pointsMap.set(wallet, 0);
      }

      const mapped: LbRow[] = Array.from(pointsMap.entries())
        .map(([wallet, totalPoints]) => {
          const apiRow = getAddressMapValue(statsMap, wallet);
          const isConnectedWallet = !!myWalletHex && addressKey(wallet) === myWalletHex.toLowerCase();
          return {
            rank: 0,
            wallet,
            displayName: apiRow?.display_name ?? (isConnectedWallet ? connectedDisplayName : null),
            totalPoints,
            // API data takes precedence; fall back to contract participant count
            matches: apiRow?.matches_count ?? matchCountMap.get(wallet) ?? 0,
            exact: apiRow?.exact_count ?? 0,
            outcomes: apiRow?.outcome_count ?? 0,
          };
        })
        .filter((r) => !!r.wallet);

      mapped.sort((a, b) => {
        if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
        return a.wallet.localeCompare(b.wallet);
      });

      const rankedRows = mapped.map((r, idx) => ({ ...r, rank: idx + 1 }));
      setRows(await deriveOnChainAccuracy(rankedRows, svc, normalizedStateMatches));

      // Extract upcoming matches for sidebar widget
      if (Array.isArray(state?.matches)) {
        const now = Date.now();
        const upcoming = state.matches
          .map(normalizeMatch)
          .filter((m: any) => {
            const ko = Number(m?.kick_off ?? 0);
            const ms = ko < 10_000_000_000 ? ko * 1000 : ko;
            return !isFinalizedMatch(m) && ms > now;
          })
          .sort((a: any, b: any) => {
            const aMs = kickOffToMs(Number(a.kick_off));
            const bMs = kickOffToMs(Number(b.kick_off));
            return aMs - bMs;
          })
          .slice(0, 3);
        setUpcomingMatches(upcoming);
      }
    } catch (e: any) {
      console.error(e);
      setRows([]);
      toast.error('Failed to fetch leaderboard');
    } finally {
      setLoading(false);
    }
  }, [api, connectedDisplayName, isApiReady, myWalletHex, previewLeaderboard, previewPodiumResult, toast]);

  useEffect(() => {
    void fetchLeaderboard();
  }, [fetchLeaderboard]);

  const tournamentCounts = useMemo(() => {
    const matches = stateMatches.length ? stateMatches : upcomingMatches.map(normalizeMatch);
    return {
      leagues: matches.filter((m) => !isWCPhase(m.phase)).length,
      worldcup: matches.filter((m) => isWCPhase(m.phase)).length,
    };
  }, [stateMatches, upcomingMatches]);

  const leaderboardTournamentTabs = useMemo(() => TOURNAMENT_TAB_ORDER
    .map((tournament) => ({ ...tournament, count: tournamentCounts[tournament.key] }))
    .filter((tournament) => tournament.count > 0), [tournamentCounts]);

  const availableTournamentKeys = useMemo(
    () => leaderboardTournamentTabs.map((tournament) => tournament.key),
    [leaderboardTournamentTabs]
  );
  const [selectedTournamentKey, setSelectedTournamentKey] = useTournamentSelection(
    availableTournamentKeys.length ? availableTournamentKeys : [WORLD_CUP_2026_TOURNAMENT.key]
  );

  const selectedTournament = getTournamentByKey(selectedTournamentKey);

  const activeTournamentMatches = useMemo(() => {
    const matches = stateMatches.length ? stateMatches : upcomingMatches.map(normalizeMatch);
    return selectedTournamentKey === 'worldcup'
      ? matches.filter((m) => isWCPhase(m.phase))
      : matches.filter((m) => !isWCPhase(m.phase));
  }, [selectedTournamentKey, stateMatches, upcomingMatches]);

  const activeTournamentRows = useMemo(() => {
    const withConnectedProfile = (row: LbRow): LbRow => {
      const isConnectedWallet = !!myWalletHex && addressKey(row.wallet) === myWalletHex.toLowerCase();
      return isConnectedWallet && !row.displayName && connectedDisplayName
        ? { ...row, displayName: connectedDisplayName }
        : row;
    };

    if (!stateMatches.length) return rows.map(withConnectedProfile);

    const matchCountMap = new Map<string, number>();
    for (const match of activeTournamentMatches) {
      for (const participant of match.participants ?? []) {
        const wallet = addressKey(participant);
        if (wallet) matchCountMap.set(wallet, (matchCountMap.get(wallet) ?? 0) + 1);
      }
    }

    return rows
      .filter((row) => {
        const wallet = addressKey(row.wallet);
        return !!wallet && matchCountMap.has(wallet);
      })
      .map((row) => ({
        ...withConnectedProfile(row),
        matches: matchCountMap.get(addressKey(row.wallet) ?? '') ?? 0,
      }))
      .sort((a, b) => {
        if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
        return a.wallet.localeCompare(b.wallet);
      })
      .map((row, index) => ({ ...row, rank: index + 1 }));
  }, [activeTournamentMatches, connectedDisplayName, myWalletHex, rows, stateMatches.length]);

  const selectedUpcomingMatches = useMemo(() => {
    const now = Date.now();
    const upcoming = activeTournamentMatches
      .filter((match) => {
        const kickOff = kickOffToMs(Number(match.kick_off));
        return kickOff > now && !isFinalizedMatch(match);
      })
      .sort((a, b) => kickOffToMs(Number(a.kick_off)) - kickOffToMs(Number(b.kick_off)));

    const unpredicted = upcoming.filter((match) => !predictedMatchIds.has(String(match.match_id)));
    const displayMatches = unpredicted.length ? unpredicted.slice(0, 4) : upcoming.slice(0, 1);

    return displayMatches.map((match) => ({
      ...match,
      isPredicted: predictedMatchIds.has(String(match.match_id)),
    }));
  }, [activeTournamentMatches, predictedMatchIds]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return activeTournamentRows;
    return activeTournamentRows.filter(
      (r) =>
        r.wallet.toLowerCase().includes(q) ||
        (r.displayName ?? '').toLowerCase().includes(q)
    );
  }, [activeTournamentRows, query]);

  const myRow = useMemo(() => {
    if (!myWalletHex) return null;
    const target = myWalletHex.toLowerCase();
    return activeTournamentRows.find((r) => addressKey(r.wallet) === target) ?? null;
  }, [activeTournamentRows, myWalletHex]);

  const myRank = myRow?.rank ?? null;
  const myPts = myRow?.totalPoints ?? 0;
  const myExact = myRow?.exact ?? 0;
  const myOutcomes = myRow?.outcomes ?? 0;

  const championshipLockMs = useMemo(() => timestampToMs(r32LockTime), [r32LockTime]);

  const championshipPickState = useMemo(() => {
    if (previewPodiumResult || podiumFinalized) return 'completed';
    if (displayedPodiumPick) return 'submitted';
    if (podiumPick.isLoading) return 'waiting';
    if (!championshipLockMs) return 'waiting';
    if (Date.now() >= championshipLockMs) return 'locked';
    return 'open';
  }, [championshipLockMs, displayedPodiumPick, podiumFinalized, podiumPick.isLoading, previewPodiumResult]);

  const championshipResultRows = useMemo(() => {
    const result = previewPodiumResult ?? podiumResult;
    if (!displayedPodiumPick || !result) return null;
    return getPodiumResultRows(displayedPodiumPick, result);
  }, [displayedPodiumPick, podiumResult, previewPodiumResult]);

  const championshipBonusSummary = useMemo(() => {
    if (!championshipResultRows) return null;
    return {
      earned: getPodiumEarnedPoints(championshipResultRows),
      correct: getPodiumCorrectCount(championshipResultRows),
    };
  }, [championshipResultRows]);

  const championshipPickMessage = useMemo(() => {
    if (!account && !isPodiumPreview) return 'Connect your wallet to view or submit your Championship Picks.';
    if (championshipBonusSummary) {
      return `Earned +${championshipBonusSummary.earned} pts · ${championshipBonusSummary.correct}/3 correct.`;
    }
    if (championshipPickState === 'completed') return 'Final podium bonuses are included in leaderboard totals.';
    if (championshipPickState === 'locked') return 'Championship Picks are locked for this tournament.';
    if (championshipPickState === 'open') return 'Earn up to +35 pts before picks lock.';
    return 'Available after the first Round of 32 match is defined.';
  }, [account, championshipBonusSummary, championshipPickState, isPodiumPreview]);

  const myLbRows = useMemo(() => {
    if (!followedWallets.length) return [];
    return activeTournamentRows.filter((r) => followedWallets.includes(r.wallet.toLowerCase()));
  }, [activeTournamentRows, followedWallets]);

  const handleJumpToMe = () => {
    if (!myWalletHex) return;
    const el = document.getElementById(`lb-row-${myWalletHex.toLowerCase()}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const displayRows = activeTab === 'My Leaderboard' ? myLbRows : filtered;
  const openProfileFromKeyboard = (event: React.KeyboardEvent<HTMLDivElement>, row: LbRow) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    setProfileRow(row);
  };

  return (
    <div className="lb lb--full">
      <div className="lb__bg" aria-hidden="true" />

      <header className="lbTop">
        <div className="lbTop__row">
          <div className="lbTitle">
            <h1>{activeTab}</h1>
            <p>Track rankings, points, and prediction performance.</p>
          </div>

          <div className="lbTop__right">
            <div className="lbSearch" role="search">
              <PiMagnifyingGlassBold className="lbSearch__icon" aria-hidden="true" />
              <input
                className="lbSearch__input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by address"
                aria-label="Search by address"
              />
            </div>

            <div className="lbWalletWrap">
              <StyledWallet />
            </div>
          </div>
        </div>

        <div className="lbTop__controls">
          <div className="lbTop__left" role="tablist" aria-label="Tournament tabs">
            {(leaderboardTournamentTabs.length ? leaderboardTournamentTabs : [WORLD_CUP_2026_TOURNAMENT]).map((tournament) => (
              <button
                key={tournament.key}
                className={'lbChip' + (selectedTournamentKey === tournament.key ? ' lbChip--active' : '')}
                type="button"
                role="tab"
                aria-selected={selectedTournamentKey === tournament.key}
                onClick={() => setSelectedTournamentKey(tournament.key)}>
                {tournament.label}
              </button>
            ))}
          </div>

          <div className="lbPager">
            <span className="muted tiny">{loading ? 'Loading…' : `Players: ${activeTournamentRows.length}`}</span>
            <button className="lbPage lbPage--ghost" type="button" onClick={handleJumpToMe} disabled={!myWalletHex}>
              Jump to me
            </button>
            <button className="lbPage lbPage--icon" type="button" onClick={fetchLeaderboard} aria-label="Refresh leaderboard" title="Refresh leaderboard">
              <PiArrowClockwiseBold aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      <section className="lbSubnav">
        <div className="lbTabs" role="tablist" aria-label="Leaderboards tabs">
          {tabs.map((t) => (
            <button
              key={t}
              className={'lbTab ' + (activeTab === t ? 'lbTab--active' : '')}
              onClick={() => setActiveTab(t)}
              type="button"
              role="tab"
              aria-selected={activeTab === t}>
              {t}
            </button>
          ))}
        </div>
      </section>

      <main className="lbGrid">
        <section className="lbCard lbCard--table" aria-label="Leaderboard table" aria-busy={loading}>
          <div className="lbTable" ref={listRef}>
            {/* Table header */}
            <div className="lbTHead lbTHead--6col">
              <div>Pos.</div>
              <div>Wallet</div>
              <div className="lbTH--num">Matches</div>
              <div className="lbTH--num">Exact</div>
              <div className="lbTH--num">Outcomes</div>
              <div className="lbTH--num lbTH--points">Points</div>
            </div>

            <div className="lbTBody" aria-live="polite">
              {activeTab === 'My Leaderboard' && !followedWallets.length ? (
                <div className="lbTable__foot muted tiny" role="status">
                  No wallets followed yet. Use the follow button next to any player in Global Leaderboard to add them.
                </div>
              ) : loading ? (
                <div className="lbTable__foot muted tiny" role="status">Loading on-chain leaderboard…</div>
              ) : displayRows.length === 0 ? (
                <div className="lbTable__foot muted tiny" role="status">No wallets found.</div>
              ) : (
                displayRows.map((r) => {
                  const isMe = !!myWalletHex && r.wallet.toLowerCase() === myWalletHex.toLowerCase();
                  const medal = r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : r.rank === 3 ? '🥉' : '•';
                  const isFollowed = followedWallets.includes(r.wallet.toLowerCase());
                  const playerLabel = r.displayName ?? shortHex(r.wallet);

                  return (
                    <div
                      key={`${r.rank}-${r.wallet}`}
                      id={`lb-row-${r.wallet.toLowerCase()}`}
                      className={'lbTRow lbTRow--6col ' + (isMe ? 'lbTRow--me' : '')}
                      onClick={() => setProfileRow(r)}
                      onKeyDown={(event) => openProfileFromKeyboard(event, r)}
                      role="button"
                      tabIndex={0}
                      aria-label={`View profile for ${playerLabel}, rank ${r.rank}, ${r.totalPoints} points`}>
                      <div className="lbRank">
                        <span className="lbMedal" aria-hidden="true">
                          {medal}
                        </span>
                        <span className="lbRank__no">#{r.rank}</span>
                      </div>

                      <div className="lbWalletCell" title={r.wallet}>
                        <span className="lbAvatar" aria-hidden="true" />
                        <span className="lbWalletCell__text">
                          {playerLabel}
                        </span>
                        {isMe ? <span className="lbMe">YOU</span> : null}
                        {/* Add to My Leaderboard button */}
                        <button
                          className={'lbFollowBtn ' + (isFollowed ? 'lbFollowBtn--active' : '')}
                          type="button"
                          title={isFollowed ? `Remove ${playerLabel} from My Leaderboard` : `Follow ${playerLabel}`}
                          aria-label={isFollowed ? `Remove ${playerLabel} from My Leaderboard` : `Follow ${playerLabel}`}
                          aria-pressed={isFollowed}
                          onKeyDown={(e) => e.stopPropagation()}
                          onClick={(e) => { e.stopPropagation(); toggleFollow(r.wallet.toLowerCase()); }}>
                          {isFollowed ? '✓' : '+'}
                        </button>
                      </div>

                      <div className="lbNum lbNum--right">
                        <span className={r.matches > 0 ? 'lbNum__main' : 'lbNum__main lbNum__muted'}>
                          {r.matches > 0 ? r.matches : '—'}
                        </span>
                      </div>
                      <div className="lbNum lbNum--right">
                        <span className={r.exact > 0 ? 'lbNum__main' : 'lbNum__main lbNum__muted'}>
                          {r.exact > 0 ? r.exact : '—'}
                        </span>
                      </div>
                      <div className="lbNum lbNum--right">
                        <span className={r.outcomes > 0 ? 'lbNum__main' : 'lbNum__main lbNum__muted'}>
                          {r.outcomes > 0 ? r.outcomes : '—'}
                        </span>
                      </div>

                      <div className="lbNum lbNum--right lbNum--points">
                        <span className="lbNum__main">{r.totalPoints}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </section>

        <aside className="lbRight">
          <section className={'lbCard lbChampCard' + (championshipPickState === 'waiting' ? ' lbChampCard--disabled' : '')}>
            <div className="lbCard__head">
              <div className="lbCard__title">🏆 Your Championship Picks</div>
            </div>

            {displayedPodiumPick ? (
              <div className="lbChampState">
                {(championshipResultRows ?? [
                  { key: 'champion', medal: '🥇', label: 'Champion', pick: displayedPodiumPick.champion, points: 20, hit: null },
                  { key: 'runnerUp', medal: '🥈', label: 'Runner-Up', pick: displayedPodiumPick.runnerUp, points: 10, hit: null },
                  { key: 'thirdPlace', medal: '🥉', label: '3rd Place', pick: displayedPodiumPick.thirdPlace, points: 5, hit: null },
                ]).map((row) => (
                  <div
                    className={
                      'lbChampPickRow' +
                      (row.hit === null ? ' lbChampPickRow--pending' : '') +
                      (row.hit === true ? ' lbChampPickRow--hit' : row.hit === false ? ' lbChampPickRow--miss' : '')
                    }
                    key={row.key}>
                    <span className="lbChampPickRow__main">
                      <span className="lbChampPickRow__role">
                        {row.medal} {row.label}:
                      </span>
                      <span className="lbChampPickRow__country">
                        <TeamFlag team={row.pick} className="lbChampPickRow__flag" />
                        <span>{displayTeamName(row.pick)}</span>
                      </span>
                      {row.hit === true && <span className="lbChampPickRow__mark">✓</span>}
                      {row.hit === false && <span className="lbChampPickRow__mark">×</span>}
                    </span>
                    {row.hit !== null && (
                      <b>+{row.hit === false ? 0 : row.points} pts</b>
                    )}
                  </div>
                ))}
                <div className="lbChampPotential">
                  {championshipBonusSummary
                    ? <>Championship bonus: <b>+{championshipBonusSummary.earned} pts</b> · {championshipBonusSummary.correct}/3 correct</>
                    : championshipPickState === 'completed'
                      ? 'Awarded bonuses are reflected in the leaderboard total.'
                      : <>Submitted. Results pending. Bonus: <b>+35 pts</b></>}
                </div>
              </div>
            ) : (
              <div className="lbChampState lbChampState--empty">
                <p>
                  {!account
                    ? 'Connect wallet to view your Championship Picks'
                    : championshipPickState === 'open'
                      ? 'You haven’t submitted your Championship Picks yet'
                      : championshipPickState === 'locked'
                        ? 'Championship Picks are locked'
                        : 'Championship Picks are not open yet'}
                </p>
                <span>{championshipPickMessage}</span>
                <button
                  className={'lbBtn wfull ' + (championshipPickState === 'open' ? 'lbBtn--primary' : 'lbBtn--soft')}
                  type="button"
                  onClick={() => navigate('/championship-pick')}>
                  {championshipPickState === 'open' ? 'Make Picks' : 'View Details'}
                </button>
              </div>
            )}
          </section>

          {/* Upcoming Matches — replaces R32 Bonus widget */}
          <section className="lbCard">
            <div className="lbCard__head">
              <div className="lbCard__title">Upcoming Matches</div>
              <button
                className="lbBtn lbBtn--ghost lbBtn--sm"
                type="button"
                onClick={() => navigate('/all-matches')}>
                View all matches →
              </button>
            </div>

            <div className="lbUpcoming">
              {selectedUpcomingMatches.length === 0 ? (
                <div className="lbEmptyState muted tiny">No upcoming matches loaded.</div>
              ) : (
                selectedUpcomingMatches.map((m) => (
                  <div className="lbUpMatch" key={m.match_id}>
                    <div className="lbUpMatch__teams">
                      <span className="lbUpMatch__team">
                        <TeamFlag team={m.home} className="lbUpMatch__flag" />
                        <span className="lbUpMatch__name">{m.home}</span>
                      </span>
                      <span className="lbUpMatch__vs">vs</span>
                      <span className="lbUpMatch__team">
                        <TeamFlag team={m.away} className="lbUpMatch__flag" />
                        <span className="lbUpMatch__name">{m.away}</span>
                      </span>
                    </div>
                    <div className="lbUpMatch__meta muted tiny">
                      {(m.phase || '').replace(/_/g, ' ')} · {formatDateTime(kickOffToMs(Number(m.kick_off)))}
                    </div>
                    <button
                      className={'lbBtn lbBtn--soft lbBtn--sm' + (m.isPredicted ? ' lbBtn--predicted' : '')}
                      type="button"
                      onClick={() => navigate(matchPath(m.phase, m.match_id))}>
                      {m.isPredicted ? 'Predicted' : 'Predict'}
                    </button>
                  </div>
                ))
              )}
            </div>

          </section>
        </aside>
      </main>

      {profileRow && (
        <UserProfileModal
          row={profileRow}
          isMe={!!myWalletHex && profileRow.wallet.toLowerCase() === myWalletHex.toLowerCase()}
          isFollowed={followedWallets.includes(profileRow.wallet.toLowerCase())}
          onFollow={() => toggleFollow(profileRow.wallet.toLowerCase())}
          onClose={() => setProfileRow(null)}
        />
      )}

      <footer className="lbBottom" aria-label="Your rank sticky bar">
        <div className="lbBottom__left">
          <div className="lbBottom__label muted tiny">Your Rank</div>
          <div className="lbBottom__value">
            <span className="lbBottom__rank">{myRank ? `#${myRank}` : '—'}</span>
            <span className="dot">•</span>
            <span className="lbBottom__pts">{myPts}</span>
            <span className="lbBottom__ptsLabel muted tiny"> points</span>
            {(myExact > 0 || myOutcomes > 0) ? (
              <>
                <span className="dot">•</span>
                <span className="lbBottom__detail muted tiny">
                  {myExact > 0 ? `${myExact} exact · ` : ''}{myOutcomes > 0 ? `${myOutcomes} outcomes` : ''}
                </span>
              </>
            ) : null}
          </div>
          <div className="lbBottom__hint muted tiny">
            {myWalletHex ? `Wallet: ${shortHex(myWalletHex)}` : 'Connect wallet to see your rank'}
          </div>
        </div>

        <div className="lbBottom__right">
          <button className="lbBtn lbBtn--primary" type="button" onClick={handleJumpToMe} disabled={!myWalletHex}>
            Jump to me
          </button>
        </div>
      </footer>
    </div>
  );
}
