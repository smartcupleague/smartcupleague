import React, { useState, useEffect, useCallback, useMemo } from 'react';
import './my-predictions.css';
import { useAccount, useApi } from '@gear-js/react-hooks';
import { useToast } from '@/hooks/useToast';
import { web3Enable, web3FromSource } from '@polkadot/extension-dapp';
import { Program, Service } from '@/hocs/lib';
import { TransactionBuilder } from 'sails-js';
import { useGaslessVoucher, withVoucherSignAndSend, TxFactory } from '@/hooks/useGaslessVoucher';
import { TeamFlag } from '@/components/common/TeamFlag';
import { StyledWallet } from '@/components/wallet/Wallet';
import { useVaraPrice } from '@/hooks/useVaraPrice';
import { FREEBET_BALANCE_CHANGED_EVENT } from '@/hooks/useFreebetBalance';
import { useTournamentSelection } from '@/hooks/useTournamentSelection';
import { PREDICTION_PLACED_EVENT } from '@/utils/predictionEvents';
import { toHexAddress } from '@/utils/address';
import { TOURNAMENT_TAB_ORDER, getTournamentByKey, isWCPhase } from '@/utils';
import { PiCaretDownBold, PiEraserBold, PiMagnifyingGlassBold } from 'react-icons/pi';

const PROGRAM_ID = import.meta.env.VITE_BOLAOCOREPROGRAM as string | undefined;
const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || 'https://smartcupleague-api.onrender.com';

type Score = { home: number; away: number };
type PenaltyWinner = 'Home' | 'Away' | undefined;

type PhaseConfig = {
  name: string;
  start_time: string;
  end_time: string;
  points_weight: number;
};

type ContractUserBetView = {
  match_id: number;
  score: Score;
  penalty_winner?: any;
  stake_in_match_pool: string | number | bigint;
  freebet_principal?: string | number | bigint;
  claimed: boolean;
};

type MatchInfo = {
  match_id: string;
  phase: string;
  home: string;
  away: string;
  kick_off: string;
  result: any;
  match_prize_pool: string;
  has_bets: boolean;

  total_claimed?: string;
  total_winner_stake?: string;
  settlement_prepared?: boolean;
  dust_swept?: boolean;
};

type MatchPoolStats = {
  match_id: string;
  home_planck: string;
  draw_planck: string;
  away_planck: string;
  total_planck: string;
  total_bets: number;
};

function isLocalPredictionsPreview() {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  const isLocalhost = host === 'localhost' || host === '127.0.0.1';
  if (!isLocalhost) return false;
  const params = new URLSearchParams(window.location.search);
  return params.get('previewPredictions') === '1';
}

function previewKickoff(offsetDays: number) {
  return String(Math.floor((Date.now() + offsetDays * 24 * 60 * 60 * 1000) / 1000));
}

function buildPreviewPredictionMatches(): MatchInfo[] {
  return [
    {
      match_id: '101',
      phase: 'GROUP_STAGE',
      home: 'Brazil',
      away: 'Japan',
      kick_off: previewKickoff(2),
      result: null,
      match_prize_pool: '18500000000000000',
      has_bets: true,
    },
    {
      match_id: '102',
      phase: 'ROUND_OF_16',
      home: 'Argentina',
      away: 'Germany',
      kick_off: previewKickoff(-1),
      result: { finalized: { score: { home: 2, away: 1 } } },
      match_prize_pool: '24850000000000000',
      has_bets: true,
      total_winner_stake: '4200000000000000',
      settlement_prepared: true,
    },
    {
      match_id: '103',
      phase: 'FINAL',
      home: 'Spain',
      away: 'France',
      kick_off: previewKickoff(-3),
      result: { finalized: { score: { home: 1, away: 1 }, penalty_winner: 'Away' } },
      match_prize_pool: '32600000000000000',
      has_bets: true,
      total_winner_stake: '7800000000000000',
      settlement_prepared: true,
    },
    {
      match_id: '201',
      phase: 'SMARTCUP_LEAGUE',
      home: 'SmartCup FC',
      away: 'Vara United',
      kick_off: previewKickoff(5),
      result: { proposed: { score: { home: 1, away: 0 } } },
      match_prize_pool: '9800000000000000',
      has_bets: true,
    },
  ];
}

function buildPreviewPredictionBets(): ContractUserBetView[] {
  return [
    {
      match_id: 101,
      score: { home: 3, away: 1 },
      stake_in_match_pool: '1500000000000000',
      freebet_principal: '0',
      claimed: false,
    },
    {
      match_id: 102,
      score: { home: 2, away: 1 },
      stake_in_match_pool: '2100000000000000',
      freebet_principal: '500000000000000',
      claimed: false,
    },
    {
      match_id: 103,
      score: { home: 1, away: 1 },
      penalty_winner: 'Home',
      stake_in_match_pool: '1750000000000000',
      freebet_principal: '0',
      claimed: false,
    },
    {
      match_id: 201,
      score: { home: 2, away: 0 },
      stake_in_match_pool: '900000000000000',
      freebet_principal: '0',
      claimed: true,
    },
  ];
}

function buildPreviewPredictionPhases(): PhaseConfig[] {
  return [
    { name: 'GROUP_STAGE', start_time: '0', end_time: '0', points_weight: 1 },
    { name: 'ROUND_OF_16', start_time: '0', end_time: '0', points_weight: 2 },
    { name: 'FINAL', start_time: '0', end_time: '0', points_weight: 4 },
    { name: 'SMARTCUP_LEAGUE', start_time: '0', end_time: '0', points_weight: 1 },
  ];
}

function normalizeTeamKey(team: string) {
  return (team || '').trim().toUpperCase().replace(/\s+/g, ' ');
}

function kickOffToMs(kickOff: string): number {
  const n = Number(kickOff);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n < 10_000_000_000 ? n * 1000 : n;
}

function formatKickoff(kickOff: string) {
  const ms = kickOffToMs(kickOff);
  if (!ms) return '—';
  return new Date(ms).toLocaleString(undefined, {
    year: '2-digit',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatAmount(val: string | number | bigint, decimals = 12) {
  if (val === null || val === undefined) return '—';
  const bn = typeof val === 'bigint' ? val : BigInt(val);
  const amount = Number(bn) / 10 ** decimals;
  return amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function toBn(val: string | number | bigint): bigint {
  try {
    if (typeof val === 'bigint') return val;
    if (typeof val === 'number') return BigInt(Math.floor(val));
    const s = String(val ?? '0').trim();
    if (!s) return 0n;
    return BigInt(s);
  } catch {
    return 0n;
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

function parsePenaltyWinner(v: any): PenaltyWinner {
  if (!v) return undefined;
  if (v === 'Home' || v === 'Away') return v;
  if (typeof v === 'string') {
    const s = v.trim();
    if (s === 'Home' || s === 'Away') return s as PenaltyWinner;
    return undefined;
  }
  if (typeof v === 'object') {
    const k = Object.keys(v)[0];
    if (k === 'Home' || k === 'Away') return k;
  }
  return undefined;
}

function getFinalizedResult(result?: any): { score?: Score; penaltyWinner?: PenaltyWinner } {
  if (!result) return {};
  const fin = result.Finalized ?? result.finalized;
  if (!fin) return {};
  const s = fin.score;
  const score: Score | undefined =
    s && typeof s === 'object' && 'home' in s && 'away' in s
      ? { home: Number((s as any).home ?? 0) || 0, away: Number((s as any).away ?? 0) || 0 }
      : undefined;
  const penaltyWinner = parsePenaltyWinner(fin.penalty_winner ?? fin.penaltyWinner);
  return { score, penaltyWinner };
}

function getPhaseWeight(phaseName: string, phases: PhaseConfig[]): number {
  const p = phases.find((x) => String(x.name) === String(phaseName));
  const w = Number(p?.points_weight ?? 1);
  return Number.isFinite(w) && w > 0 ? w : 1;
}

function isKnockout(phaseWeight: number) {
  return phaseWeight > 1;
}

function isMatchFinal(result?: any) {
  return !!(result?.Finalized || result?.finalized);
}

function isCancelledMatch(result?: any): boolean {
  if (!result) return false;
  if (result === 'Cancelled' || result === 'cancelled') return true;
  if (typeof result === 'object' && (result.Cancelled !== undefined || result.cancelled !== undefined)) return true;
  return false;
}

function getCurrentScore(result?: any): { home: number; away: number; tag: 'OPEN' | 'LIVE' | 'FINAL' | 'CANCELLED' } {
  if (!result) return { home: 0, away: 0, tag: 'OPEN' };

  if (isCancelledMatch(result)) {
    return { home: 0, away: 0, tag: 'CANCELLED' };
  }

  if (result.Finalized?.score) {
    const s = result.Finalized.score;
    return { home: Number(s.home ?? 0) || 0, away: Number(s.away ?? 0) || 0, tag: 'FINAL' };
  }
  if (result.Proposed?.score) {
    const s = result.Proposed.score;
    return { home: Number(s.home ?? 0) || 0, away: Number(s.away ?? 0) || 0, tag: 'LIVE' };
  }

  if (result.finalized?.score) {
    const s = result.finalized.score;
    return { home: Number(s.home ?? 0) || 0, away: Number(s.away ?? 0) || 0, tag: 'FINAL' };
  }
  if (result.proposed?.score) {

    const s = result.proposed.score;
    return { home: Number(s.home ?? 0) || 0, away: Number(s.away ?? 0) || 0, tag: 'LIVE' };
  }

  return { home: 0, away: 0, tag: 'OPEN' };
}

function totalPoolVara(m?: MatchInfo) {
  if (!m) return '—';
  return `${formatAmount(m.match_prize_pool ?? '0', 12)} VARA`;
}

function predictionOutcomeKey(score: Score): 'home' | 'draw' | 'away' {
  if (score.home > score.away) return 'home';
  if (score.home < score.away) return 'away';
  return 'draw';
}

function poolForOutcome(stats: MatchPoolStats | undefined, outcome: 'home' | 'draw' | 'away') {
  if (!stats) return 0n;
  if (outcome === 'home') return toBn(stats.home_planck);
  if (outcome === 'away') return toBn(stats.away_planck);
  return toBn(stats.draw_planck);
}

function estimatePayoutBn(stakeInMatchPool: bigint, outcomePool: bigint, matchPrizePool: bigint): bigint | null {
  if (stakeInMatchPool <= 0n) return null;
  if (outcomePool <= 0n) return null;
  if (matchPrizePool <= 0n) return null;
  return (stakeInMatchPool * matchPrizePool) / outcomePool;
}

function formatPrizeValue(amount: bigint | null) {
  if (amount === null) return '—';
  return `${formatAmount(amount, 12)} VARA`;
}

function formatStakeValue(amount: bigint) {
  return formatAmount(amount, 12);
}

function computeDeterministicShareBn(
  stakeInMatchPool: bigint,
  matchPrizePool: bigint,
  totalWinnerStake: bigint,
): bigint {
  if (stakeInMatchPool <= 0n) return 0n;
  if (matchPrizePool <= 0n) return 0n;
  if (totalWinnerStake <= 0n) return 0n;
  return (stakeInMatchPool * matchPrizePool) / totalWinnerStake;
}

function outcomeOf(score: Score): -1 | 0 | 1 {
  if (score.home > score.away) return 1;
  if (score.home < score.away) return -1;
  return 0;
}

function isExactScore(betScore?: Score, finalScore?: Score) {
  return !!betScore && !!finalScore && betScore.home === finalScore.home && betScore.away === finalScore.away;
}


function advanceOutcome(score: Score, penaltyWinner: PenaltyWinner): -1 | 0 | 1 {
  const o = outcomeOf(score);
  if (o !== 0) return o;
  if (penaltyWinner === 'Home') return 1;
  if (penaltyWinner === 'Away') return -1;
  return 0;
}


function eligibleForPayout(
  betScore: Score | undefined,
  betPenalty: PenaltyWinner,
  finalScore: Score | undefined,
  finalPenalty: PenaltyWinner,
  phaseWeight: number,
) {
  if (!betScore || !finalScore) return false;

  const knockout = isKnockout(phaseWeight);
  const drawFinal = finalScore.home === finalScore.away;


  const exact = isExactScore(betScore, finalScore);
  if (exact) {
    if (knockout && drawFinal) {
      return !!betPenalty && !!finalPenalty && betPenalty === finalPenalty;
    }
    return true;
  }

  if (!knockout) {
    
    return outcomeOf(betScore) === outcomeOf(finalScore);
  }

 
  const finalAdv = advanceOutcome(finalScore, finalPenalty);
  if (finalAdv === 0) return false; 

 
  const betDraw = betScore.home === betScore.away;
  const betAdv = betDraw ? advanceOutcome(betScore, betPenalty) : outcomeOf(betScore);

  if (betAdv === 0) return false; 
  return betAdv === finalAdv;
}

export const QueryBetsByUserComponent: React.FC = () => {
  const { account } = useAccount();
  const toast = useToast();
  const { api, isApiReady } = useApi();
  const { ensureVoucher, invalidateVoucher } = useGaslessVoucher(account?.decodedAddress);
  const { planckToUsd } = useVaraPrice();

  const [bets, setBets] = useState<ContractUserBetView[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const [matches, setMatches] = useState<MatchInfo[] | null>(null);
  const [phases, setPhases] = useState<PhaseConfig[]>([]);

  const [search, setSearch] = useState('');
  const [filterStage, setFilterStage] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [sortField, setSortField] = useState<'match_id' | 'date' | 'az' | 'za'>('match_id');
  const [filterStatus, setFilterStatus] = useState<'' | 'claimed' | 'pending' | 'eligible' | 'not_eligible'>('');
  const [claimedOverrideByMatch, setClaimedOverrideByMatch] = useState<Record<number, boolean>>({});
  const [claimingByMatch, setClaimingByMatch] = useState<Record<number, boolean>>({});
  const [pendingRefund, setPendingRefund] = useState<bigint>(0n);
  const [claimingRefund, setClaimingRefund] = useState(false);
  const [poolStatsByMatchId, setPoolStatsByMatchId] = useState<Map<string, MatchPoolStats>>(new Map());
  const hasProgramId = Boolean(PROGRAM_ID && /^0x[0-9a-fA-F]{64}$/.test(PROGRAM_ID));
  const programId = hasProgramId ? (PROGRAM_ID as `0x${string}`) : undefined;
  const accountHex = useMemo(
    () => toHexAddress(account?.decodedAddress ?? (account as any)?.address ?? null),
    [account],
  );
  const previewPredictions = isLocalPredictionsPreview();
  const visibleMatches = useMemo(
    () => previewPredictions ? buildPreviewPredictionMatches() : (matches ?? []),
    [previewPredictions, matches],
  );
  const visibleBets = useMemo(
    () => previewPredictions ? buildPreviewPredictionBets() : (bets ?? []),
    [previewPredictions, bets],
  );
  const visiblePhases = useMemo(
    () => previewPredictions ? buildPreviewPredictionPhases() : phases,
    [previewPredictions, phases],
  );

  useEffect(() => {
    void web3Enable('Bolao Bets UI');
  }, []);

  const fetchState = useCallback(async () => {
    if (!api || !isApiReady || !hasProgramId) {
      setMatches([]);
      setPhases([]);
      return;
    }
    try {
      const svc = new Service(new Program(api, programId));
      const state = (await (svc as any).queryState()) as any;

      const list: MatchInfo[] = Array.isArray(state?.matches)
        ? state.matches.map((m: any) => ({
            match_id: String(m?.match_id ?? ''),
            phase: String(m?.phase ?? ''),
            home: String(m?.home ?? ''),
            away: String(m?.away ?? ''),
            kick_off: String(m?.kick_off ?? '0'),
            result: m?.result ?? null,
            match_prize_pool: readMatchPrizePoolPlanck(m).toString(),
            has_bets: Boolean(m?.has_bets),

            total_claimed: m?.total_claimed != null ? String(m.total_claimed) : undefined,
            total_winner_stake: m?.total_winner_stake != null ? String(m.total_winner_stake) : undefined,
            settlement_prepared: m?.settlement_prepared != null ? Boolean(m.settlement_prepared) : undefined,
            dust_swept: m?.dust_swept != null ? Boolean(m.dust_swept) : undefined,
          }))
        : [];

      const phaseList: PhaseConfig[] = Array.isArray(state?.phases)
        ? state.phases.map((p: any) => ({
            name: String(p?.name ?? ''),
            start_time: String(p?.start_time ?? '0'),
            end_time: String(p?.end_time ?? '0'),
            points_weight: Number(p?.points_weight ?? 1),
          }))
        : [];

      setMatches(list);
      setPhases(phaseList);
    } catch (e) {
      console.error('Failed to fetch state context', e);
      setMatches([]);
      setPhases([]);
    }
  }, [api, isApiReady, hasProgramId, programId]);

  const fetchBets = useCallback(async () => {
    if (!api || !isApiReady || !accountHex || !hasProgramId) {
      setBets([]);
      setErrMsg(hasProgramId ? null : 'BolaoCore program is not configured');
      return;
    }

    setLoading(true);
    setErrMsg(null);

    try {
      const svc = new Service(new Program(api, programId));
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
      const result = mergeBetsByMatchId(results);

      const parsed: ContractUserBetView[] = (result ?? []).map((v: any) => ({
        match_id: Number(v?.match_id ?? 0),
        score: { home: Number(v?.score?.home ?? 0) || 0, away: Number(v?.score?.away ?? 0) || 0 },
        penalty_winner: v?.penalty_winner ?? null,
        stake_in_match_pool: v?.stake_in_match_pool ?? 0,
        freebet_principal: v?.freebet_principal ?? 0,
        claimed: !!v?.claimed,
      }));

      parsed.sort((a, b) => Number(b.match_id) - Number(a.match_id));
      setBets(parsed);
    } catch (err) {
      console.error('Failed to fetch Predictions:', err);
      setBets([]);
      setErrMsg('Failed to fetch your Predictions');
      toast.error('Failed to fetch your Predictions');
    } finally {
      setLoading(false);
    }
  }, [api, isApiReady, accountHex, toast, hasProgramId, programId]);

  const fetchPoolStats = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/stats/pools`);
      if (!res.ok) throw new Error(`Pool stats request failed: ${res.status}`);
      const data = (await res.json()) as { pools?: MatchPoolStats[] };
      const next = new Map<string, MatchPoolStats>();

      for (const pool of data.pools ?? []) {
        if (!pool?.match_id) continue;
        next.set(String(pool.match_id), {
          match_id: String(pool.match_id),
          home_planck: String(pool.home_planck ?? '0'),
          draw_planck: String(pool.draw_planck ?? '0'),
          away_planck: String(pool.away_planck ?? '0'),
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

  const fetchPendingRefund = useCallback(async () => {
    if (!api || !isApiReady || !accountHex || !hasProgramId) {
      setPendingRefund(0n);
      return;
    }
    try {
      const svc = new Service(new Program(api, programId));
      const raw = await (svc as any).queryPendingRefund(accountHex);
      setPendingRefund(toBn(raw));
    } catch (e) {
      console.error('Failed to fetch pending refund', e);
      setPendingRefund(0n);
    }
  }, [api, isApiReady, accountHex, hasProgramId, programId]);

  useEffect(() => {
    if (isApiReady) void fetchState();
  }, [isApiReady, fetchState]);

  useEffect(() => {
    void fetchPoolStats();
  }, [fetchPoolStats]);

  useEffect(() => {
    if (account && isApiReady) {
      void fetchBets();
      void fetchPendingRefund();
      void fetchPoolStats();
    }
  }, [account, isApiReady, fetchBets, fetchPendingRefund, fetchPoolStats]);

  useEffect(() => {
    const refreshPredictions = () => {
      if (!account || !isApiReady) return;
      void fetchBets();
      void fetchState();
      void fetchPoolStats();
      window.setTimeout(() => {
        void fetchBets();
        void fetchState();
        void fetchPoolStats();
      }, 1200);
    };

    window.addEventListener(PREDICTION_PLACED_EVENT, refreshPredictions);
    window.addEventListener('focus', refreshPredictions);
    return () => {
      window.removeEventListener(PREDICTION_PLACED_EVENT, refreshPredictions);
      window.removeEventListener('focus', refreshPredictions);
    };
  }, [account, isApiReady, fetchBets, fetchState, fetchPoolStats]);

  const connected = !!account || previewPredictions;

  const matchById = useMemo(() => {
    const map = new Map<string, MatchInfo>();
    for (const m of visibleMatches) {
      const id = String(m.match_id ?? '').trim();
      if (id) map.set(id, m);
    }
    return map;
  }, [visibleMatches]);

  const staleBetsCount = useMemo(
    () => visibleBets.filter((b) => !matchById.has(String(b.match_id))).length,
    [visibleBets, matchById],
  );

  const tabCounts = useMemo(() => {
    const all = visibleMatches;
    return {
      leagues: all.filter((m) => !isWCPhase(m.phase)).length,
      worldcup: all.filter((m) => isWCPhase(m.phase)).length,
    };
  }, [visibleMatches]);

  const predictionCounts = useMemo(() => {
    const all = visibleBets;
    const leagues = all.filter((b) => {
      const phase = matchById.get(String(b.match_id))?.phase;
      if (phase === undefined) return false;
      return !isWCPhase(phase);
    }).length;
    const worldcup = all.filter((b) => {
      const phase = matchById.get(String(b.match_id))?.phase;
      if (phase === undefined) return false;
      return isWCPhase(phase);
    }).length;
    return { leagues, worldcup };
  }, [visibleBets, matchById]);

  const activeTournamentTabs = useMemo(() => TOURNAMENT_TAB_ORDER
    .map((tournament) => ({
      ...tournament,
      count: predictionCounts[tournament.key],
      availableCount: tabCounts[tournament.key],
    }))
    .filter((item) => item.availableCount > 0), [predictionCounts, tabCounts]);

  const availableTournamentKeys = useMemo(
    () => activeTournamentTabs.map((item) => item.key),
    [activeTournamentTabs]
  );
  const [tab, setTab] = useTournamentSelection(availableTournamentKeys);

  useEffect(() => {
    setFilterStage('');
  }, [tab]);

  // Unique phases for filter dropdown
  const availablePhases = useMemo(() => {
    const set = new Set<string>();
    for (const m of visibleMatches) {
      const isActiveTournament = tab === 'worldcup' ? isWCPhase(m.phase) : !isWCPhase(m.phase);
      if (!isActiveTournament) continue;
      if (m.phase) set.add(m.phase);
    }
    return Array.from(set).sort();
  }, [visibleMatches, tab]);

  const wcBets = useMemo(() => {
    let list = visibleBets as ContractUserBetView[];
    const isClaimed = (bet: ContractUserBetView) =>
      !!bet.claimed || !!claimedOverrideByMatch[Number(bet.match_id)];

    // Text search
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((b) => {
        const pick = `${b.score.home}-${b.score.away}`;
        const m = matchById.get(String(b.match_id));
        const teams = m ? `${m.home} ${m.away}` : '';
        const s = `#${String(b.match_id)} ${teams} ${pick} ${b.claimed ? 'claimed' : 'pending'}`.toLowerCase();
        return s.includes(q);
      });
    }

    // Stage filter
    if (filterStage) {
      list = list.filter((b) => {
        const m = matchById.get(String(b.match_id));
        return m?.phase === filterStage;
      });
    }

    // Date filter
    if (filterDate) {
      list = list.filter((b) => {
        const m = matchById.get(String(b.match_id));
        if (!m) return false;
        const n = Number(m.kick_off);
        if (!n) return false;
        const ms = n < 10_000_000_000 ? n * 1000 : n;
        return new Date(ms).toISOString().slice(0, 10) === filterDate;
      });
    }

    // Status filter
    if (filterStatus === 'claimed') {
      list = list.filter((b) => isClaimed(b));
    } else if (filterStatus === 'pending') {
      list = list.filter((b) => {
        if (isClaimed(b)) return false;
        const m = matchById.get(String(b.match_id));
        if (!m) return false;
        if (isCancelledMatch(m.result)) return false;
        return !isMatchFinal(m.result) || !m.settlement_prepared;
      });
    } else if (filterStatus === 'eligible') {
      list = list.filter((b) => {
        if (isClaimed(b)) return false;
        const m = matchById.get(String(b.match_id));
        if (!m || !isMatchFinal(m.result)) return false;
        if (!m.settlement_prepared) return false;
        const betPenalty = parsePenaltyWinner(b.penalty_winner);
        const { score: finalScore, penaltyWinner: finalPenalty } = getFinalizedResult(m.result);
        const phaseWeight = getPhaseWeight(m.phase, visiblePhases);
        return eligibleForPayout(b.score, betPenalty, finalScore, finalPenalty, phaseWeight);
      });
    } else if (filterStatus === 'not_eligible') {
      list = list.filter((b) => {
        if (isClaimed(b)) return false;
        const m = matchById.get(String(b.match_id));
        if (!m || !isMatchFinal(m.result)) return false;
        if (!m.settlement_prepared) return false;
        const betPenalty = parsePenaltyWinner(b.penalty_winner);
        const { score: finalScore, penaltyWinner: finalPenalty } = getFinalizedResult(m.result);
        const phaseWeight = getPhaseWeight(m.phase, visiblePhases);
        return !eligibleForPayout(b.score, betPenalty, finalScore, finalPenalty, phaseWeight);
      });
    }

    // Sort
    if (sortField === 'date') {
      list = [...list].sort((a, b) => {
        const ma = matchById.get(String(a.match_id));
        const mb = matchById.get(String(b.match_id));
        return Number(ma?.kick_off ?? 0) - Number(mb?.kick_off ?? 0);
      });
    } else if (sortField === 'az') {
      list = [...list].sort((a, b) => {
        const ma = matchById.get(String(a.match_id));
        const mb = matchById.get(String(b.match_id));
        return (`${ma?.home ?? ''} ${ma?.away ?? ''}`).localeCompare(`${mb?.home ?? ''} ${mb?.away ?? ''}`);
      });
    } else if (sortField === 'za') {
      list = [...list].sort((a, b) => {
        const ma = matchById.get(String(a.match_id));
        const mb = matchById.get(String(b.match_id));
        return (`${mb?.home ?? ''} ${mb?.away ?? ''}`).localeCompare(`${ma?.home ?? ''} ${ma?.away ?? ''}`);
      });
    } else {
      // Default: match #
      list = [...list].sort((a, b) => Number(a.match_id) - Number(b.match_id));
    }

    // Tab filter
    list = list.filter((b) => {
      const m = matchById.get(String(b.match_id));
      if (!m) return false;
      const phase = m.phase ?? '';
      return tab === 'worldcup' ? isWCPhase(phase) : !isWCPhase(phase);
    });

    return list;
  }, [visibleBets, search, matchById, filterStage, filterDate, sortField, filterStatus, visiblePhases, tab]);

  const claim = useCallback(
    async (matchId: number) => {
      if (!api || !isApiReady || !account || !hasProgramId) return;

      setClaimingByMatch((p) => ({ ...p, [matchId]: true }));
      try {
        const injector = await web3FromSource(account.meta.source);

        // Factory reconstructs svc+tx fresh on every call (required for voucher retry)
        const txFactory: TxFactory = () =>
          (new Service(new Program(api, programId)) as any).claimMatchReward(matchId);

        const { blockHash, response } = await withVoucherSignAndSend({
          txFactory,
          account: account.decodedAddress,
          signerOptions: { signer: injector.signer },
          value: 0n,
          ensureVoucher,
          invalidateVoucher,
          calculateGas: (tx) => tx.calculateGas(false, 50),
        });

        toast.info(`Transaction included in block ${blockHash}`);
        await response();

        setBets((current) =>
          (current ?? []).map((bet) =>
            Number(bet.match_id) === matchId ? { ...bet, claimed: true } : bet,
          ),
        );
        setClaimedOverrideByMatch((current) => ({ ...current, [matchId]: true }));
        window.dispatchEvent(new Event(FREEBET_BALANCE_CHANGED_EVENT));
        toast.success('Claim completed!');
        await fetchState();
        await fetchPoolStats();
        window.setTimeout(() => {
          void fetchBets();
          void fetchState();
          window.dispatchEvent(new Event(FREEBET_BALANCE_CHANGED_EVENT));
        }, 1200);
      } catch (e: any) {
        console.error('Claim failed', e);
        toast.error(e?.message ?? 'Claim failed');
      } finally {
        setClaimingByMatch((p) => ({ ...p, [matchId]: false }));
      }
    },
    [api, isApiReady, account, toast, fetchBets, fetchState, fetchPoolStats, hasProgramId, programId, ensureVoucher, invalidateVoucher],
  );

  const claimRefund = useCallback(async () => {
    if (!api || !isApiReady || !account || !hasProgramId) return;
    if (pendingRefund <= 0n) return;

    setClaimingRefund(true);
    try {
      const injector = await web3FromSource(account.meta.source);

      const txFactory: TxFactory = () =>
        (new Service(new Program(api, programId)) as any).claimRefund();

      const { blockHash, response } = await withVoucherSignAndSend({
        txFactory,
        account: account.decodedAddress,
        signerOptions: { signer: injector.signer },
        value: 0n,
        ensureVoucher,
        invalidateVoucher,
        // uses default calculateGas() — no extra params
      });

      toast.info(`Refund tx included in block ${blockHash}`);
      await response();

      toast.success('Refund claimed!');
      await fetchPendingRefund();
      await fetchBets();
      await fetchState();
      await fetchPoolStats();
    } catch (e: any) {
      console.error('Refund claim failed', e);
      toast.error(e?.message ?? 'Refund claim failed');
    } finally {
      setClaimingRefund(false);
    }
  }, [api, isApiReady, account, pendingRefund, toast, fetchPendingRefund, fetchBets, fetchState, fetchPoolStats, hasProgramId, programId, ensureVoucher, invalidateVoucher]);

  return (
    <div className="mpShell">
      <div className="mpBg" aria-hidden="true" />

      <header className="mpTop">
        <div className="mpTop__row">
          <div className="mpTitle">
            <h1>My Predictions</h1>
            <p>Potential Winnings is an estimate and becomes exact once the match is finalized + settled.</p>
          </div>

          <div className="mpTop__right">
            <div className="mpSearch" role="search">
              <PiMagnifyingGlassBold className="mpSearch__icon" aria-hidden="true" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search teams, match ID, status..."
                aria-label="Search predictions"
              />
            </div>

            <div className="mpWalletWrap">
              <StyledWallet />
            </div>
          </div>
        </div>

        {activeTournamentTabs.length > 0 ? (
          <div className="mpTabs" role="tablist" aria-label="Tournament tabs">
            {activeTournamentTabs.map((item) => (
              <button
                key={item.key}
                className={'mpTab ' + (tab === item.key ? 'is-active' : '')}
                onClick={() => { setTab(item.key); setFilterStage(''); }}
                type="button"
                role="tab"
                aria-selected={tab === item.key}>
                {item.label} ({item.count})
              </button>
            ))}
          </div>
        ) : null}

        <div className="mpInfoGrid" aria-label="Prediction rules summary">
          <div className="mpInfoCard">
            <span>Prediction window</span>
            <strong>Locks 10 min before kickoff</strong>
          </div>
          <div className="mpInfoCard">
            <span>Prize split</span>
            <strong>Wallet: 85% pool; freebet: 100% pool</strong>
          </div>
          <div className="mpInfoCard">
            <span>Settlement</span>
            <strong>All payouts are settled on-chain</strong>
          </div>
          <div className="mpInfoCard mpInfoCard--live">
            <span>Status</span>
            <strong>Live data</strong>
          </div>
        </div>

        <div className="mpFilters">
          <div className="mpFilters__right">
            <label className="mpFilterField">
              <span>Sort</span>
              <span className="mpSelectWrap">
                <select
                  className="mpFilterSelect"
                  value={sortField}
                  onChange={(e) => setSortField(e.target.value as 'match_id' | 'date' | 'az' | 'za')}
                  aria-label="Sort predictions">
                  <option value="match_id">Match number</option>
                  <option value="date">Kickoff date</option>
                  <option value="az">Teams A to Z</option>
                  <option value="za">Teams Z to A</option>
                </select>
                <PiCaretDownBold className="mpSelectChevron" aria-hidden="true" />
              </span>
            </label>

            <label className="mpFilterField">
              <span>Status</span>
              <span className="mpSelectWrap">
                <select
                  className="mpFilterSelect"
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value as '' | 'claimed' | 'pending' | 'eligible' | 'not_eligible')}
                  aria-label="Filter by status">
                  <option value="">Any status</option>
                  <option value="claimed">Claimed</option>
                  <option value="pending">Pending</option>
                  <option value="eligible">Ready to claim</option>
                  <option value="not_eligible">Not eligible</option>
                </select>
                <PiCaretDownBold className="mpSelectChevron" aria-hidden="true" />
              </span>
            </label>

            <label className="mpFilterField">
              <span>Stage</span>
              <span className="mpSelectWrap">
                <select
                  className="mpFilterSelect"
                  value={filterStage}
                  onChange={(e) => setFilterStage(e.target.value)}
                  aria-label="Filter by stage">
                  <option value="">All stages</option>
                  {availablePhases.map((p) => (
                    <option key={p} value={p}>{p.replace(/_/g, ' ')}</option>
                  ))}
                </select>
                <PiCaretDownBold className="mpSelectChevron" aria-hidden="true" />
              </span>
            </label>

            {(filterStage || filterDate || filterStatus || search) && (
              <button
                className="mpBtn mpBtn--ghost mpBtn--icon"
                type="button"
                aria-label="Clear filters"
                title="Clear filters"
                onClick={() => { setFilterStage(''); setFilterDate(''); setFilterStatus(''); setSearch(''); }}>
                <PiEraserBold aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        {connected && pendingRefund > 0n ? (
          <div
            style={{
              marginTop: 12,
              padding: '12px 16px',
              borderRadius: 8,
              background: 'linear-gradient(90deg, rgba(255,200,0,0.18), rgba(255,140,0,0.18))',
              border: '1px solid rgba(255,180,0,0.45)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              flexWrap: 'wrap',
            }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600 }}>
                Refund available: {formatAmount(pendingRefund, 12)} VARA
              </div>
              <div style={{ fontSize: 12, opacity: 0.8 }}>
                One or more matches you bet on were cancelled. Claim your refund (85% of each cancelled bet's stake).
              </div>
            </div>
            <button
              type="button"
              className="mpClaim is-ready"
              disabled={claimingRefund}
              onClick={() => void claimRefund()}>
              {claimingRefund ? 'Claiming…' : 'Claim refund'}
            </button>
          </div>
        ) : null}
      </header>

      <div className="mpSection">
        <div className="mpSection__title">
          <div className="mpSection__main">{getTournamentByKey(tab).sectionLabel}</div>
          <div className="mpSection__sub">{getTournamentByKey(tab).emptyLabel}</div>
        </div>

        {!connected ? (
          <div className="mpState mpState--error">Connect your wallet to see your predictions.</div>
        ) : loading ? (
          <div className="mpState">
            <span className="mpSpinner" aria-hidden="true" /> Loading predictions…
          </div>
        ) : errMsg ? (
          <div className="mpState mpState--error">{errMsg}</div>
        ) : (
          <section className="mpCard">
            {staleBetsCount > 0 ? (
              <div className="mpState mpState--error">
                {staleBetsCount} prediction record{staleBetsCount === 1 ? '' : 's'} could not be matched to the current fixture state.
              </div>
            ) : null}

            <div className="mpCard__head">
              <div className="mpCard__left">
                <span className="mpCup">🏆</span>
                <div className="mpCard__ttl">
                  <div className="t">{getTournamentByKey(tab).sectionLabel}</div>
                  <div className="s">{getTournamentByKey(tab).emptyLabel}</div>
                </div>
              </div>

              <div className="mpCard__right">
                <span className="mpMini">{`Total predictions: ${wcBets.length}`}</span>
              </div>
            </div>

            <div className="mpTable">
              <div className="mpTHead">
                <div>Match</div>
                <div className="num">Stake</div>
                <div className="center">Your Pick</div>
                <div className="num hideMd">Potential / Real</div>
                <div className="center">Status</div>
                <div className="center">Action</div>
              </div>

              <div className="mpTBody">
                {wcBets.length === 0 ? (
                  <div className="mpEmpty">No Predictions found for your account.</div>
                ) : (
                  wcBets.map((b, i) => {
                    const m = matchById.get(String(b.match_id));

                    const stakeBn = toBn(b.stake_in_match_pool);
                    const freebetPrincipalBn = toBn(b.freebet_principal ?? 0);
                    const stakeUsd = planckToUsd(stakeBn);

                    const pickText = `${b.score.home}-${b.score.away}`;
                    const betPenalty = parsePenaltyWinner(b.penalty_winner);

                    const home = m?.home ?? `Home`;
                    const away = m?.away ?? `Away`;
                    const phase = m?.phase ?? '—';
                    const kickoff = m?.kick_off ? formatKickoff(m.kick_off) : '—';
                    const supabasePoolStats = poolStatsByMatchId.get(String(b.match_id));
                    const supabaseMatchPoolBn = toBn(supabasePoolStats?.total_planck ?? 0);
                    const contractMatchPoolBn = toBn(m?.match_prize_pool ?? 0);
                    const matchPoolBn =
                      supabaseMatchPoolBn > contractMatchPoolBn ? supabaseMatchPoolBn : contractMatchPoolBn;
                    const poolHuman = matchPoolBn > 0n ? `${formatAmount(matchPoolBn, 12)} VARA` : m ? totalPoolVara(m) : '—';

                    const current = m ? getCurrentScore(m.result) : { home: 0, away: 0, tag: 'OPEN' as const };
                    const matchFinal = m ? isMatchFinal(m.result) : false;

                    const settlementPrepared = !!m?.settlement_prepared;
                    const totalWinnerStakeBn = toBn(m?.total_winner_stake ?? 0);
                    const predictedOutcome = predictionOutcomeKey(b.score);
                    const predictedOutcomePoolBn = poolForOutcome(supabasePoolStats, predictedOutcome);
                    const estimatedOutcomePoolBn =
                      predictedOutcomePoolBn > stakeBn ? predictedOutcomePoolBn : stakeBn;
                    const estimatedPayoutBn = estimatePayoutBn(stakeBn, estimatedOutcomePoolBn, matchPoolBn);
                    const estimatedWalletPayoutBn =
                      estimatedPayoutBn === null
                        ? null
                        : estimatedPayoutBn > freebetPrincipalBn
                          ? estimatedPayoutBn - freebetPrincipalBn
                          : 0n;

                    const phaseWeight = m ? getPhaseWeight(m.phase, visiblePhases) : 1;
                    const { score: finalScore, penaltyWinner: finalPenalty } = m ? getFinalizedResult(m.result) : {};

                    const eligible = matchFinal
                      ? eligibleForPayout(b.score, betPenalty, finalScore, finalPenalty, phaseWeight)
                      : false;

                    const realBn =
                      matchFinal && settlementPrepared && eligible
                        ? computeDeterministicShareBn(stakeBn, matchPoolBn, totalWinnerStakeBn)
                        : 0n;
                    const walletRealBn =
                      realBn > freebetPrincipalBn ? realBn - freebetPrincipalBn : 0n;

                    const potentialText = formatPrizeValue(estimatedWalletPayoutBn);

                    const displayValue =
                      matchFinal ? (eligible ? formatPrizeValue(walletRealBn) : '0 VARA') : potentialText;
                    const displayPlanck = matchFinal ? (eligible ? walletRealBn : 0n) : estimatedWalletPayoutBn;
                    const displayUsd = displayPlanck !== null ? planckToUsd(displayPlanck) : null;

                    const exactHit = matchFinal ? isExactScore(b.score, finalScore) : false;

                    const displaySub =
                      matchFinal
                        ? eligible
                          ? 'Real prize'
                          : 'Not eligible'
                        : estimatedPayoutBn === null
                          ? 'Potential syncing'
                          : freebetPrincipalBn > 0n
                            ? 'Potential net winnings'
                            : 'Potential at current pool';

                    const claimed = !!b.claimed || !!claimedOverrideByMatch[Number(b.match_id)];
                    const matchCancelled = m ? isCancelledMatch(m.result) : false;
                    const hasFreebetPrincipalToReturn = freebetPrincipalBn > 0n;
                    const canClaim =
                      matchFinal &&
                      settlementPrepared &&
                      eligible &&
                      !claimed &&
                      (realBn > 0n || hasFreebetPrincipalToReturn) &&
                      !matchCancelled;

                    const isClaiming = !!claimingByMatch[Number(b.match_id)];

                    const statusLabelText = matchCancelled
                      ? 'Cancelled'
                      : claimed
                        ? 'Claimed'
                        : canClaim
                          ? 'Ready to claim'
                          : matchFinal
                            ? 'Finalized'
                            : 'Pending';
                    const statusTone = matchCancelled
                      ? 'muted'
                      : claimed || canClaim
                        ? 'ok'
                        : matchFinal
                          ? 'final'
                          : 'muted';

                    const claimTitle = matchCancelled
                      ? 'Match cancelled — claim your refund from the banner above'
                      : claimed
                        ? 'Already claimed'
                        : !matchFinal
                          ? 'Match not finalized yet'
                          : !settlementPrepared
                            ? 'Settlement not prepared yet'
                            : !eligible
                              ? 'Not eligible'
                              : isClaiming
                                ? 'Claiming...'
                                : freebetPrincipalBn > 0n
                                  ? 'Return freebet principal and claim net winnings'
                                  : 'Claim your winnings';

                    return (
                      <div className="mpRow" key={`wc-${String(b.match_id)}-${i}`}>
                        <div className="mpMatch">
                          <div className="mpIdx">{i + 1}</div>

                          <div className="mpMatch__main">
                            <div className="mpTeams" title={`${home} vs ${away}`}>
                              <span className="mpTeam">
                                <TeamFlag className="mpFlag" team={home} />
                                <span className="mpName">{home}</span>
                              </span>

                              <span className="mpVs">vs</span>

                              <span className="mpTeam mpTeam--right">
                                <span className="mpName">{away}</span>
                                <TeamFlag className="mpFlag" team={away} />
                              </span>

                              <span className={'mpTag mpTag--' + current.tag.toLowerCase()}>{current.tag}</span>
                            </div>

                            <div className="mpMeta">
                              <span className="mpChip">#{String(b.match_id)}</span>
                              <span className="mpChip">{phase}</span>
                              <span className="mpChip">Kickoff: {kickoff}</span>
                              <span className="mpChip">Pool: {poolHuman}</span>
                              <span className={'mpChip ' + (current.tag !== 'OPEN' ? 'mpChip--result' : '')}>
                                Result: <b>{current.tag !== 'OPEN' ? `${current.home}-${current.away}` : 'TBD'}</b>
                              </span>

                              {betPenalty ? <span className="mpChip">Penalty pick: {betPenalty}</span> : null}

                              {matchFinal ? (
                                <>
                                  {finalPenalty ? <span className="mpChip">Final pens: {finalPenalty}</span> : null}

                                  <span className={'mpChip ' + (eligible ? 'is-good' : 'is-bad')}>
                                    Eligibility:{' '}
                                    <b>{eligible ? (exactHit ? 'Eligible (exact)' : 'Eligible (outcome)') : 'Not eligible'}</b>
                                  </span>

                                  <span className={'mpChip ' + (settlementPrepared ? 'is-good' : '')}>
                                    Settlement: <b>{settlementPrepared ? 'Ready' : 'Not prepared'}</b>
                                  </span>
                                </>
                              ) : null}
                            </div>
                          </div>
                        </div>

                        <div className="mpNum">
                          <div className="mpNum__main">
                            {formatStakeValue(stakeBn)} VARA
                          </div>
                          {stakeUsd ? <div className="mpNum__usd">{stakeUsd}</div> : null}
                          <div className="mpNum__sub">Match pool stake</div>
                        </div>

                        <div className="mpPick">
                          <div className="mpPick__label">YOUR PICK</div>
                          <div className="mpPick__score">{pickText}</div>
                          <div className="mpPick__hint">Score / outcome</div>
                        </div>

                        <div className="mpWin hideMd">
                          <div className="mpWin__main">{displayValue}</div>
                          {displayUsd ? <div className="mpWin__usd">{displayUsd}</div> : null}
                          <div className="mpWin__sub">{displaySub}</div>
                        </div>

                        <div className="mpCenter">
                          <span className={'mpStatus mpStatus--' + statusTone}>{statusLabelText}</span>
                        </div>

                        <div className="mpCenter">
                          <button
                            className={'mpClaim ' + (canClaim ? 'is-ready' : '')}
                            disabled={!canClaim || isClaiming || matchCancelled}
                            title={claimTitle}
                            onClick={() => claim(Number(b.match_id))}
                            type="button">
                            <span className="mpClaim__dot" aria-hidden="true" />
                            {isClaiming
                              ? 'Claiming…'
                              : matchCancelled
                                ? 'Refund'
                                : claimed
                                  ? 'Claimed'
                                  : hasFreebetPrincipalToReturn && walletRealBn <= 0n
                                    ? 'Return freebet'
                                  : 'Claim'}
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="mpCard__foot">
              <span className="mpMini">Tip: In knockout, “outcome” means who advances. In draws, penalties decide it.</span>
            </div>
          </section>
        )}
      </div>
    </div>
  );
};
