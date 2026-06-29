import React, { useEffect, useState, useCallback, useMemo } from 'react';
import './all-matchs.css';
import { useApi, useAccount } from '@gear-js/react-hooks';
import { web3Enable, web3FromSource } from '@polkadot/extension-dapp';
import { Program, Service } from '@/hocs/lib';
import { useNavigate } from 'react-router-dom';
import { TransactionBuilder } from 'sails-js';
import { useToast } from '@/hooks/useToast';
import { useGaslessVoucher, withVoucherSignAndSend, TxFactory } from '@/hooks/useGaslessVoucher';
import { HexString } from '@gear-js/api';
import { TeamFlag } from '@/components/common/TeamFlag';
import { StyledWallet } from '@/components/wallet/Wallet';
import { FilterSelect } from '@/components/predictions/FilterSelect';
import { useVaraPrice } from '@/hooks/useVaraPrice';
import { useTournamentSelection } from '@/hooks/useTournamentSelection';
import { reportClaim } from '@/utils/statsReporter';
import { PREDICTION_PLACED_EVENT } from '@/utils/predictionEvents';
import { toHexAddress } from '@/utils/address';
import { API_BASE_URL } from '@/utils/api';
import { TOURNAMENT_TAB_ORDER, getTournamentByKey, isWCPhase, matchPath } from '@/utils';
import { PiEraserBold, PiMagnifyingGlassBold } from 'react-icons/pi';

const PROGRAM_ID = import.meta.env.VITE_BOLAOCOREPROGRAM as string;


type MatchInfo = {
  match_id: string;
  phase: string;
  home: string;
  away: string;
  kick_off: string;
  result: any;
  match_prize_pool: string;
  has_bets: boolean;
  total_winner_stake?: string;
  total_claimed?: string;
  settlement_prepared?: boolean;
  dust_swept?: boolean;
};

type CoreState = {
  r32_lock_time?: string | number | bigint | null;
  podium_finalized?: boolean;
};

type MatchPoolStats = {
  match_id: string;
  total_planck: string;
  total_bets: number;
};

function getResultDetails(result: any): {
  label: 'OPEN' | 'LIVE' | 'FINAL' | 'CANCELLED';
  home: number;
  away: number;
  penaltyWinner: string | null;
} {
  try {
    if (result === 'Cancelled' || result === 'cancelled' || result?.Cancelled !== undefined || result?.cancelled !== undefined) {
      return { label: 'CANCELLED', home: 0, away: 0, penaltyWinner: null };
    }

    if (result?.Finalized?.score) {
      const s = result.Finalized.score;
      return {
        label: 'FINAL',
        home: Number(s.home ?? 0) || 0,
        away: Number(s.away ?? 0) || 0,
        penaltyWinner: result.Finalized?.penalty_winner ?? null,
      };
    }
    if (result?.Proposed?.score) {
      const s = result.Proposed.score;
      return { label: 'LIVE', home: Number(s.home ?? 0) || 0, away: Number(s.away ?? 0) || 0, penaltyWinner: null };
    }

    if (result?.finalized?.score) {
      const s = result.finalized.score;
      return {
        label: 'FINAL',
        home: Number(s.home ?? 0) || 0,
        away: Number(s.away ?? 0) || 0,
        penaltyWinner: result.finalized?.penalty_winner ?? null,
      };
    }
    if (result?.proposed?.score) {
      const s = result.proposed.score;
      return { label: 'LIVE', home: Number(s.home ?? 0) || 0, away: Number(s.away ?? 0) || 0, penaltyWinner: null };
    }

    return { label: 'OPEN', home: 0, away: 0, penaltyWinner: null };
  } catch {
    return { label: 'OPEN', home: 0, away: 0, penaltyWinner: null };
  }
}

function formatDatetime(kickOff: string) {
  const n = Number(kickOff);
  if (!Number.isFinite(n) || n <= 0) return '-';
  const ms = n < 10_000_000_000 ? n * 1000 : n;
  const d = new Date(ms);
  return d.toLocaleString(undefined, {
    year: '2-digit',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function predictionWindow(kickOff: string): { closed: boolean; label: string } {
  const n = Number(kickOff);
  if (!Number.isFinite(n) || n <= 0) return { closed: true, label: 'Closed' };

  const ms = n < 10_000_000_000 ? n * 1000 : n;
  const closesAt = ms - 10 * 60 * 1000;
  const diff = closesAt - Date.now();
  if (diff <= 0) return { closed: true, label: 'Closed' };

  const mins = Math.floor(diff / 60000);
  if (mins < 60) return { closed: false, label: `Closes in ${mins}m` };

  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return { closed: false, label: `Closes in ${hrs}h ${rem}m` };
}


function formatAmount(val: unknown, decimals = 12) {
  if (val === null || val === undefined) return '—';

  if (typeof val === 'string') {
    const s = val.trim();
    if (!s || s === '—' || s === '-') return '—';
    const cleaned = s.replace(/,/g, '');
    if (!/^-?\d+$/.test(cleaned)) return '—';
    val = cleaned;
  }

  if (typeof val === 'number') {
    if (!Number.isFinite(val)) return '—';
    val = Math.trunc(val);
  }

  try {
    const bn = typeof val === 'bigint' ? val : BigInt(val as any);
    const amount = Number(bn) / 10 ** decimals;
    return amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  } catch {
    return '—';
  }
}

function parsePlanckAmount(val: unknown): bigint | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'bigint') return val;
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) return null;
    return BigInt(Math.trunc(val));
  }
  if (typeof val === 'object') {
    const json = (val as any)?.toJSON?.();
    if (json !== undefined && json !== val) {
      const parsed = parsePlanckAmount(json);
      if (parsed !== null) return parsed;
    }
    const stringified = (val as any)?.toString?.();
    if (typeof stringified === 'string' && stringified !== '[object Object]') {
      return parsePlanckAmount(stringified);
    }
    return null;
  }
  if (typeof val === 'string') {
    const cleaned = val.trim().replace(/,/g, '');
    if (!/^(?:\d+|0x[0-9a-fA-F]+)$/.test(cleaned)) return null;
    return BigInt(cleaned);
  }
  return null;
}

function readMatchPrizePoolPlanck(match: any): bigint {
  const candidates = [
    match?.match_prize_pool,
    match?.matchPrizePool,
    match?.total_pool,
    match?.totalPool,
    match?.pool_total,
    match?.poolTotal,
    match?.pool,
  ];

  let zeroFallback: bigint | null = null;
  for (const candidate of candidates) {
    const parsed = parsePlanckAmount(candidate);
    if (parsed === null) continue;
    if (parsed > 0n) return parsed;
    if (zeroFallback === null) zeroFallback = parsed;
  }
  return zeroFallback ?? 0n;
}

// Extract unique phases from matches list
function getPhases(matches: MatchInfo[]): string[] {
  const set = new Set<string>();
  for (const m of matches) {
    if (m.phase) set.add(m.phase);
  }
  return Array.from(set).sort();
}

type UserBetView = {
  match_id: string;
  score: { home: number; away: number };
  penalty_winner?: any;
};

function normalizePenaltyWinner(value: unknown): 'Home' | 'Away' | null {
  if (!value) return null;
  if (value === 'Home' || value === 'Away') return value;
  if (typeof value === 'object') {
    if ('Home' in (value as Record<string, unknown>)) return 'Home';
    if ('Away' in (value as Record<string, unknown>)) return 'Away';
  }
  return null;
}

function formatPenaltyWinner(value: unknown) {
  const normalized = normalizePenaltyWinner(value);
  if (!normalized) return '';
  return normalized === 'Home' ? 'Home' : 'Away';
}

const LOCAL_PREVIEW_MATCHES: MatchInfo[] = [
  {
    match_id: '1',
    phase: 'GROUP_STAGE',
    home: 'Mexico',
    away: 'Canada',
    kick_off: '1774558800',
    result: { finalized: { score: { home: 2, away: 0 } } },
    match_prize_pool: '8100000000000000',
    has_bets: true,
    settlement_prepared: true,
  },
  {
    match_id: '2',
    phase: 'GROUP_STAGE',
    home: 'USA',
    away: 'Netherlands',
    kick_off: String(Math.floor((Date.now() + (2 * 60 + 37) * 60 * 1000) / 1000)),
    result: null,
    match_prize_pool: '6475000000000000',
    has_bets: false,
  },
  {
    match_id: '3',
    phase: 'GROUP_STAGE',
    home: 'Portugal',
    away: 'Morocco',
    kick_off: String(Math.floor((Date.now() + 5 * 60 * 1000) / 1000)),
    result: null,
    match_prize_pool: '5100000000000000',
    has_bets: true,
  },
  {
    match_id: '4',
    phase: 'GROUP_STAGE',
    home: 'Brazil',
    away: 'Belgium',
    kick_off: String(Math.floor((Date.now() + 58 * 60 * 1000) / 1000)),
    result: null,
    match_prize_pool: '6180000000000000',
    has_bets: true,
  },
  {
    match_id: '5',
    phase: 'ROUND_OF_16',
    home: 'England',
    away: 'Argentina',
    kick_off: String(Math.floor((Date.now() - 35 * 60 * 1000) / 1000)),
    result: { proposed: { score: { home: 1, away: 1 } } },
    match_prize_pool: '7725000000000000',
    has_bets: true,
  },
  {
    match_id: '6',
    phase: 'ROUND_OF_16',
    home: 'Spain',
    away: 'France',
    kick_off: String(Math.floor((Date.now() - 2 * 60 * 60 * 1000) / 1000)),
    result: { cancelled: true },
    match_prize_pool: '4300000000000000',
    has_bets: false,
  },
];

const LOCAL_PENALTY_PREVIEW_MATCHES: MatchInfo[] = [
  {
    match_id: '75',
    phase: 'ROUND_OF_32',
    home: 'Germany',
    away: 'Paraguay',
    kick_off: String(Math.floor((Date.now() - 5 * 60 * 60 * 1000) / 1000)),
    result: { finalized: { score: { home: 0, away: 0 }, penalty_winner: 'Away' } },
    match_prize_pool: '10834950000000000',
    has_bets: true,
    settlement_prepared: true,
  },
  {
    match_id: '76',
    phase: 'ROUND_OF_32',
    home: 'Netherlands',
    away: 'Morocco',
    kick_off: String(Math.floor((Date.now() - 2 * 60 * 60 * 1000) / 1000)),
    result: { finalized: { score: { home: 2, away: 2 }, penalty_winner: 'Home' } },
    match_prize_pool: '10898700000000000',
    has_bets: true,
    settlement_prepared: true,
  },
  {
    match_id: '77',
    phase: 'ROUND_OF_32',
    home: 'Ivory Coast',
    away: 'Norway',
    kick_off: String(Math.floor((Date.now() + 24 * 60 * 60 * 1000) / 1000)),
    result: null,
    match_prize_pool: '10898700000000000',
    has_bets: true,
  },
  {
    match_id: '78',
    phase: 'ROUND_OF_32',
    home: 'France',
    away: 'Sweden',
    kick_off: String(Math.floor((Date.now() - 90 * 60 * 1000) / 1000)),
    result: { finalized: { score: { home: 1, away: 1 }, penalty_winner: 'Away' } },
    match_prize_pool: '9275000000000000',
    has_bets: true,
    settlement_prepared: true,
  },
];

function isLocalPredictedPreview() {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  const isLocalhost = host === 'localhost' || host === '127.0.0.1';
  if (!isLocalhost) return false;
  const params = new URLSearchParams(window.location.search);
  return params.get('previewPredicted') === '1';
}

function isLocalPenaltyPreview() {
  if (!isLocalPredictedPreview()) return false;
  const params = new URLSearchParams(window.location.search);
  return params.get('previewPenalty') === '1';
}

function buildPreviewBets(matches: MatchInfo[]): Map<string, UserBetView> {
  const previewBets = new Map<string, UserBetView>();
  const predictedMatchIds = isLocalPenaltyPreview()
    ? new Set(['75', '76', '78'])
    : new Set(['1', '4', '5']);
  for (const m of matches.filter((match) => predictedMatchIds.has(match.match_id))) {
    const result = getResultDetails(m.result);
    const seed = Number(m.match_id);
    const fallbackHome = Number.isFinite(seed) ? seed % 3 : 1;
    const fallbackAway = Number.isFinite(seed) ? (seed + 1) % 3 : 0;
    previewBets.set(m.match_id, {
      match_id: m.match_id,
      score: {
        home: result.label === 'FINAL' || result.label === 'LIVE' ? result.home : fallbackHome,
        away: result.label === 'FINAL' || result.label === 'LIVE' ? result.away : fallbackAway,
      },
      penalty_winner: result.penaltyWinner ?? null,
    });
  }
  return previewBets;
}

function mergeBetsByMatchId(lists: any[][]): any[] {
  const byMatchId = new Map<string, any>();
  for (const list of lists) {
    for (const bet of list ?? []) {
      const matchId = String(bet?.match_id ?? '');
      if (!matchId) continue;
      byMatchId.set(matchId, bet);
    }
  }
  return Array.from(byMatchId.values());
}

type SortField = 'match_id_asc' | 'match_id_desc' | 'date_asc' | 'date_desc';
type StatusFilter = '' | 'predicted' | 'not_predicted';
export const MatchesTableComponent: React.FC = () => {
  const { api, isApiReady } = useApi();
  const { account } = useAccount();
  const toast = useToast();
  const { ensureVoucher, invalidateVoucher } = useGaslessVoucher(account?.decodedAddress);
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [matches, setMatches] = useState<MatchInfo[] | null>(null);

  const [headerSearch, setHeaderSearch] = useState('');
  const [filterSearch, setFilterSearch] = useState('');

  // Filters
  const [filterStage, setFilterStage] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [sortField, setSortField] = useState<SortField>('match_id_asc');

  const [filterStatus, setFilterStatus] = useState<StatusFilter>('');
  const [claimLoadingId, setClaimLoadingId] = useState<string | null>(null);
  const { planckToUsd } = useVaraPrice();
  const [userBetsByMatchId, setUserBetsByMatchId] = useState<Map<string, UserBetView>>(new Map());
  const [poolStatsByMatchId, setPoolStatsByMatchId] = useState<Map<string, MatchPoolStats>>(new Map());
  const accountHex = useMemo(
    () => toHexAddress(account?.decodedAddress ?? (account as any)?.address ?? null),
    [account],
  );

  useEffect(() => {
    void web3Enable('Bolao Matches UI');
  }, []);

  const fetchMatches = useCallback(async () => {
    const useLocalPreview = isLocalPredictedPreview();
    const usePenaltyPreview = isLocalPenaltyPreview();
    if (usePenaltyPreview) {
      setMatches(LOCAL_PENALTY_PREVIEW_MATCHES);
      setLoading(false);
      return;
    }
    if (!api || !isApiReady) {
      if (useLocalPreview) setMatches(LOCAL_PREVIEW_MATCHES);
      return;
    }
    setLoading(true);

    try {
      const svc = new Service(new Program(api, PROGRAM_ID as HexString));
      const state = (await (svc as any).queryState()) as CoreState & { matches?: any[] };
      const list = (state as any)?.matches ?? [];

      const normalized: MatchInfo[] = (Array.isArray(list) ? list : []).map((m: any) => ({
        match_id: String(m?.match_id ?? ''),
        phase: String(m?.phase ?? ''),
        home: String(m?.home ?? ''),
        away: String(m?.away ?? ''),
        kick_off: String(m?.kick_off ?? '0'),
        result: m?.result ?? null,
        match_prize_pool: readMatchPrizePoolPlanck(m).toString(),
        has_bets: Boolean(m?.has_bets),
        total_winner_stake: m?.total_winner_stake != null ? String(m.total_winner_stake) : undefined,
        total_claimed: m?.total_claimed != null ? String(m.total_claimed) : undefined,
        settlement_prepared: m?.settlement_prepared != null ? Boolean(m.settlement_prepared) : false,
        dust_swept: m?.dust_swept != null ? Boolean(m.dust_swept) : undefined,
      }));

      setMatches(useLocalPreview && !normalized.length ? LOCAL_PREVIEW_MATCHES : normalized);
    } catch (e) {
      console.error('fetchMatches error', e);
      setMatches(useLocalPreview ? LOCAL_PREVIEW_MATCHES : null);
    } finally {
      setLoading(false);
    }
  }, [api, isApiReady]);

  useEffect(() => {
    fetchMatches();
  }, [fetchMatches]);

  const fetchPoolStats = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/stats/pools`);
      if (!res.ok) throw new Error(`Pool stats request failed: ${res.status}`);
      const data = (await res.json()) as { pools?: MatchPoolStats[] };
      const next = new Map<string, MatchPoolStats>();

      for (const pool of data.pools ?? []) {
        if (!pool?.match_id) continue;
        next.set(String(pool.match_id), {
          match_id: String(pool.match_id),
          total_planck: String(pool.total_planck ?? '0'),
          total_bets: Number(pool.total_bets ?? 0),
        });
      }

      setPoolStatsByMatchId(next);
    } catch (e) {
      console.error('fetchPoolStats error', e);
      setPoolStatsByMatchId(new Map());
    }
  }, []);

  useEffect(() => {
    void fetchPoolStats();
  }, [fetchPoolStats]);

  const fetchUserBets = useCallback(async () => {
    const previewBets = isLocalPredictedPreview() ? buildPreviewBets(matches ?? []) : null;
    if (!api || !isApiReady || !accountHex) {
      if (previewBets?.size) setUserBetsByMatchId(previewBets);
      return;
    }
    try {
      const svc = new Service(new Program(api, PROGRAM_ID as HexString));
      const candidates = Array.from(new Set([
        accountHex,
        typeof account?.decodedAddress === 'string' ? account.decodedAddress : null,
        typeof (account as any)?.address === 'string' ? (account as any).address : null,
      ].filter(Boolean))) as string[];
      const results = await Promise.all(
        candidates.map(async (candidate) => {
          try {
            const value = await (svc as any).queryBetsByUser(candidate);
            return Array.isArray(value) ? value : [];
          } catch {
            return [];
          }
        }),
      );
      const bets = mergeBetsByMatchId(results);
      const byMatchId = new Map<string, UserBetView>();
      for (const b of bets ?? []) {
        const matchId = String(b?.match_id ?? '');
        if (!matchId) continue;
        byMatchId.set(matchId, {
          match_id: matchId,
          score: {
            home: Number(b?.score?.home ?? 0) || 0,
            away: Number(b?.score?.away ?? 0) || 0,
          },
          penalty_winner: b?.penalty_winner ?? null,
        });
      }
      setUserBetsByMatchId(byMatchId.size ? byMatchId : previewBets ?? new Map());
    } catch { setUserBetsByMatchId(previewBets ?? new Map()); }
  }, [api, isApiReady, account, accountHex, matches]);

  useEffect(() => { void fetchUserBets(); }, [fetchUserBets]);

  useEffect(() => {
    const onPredictionPlaced = () => {
      void fetchMatches();
      void fetchPoolStats();
      void fetchUserBets();
      window.setTimeout(() => {
        void fetchMatches();
        void fetchPoolStats();
        void fetchUserBets();
      }, 1200);
    };

    window.addEventListener(PREDICTION_PLACED_EVENT, onPredictionPlaced);
    window.addEventListener('focus', onPredictionPlaced);
    return () => {
      window.removeEventListener(PREDICTION_PLACED_EVENT, onPredictionPlaced);
      window.removeEventListener('focus', onPredictionPlaced);
    };
  }, [fetchMatches, fetchPoolStats, fetchUserBets]);

  const tabCounts = useMemo(() => {
    const all = matches ?? [];
    return {
      leagues: all.filter((m) => !isWCPhase(m.phase)).length,
      worldcup: all.filter((m) => isWCPhase(m.phase)).length,
    };
  }, [matches]);

  const activeTournamentTabs = useMemo(() => TOURNAMENT_TAB_ORDER
    .map((tournament) => ({ ...tournament, count: tabCounts[tournament.key] }))
    .filter((tab) => tab.count > 0), [tabCounts]);

  const availableTournamentKeys = useMemo(
    () => activeTournamentTabs.map((tab) => tab.key),
    [activeTournamentTabs]
  );
  const [activeTab, setActiveTab] = useTournamentSelection(
    availableTournamentKeys.length
      ? availableTournamentKeys
      : [isLocalPredictedPreview() ? 'worldcup' : 'leagues']
  );

  useEffect(() => {
    setFilterStage('');
  }, [activeTab]);

  const phases = useMemo(() => {
    const activeMatches = (matches ?? []).filter((m) =>
      activeTab === 'worldcup' ? isWCPhase(m.phase) : !isWCPhase(m.phase),
    );
    return getPhases(activeMatches);
  }, [activeTab, matches]);

  const filteredMatches = useMemo(() => {
    let list = matches ?? [];

    // Text search
    const q = (filterSearch || headerSearch).trim().toLowerCase();
    if (q) {
      list = list.filter((m) => {
        const s = `${m.home} ${m.away} ${m.match_id} ${m.phase}`.toLowerCase();
        return s.includes(q);
      });
    }

    // Stage filter
    if (filterStage) {
      list = list.filter((m) => m.phase === filterStage);
    }

    // Date filter (YYYY-MM-DD string)
    if (filterDate) {
      list = list.filter((m) => {
        const n = Number(m.kick_off);
        if (!n) return false;
        const ms = n < 10_000_000_000 ? n * 1000 : n;
        const d = new Date(ms);
        const iso = d.toISOString().slice(0, 10); // YYYY-MM-DD
        return iso === filterDate;
      });
    }

    // Status filter
    if (filterStatus === 'predicted') {
      list = list.filter((m) => userBetsByMatchId.has(m.match_id));
    } else if (filterStatus === 'not_predicted') {
      list = list.filter((m) => !userBetsByMatchId.has(m.match_id));
    }

    // Sort
    if (sortField === 'date_asc') {
      list = [...list].sort((a, b) => Number(a.kick_off) - Number(b.kick_off));
    } else if (sortField === 'date_desc') {
      list = [...list].sort((a, b) => Number(b.kick_off) - Number(a.kick_off));
    } else if (sortField === 'match_id_desc') {
      list = [...list].sort((a, b) => {
        const ai = Number(a.match_id);
        const bi = Number(b.match_id);
        if (Number.isFinite(ai) && Number.isFinite(bi)) return bi - ai;
        return b.match_id.localeCompare(a.match_id);
      });
    } else {
      // Default: match # ascending (first → last)
      list = [...list].sort((a, b) => {
        const ai = Number(a.match_id);
        const bi = Number(b.match_id);
        if (Number.isFinite(ai) && Number.isFinite(bi)) return ai - bi;
        return a.match_id.localeCompare(b.match_id);
      });
    }

    // Tab filter (apply last so counts are correct)
    list = list.filter((m) =>
      activeTab === 'worldcup' ? isWCPhase(m.phase) : !isWCPhase(m.phase),
    );

    return list;
  }, [matches, filterSearch, headerSearch, filterStage, filterDate, sortField, filterStatus, userBetsByMatchId, activeTab]);

  const handleClaim = useCallback(
    async (matchId: string) => {
      if (!api || !isApiReady) {
        toast.error('Node API is not ready');
        return;
      }
      if (!account) {
        toast.error('Please connect your wallet');
        return;
      }

      try {
        setClaimLoadingId(matchId);

        const { signer } = await web3FromSource(account.meta.source);

        // Snapshot balance before claim to compute the earned amount
        let balanceBefore = 0n;
        try {
          const raw = await (api as any).balance.findOut(account.decodedAddress);
          balanceBefore = BigInt(raw.toString());
        } catch { /* non-fatal */ }

        const txFactory: TxFactory = () =>
          (new Service(new Program(api, PROGRAM_ID as HexString)) as any).claimMatchReward(BigInt(matchId));

        const { blockHash, response } = await withVoucherSignAndSend({
          txFactory,
          account: account.decodedAddress,
          signerOptions: { signer },
          value: 0n,
          ensureVoucher,
          invalidateVoucher,
          calculateGas: (tx) => tx.calculateGas(false, 50),
        });
        toast.info(`Claim included in block ${blockHash}`);
        await response();
        toast.success('Reward claimed ✅');

        // Compute earned amount from balance delta and report to stats backend
        try {
          const raw = await (api as any).balance.findOut(account.decodedAddress);
          const balanceAfter = BigInt(raw.toString());
          const diff = balanceAfter - balanceBefore;
          reportClaim(account.decodedAddress, matchId, diff > 0n ? diff.toString() : '0');
        } catch { /* non-fatal */ }

        setTimeout(fetchMatches, 900);
      } catch (e) {
        console.error(e);
        toast.error('Claim failed');
      } finally {
        setClaimLoadingId(null);
      }
    },
    [api, isApiReady, account, toast, fetchMatches, ensureVoucher, invalidateVoucher],
  );

  return (
    <div className="mxShell">
      {/* Header — same pattern as My Predictions, with wallet */}
      <header className="mxTop">
        <div className="mxTop__row">
          <div className="mxTitle">
            <h1>All Matches</h1>
            <p>Browse markets, live scores, pools, and predict outcomes.</p>
          </div>

          <div className="mxTop__right">
            <div className="mxSearch" role="search">
              <PiMagnifyingGlassBold className="mxSearch__icon" aria-hidden="true" />
              <input
                value={headerSearch}
                onChange={(e) => setHeaderSearch(e.target.value)}
                placeholder="Search teams, match ID, phase..."
                aria-label="Search teams, match ID, phase"
              />
            </div>

            {/* Wallet display — same as My Predictions */}
            <div className="mxWalletWrap">
              <StyledWallet />
            </div>
          </div>
        </div>

        {activeTournamentTabs.length > 0 ? (
          <div className="mxTabs" role="tablist" aria-label="Tournament tabs">
            {activeTournamentTabs.map((tab) => (
              <button
                key={tab.key}
                className={'mxTab' + (activeTab === tab.key ? ' is-active' : '')}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.key}
                onClick={() => { setActiveTab(tab.key); setFilterStage(''); }}
              >
                {tab.label} ({tab.count})
              </button>
            ))}
          </div>
        ) : null}

        <div className="mxInfoGrid" aria-label="Match rules summary">
          <div className="mxInfoCard">
            <span>Prediction window</span>
            <strong>Locks 10 min before kickoff</strong>
          </div>
          <div className="mxInfoCard">
            <span>Prize split</span>
            <strong>Wallet: 85% pool; freebet: 100% pool</strong>
          </div>
          <div className="mxInfoCard">
            <span>Market data</span>
            <strong>Live pools from the contract</strong>
          </div>
          <div className="mxInfoCard mxInfoCard--live">
            <span>Status</span>
            <strong>Open matches update automatically</strong>
          </div>
        </div>

        {/* Filters row */}
        <div className="mxFilters">
          <div className="mxFilters__right">
            <label className="mxFilterField">
              <span>Sort</span>
              <FilterSelect
                ariaLabel="Sort by"
                value={sortField}
                onChange={(next) => setSortField(next as SortField)}
                options={[
                  { value: 'match_id_asc', label: 'Match number: first to last' },
                  { value: 'match_id_desc', label: 'Match number: last to first' },
                  { value: 'date_asc', label: 'Kickoff: soonest first' },
                  { value: 'date_desc', label: 'Kickoff: latest first' },
                ]}
              />
            </label>

            <label className="mxFilterField">
              <span>Prediction</span>
              <FilterSelect
                ariaLabel="Filter by prediction status"
                value={filterStatus}
                onChange={(next) => setFilterStatus(next as StatusFilter)}
                options={[
                  { value: '', label: 'All matches' },
                  { value: 'predicted', label: 'Already predicted' },
                  { value: 'not_predicted', label: 'Needs prediction' },
                ]}
              />
            </label>

            <label className="mxFilterField">
              <span>Stage</span>
              <FilterSelect
                ariaLabel="Filter by stage"
                value={filterStage}
                onChange={setFilterStage}
                options={[
                  { value: '', label: 'All stages' },
                  ...phases.map((p) => ({ value: p, label: p.replace(/_/g, ' ') })),
                ]}
              />
            </label>

            {/* Clear filters */}
            {(filterStage || filterDate || filterSearch || headerSearch || filterStatus) && (
              <button
                className="mxBtn mxBtn--ghost mxBtn--icon"
                type="button"
                aria-label="Clear filters"
                title="Clear filters"
                onClick={() => {
                  setFilterStage('');
                  setFilterDate('');
                  setFilterSearch('');
                  setHeaderSearch('');
                  setFilterStatus('');
                }}>
                <PiEraserBold aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="mxSection">
        <div className="mxSection__title">
          <div className="mxSection__main">
            {getTournamentByKey(activeTab).sectionLabel}
          </div>
          <div className="mxSection__sub">
            {getTournamentByKey(activeTab).emptyLabel}
          </div>
        </div>

        {loading ? (
          <div className="mxLoading">
            <span className="mxSpinner" aria-hidden="true" /> Loading matches…
          </div>
        ) : filteredMatches.length > 0 ? (
          <div className="mxList">
            {filteredMatches.map((m) => {
              const r = getResultDetails(m.result);
              const apiPoolPlanck = parsePlanckAmount(poolStatsByMatchId.get(m.match_id)?.total_planck);
              const contractPoolPlanck = parsePlanckAmount(m.match_prize_pool);
              const poolPlanckForDisplay =
                apiPoolPlanck !== null && apiPoolPlanck > 0n
                  ? apiPoolPlanck
                  : contractPoolPlanck ?? 0n;
              const totalPoolHuman = formatAmount(poolPlanckForDisplay, 12);

              const prediction = predictionWindow(m.kick_off);
              const displayLabel = r.label === "OPEN" && prediction.closed ? "CLOSED" : r.label;

              const statusText =
                r.label === "FINAL"
                  ? "Final score " + r.home + "-" + r.away + "."
                  : r.label === "LIVE"
                    ? "Live now " + r.home + "-" + r.away + " - Proposed score."
                    : r.label === "CANCELLED"
                      ? "Match cancelled - Refund available if eligible."
                      : prediction.closed
                        ? "Prediction closed - Awaiting result."
                        : "Open for predictions - " + prediction.label + ".";

              const userBet = userBetsByMatchId.get(m.match_id);
              const hasPrediction = !!userBet;
              const pickText = userBet ? `${userBet.score.home}-${userBet.score.away}` : '';
              const pickPenaltyText = userBet ? formatPenaltyWinner(userBet.penalty_winner) : '';
              const finalPenaltyText = r.label === 'FINAL' ? formatPenaltyWinner(r.penaltyWinner) : '';

              return (
                <article className={'mxCard' + (hasPrediction ? ' mxCard--predicted' : '')} key={m.match_id}>
                  <div className="mxCard__top">
                    <div className="mxTeams" title={`${m.home} vs ${m.away}`}>
                      <div className="mxTeam">
                        <TeamFlag className="mxFlag" team={m.home} />
                        <span className="mxTeam__name">{m.home}</span>
                      </div>

                      <span className="mxVs">vs</span>

                      <div className="mxTeam mxTeam--right">
                        <span className="mxTeam__name">{m.away}</span>
                        <TeamFlag className="mxFlag" team={m.away} />
                      </div>

                    </div>

                    <div className="mxCard__topRight">
                      <span className={"mxStatus mxStatus--scoreboard mxStatus--" + displayLabel.toLowerCase()}>
                        {displayLabel}
                      </span>

                      {r.label === "OPEN" ? <span className="mxPill mxPill--predictionWindow">{prediction.label}</span> : null}

                      {/* Prediction Made badge on the right */}
                      {hasPrediction && (
                        <span className="mxStatus mxStatus--predicted mxPredictedBadge">✓ Predicted</span>
                      )}

                      {/* Claim badge — non-interactive, goes to match page for actual claim */}
                      {r.label === 'FINAL' && hasPrediction && m.settlement_prepared ? (
                        <span className="mxBtn mxBtn--claim mxBtn--static mxRewardBadge">
                          Reward Ready
                        </span>
                      ) : hasPrediction ? (
                        <button
                          className="mxBtn mxBtn--soft mxTopAction"
                          onClick={() => navigate(matchPath(m.phase, m.match_id))}
                          type="button">
                          Details
                        </button>
                      ) : r.label === "OPEN" && !prediction.closed ? (
                        <button
                          className="mxBtn mxBtn--primary mxTopAction"
                          onClick={() => navigate(matchPath(m.phase, m.match_id))}
                          type="button">
                          Predict
                        </button>
                      ) : null}
                    </div>

                    <div className="mxStatusLine">{statusText}</div>

                  </div>

                  <div className="mxCard__mid">
                    <div className="mxMeta">
                      <span className="mxMeta__chip">#{m.match_id}</span>
                      <span className="mxMeta__chip">{m.phase.replace(/_/g, ' ')}</span>
                      <span className="mxMeta__chip">{formatDatetime(m.kick_off)}</span>
                      <span className="mxMeta__chip">{m.has_bets ? 'Has Predictions ✓' : 'No predictions'}</span>
                    </div>

                    <div className="mxOutcomeGrid">
                      {userBet ? (
                        <div className="mxYourPick" aria-label={`Your pick ${pickText}`}>
                          <span className="mxYourPick__label">Your Pick</span>
                          <span className="mxYourPick__score">{pickText}</span>
                        </div>
                      ) : null}

                      {pickPenaltyText ? (
                        <div className="mxPenaltyPick" aria-label={`Your penalty pick ${pickPenaltyText}`}>
                          <span className="mxPenaltyPick__label">Pens Pick</span>
                          <span className="mxPenaltyPick__score">{pickPenaltyText}</span>
                        </div>
                      ) : null}

                      <div className="mxScore">
                        <div className="mxScore__label">
                          {displayLabel === "OPEN" ? "OPEN" : displayLabel === "CLOSED" ? "CLOSED" : r.label === "LIVE" ? "LIVE SCORE" : r.label === "CANCELLED" ? "CANCELLED" : "FINAL SCORE"}
                        </div>
                        <div className="mxScore__value">
                          {r.home}-{r.away}
                        </div>
                        {finalPenaltyText ? <div className="mxScore__penalty">Pens {finalPenaltyText}</div> : null}
                        <div className="mxScore__sub">
                          {r.label === "FINAL"
                            ? finalPenaltyText
                              ? `On-chain finalized result - ${finalPenaltyText} advanced on penalties`
                              : "On-chain finalized result"
                            : r.label === "LIVE"
                              ? "On-chain proposed score"
                              : r.label === "CANCELLED"
                                ? "Match cancelled"
                                : prediction.closed
                                  ? "Awaiting on-chain result"
                                  : "Open for predictions"}
                        </div>
                      </div>
                    </div>

                    <div className="mxPools">
                      <div className="mxPool">
                        <div className="mxPool__k">Match Prize Pool</div>
                        <div className="mxPool__valueRow">
                          <span className="mxPool__v">{`${totalPoolHuman} VARA`}</span>
                          <span className="mxPool__usd">{planckToUsd(poolPlanckForDisplay) || 'USD unavailable'}</span>
                        </div>
                      </div>
                    </div>

                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="mxEmpty">No matches found.</div>
        )}
      </div>

    </div>
  );
};
