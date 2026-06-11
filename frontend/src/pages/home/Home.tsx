import React, { useCallback, useEffect, useMemo, useState } from 'react';
import './dashboard.css';
import { useAccount, useApi } from '@gear-js/react-hooks';
import { useToast } from '@/hooks/useToast';
import { web3Enable, web3FromSource } from '@polkadot/extension-dapp';
import { decodeAddress } from '@polkadot/util-crypto';
import { u8aToHex } from '@polkadot/util';
import { HexString } from '@gear-js/api';
import { TransactionBuilder } from 'sails-js';
import { useGaslessVoucher, withVoucherSignAndSend, TxFactory } from '@/hooks/useGaslessVoucher';
import { Program as CoreProgram, Service as CoreService } from '@/hocs/lib';
import { Program as DaoProgram, Service as DaoService } from '@/hocs/dao';
import { TeamFlag } from '@/components/common/TeamFlag';
import { StyledWallet } from '@/components/wallet/Wallet';
import { useTournamentSelection } from '@/hooks/useTournamentSelection';
import { useNavigate } from 'react-router-dom';
import {
  TOURNAMENT_TAB_ORDER,
  WORLD_CUP_2026_TOURNAMENT,
  getTournamentByKey,
  isWCPhase,
  matchPath,
} from '@/utils';

const CORE_PROGRAM_ID = import.meta.env.VITE_BOLAOCOREPROGRAM as string;
const DAO_PROGRAM_ID = import.meta.env.VITE_DAOPROGRAM as string;
const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000';

const VARA_DECIMALS = 12;

type CoreMatch = {
  match_id: number | string;
  phase: string;
  home: string;
  away: string;
  kick_off: number;
  result: any;
  total_pool: string | number | bigint;
  pool_home?: string | number | bigint;
  pool_draw?: string | number | bigint;
  pool_away?: string | number | bigint;
  has_bets: boolean;
  participants: string[];
};

type CoreState = {
  admin: string;
  protocol_fee_accumulated: string | number | bigint;
  final_prize_accumulated: string | number | bigint;
  final_prize_finalized: boolean;
  final_prize_claimable_total: string | number | bigint;
  final_prize_rounding_dust: string | number | bigint;
  podium_finalized: boolean;
  r32_lock_time?: string | number | bigint | null;
  matches: CoreMatch[];
  phases: Array<{ name: string; start_time: number; end_time: number }>;
  user_points: Array<[string, number]>;
};

type DaoProposal = {
  id: number;
  proposer: `0x${string}`;
  kind: Record<string, any>;
  description: string;
  start_time: number;
  end_time: number;
  yes: number;
  no: number;
  abstain: number;
  status: string;
  executed: boolean;
};

type FinalPrizeClaimStatus = {
  wallet: string;
  final_prize_finalized: boolean;
  eligible: boolean;
  amount_claimable: string;
  already_claimed: boolean;
  points: number;
};

type ApiLeaderboardRow = {
  wallet_address: string;
  display_name?: string | null;
  matches_count: number;
  exact_count: number;
  outcome_count?: number;
  total_claimed_planck: string;
};


function shortHex(addr: string) {
  if (!addr) return '-';
  if (!addr.startsWith('0x') || addr.length < 16) return addr;
  return addr.slice(0, 6) + '…' + addr.slice(-4);
}

function toHexAddress(input?: string | null): `0x${string}` | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('0x')) return trimmed.toLowerCase() as `0x${string}`;
  try {
    const u8a = decodeAddress(trimmed);
    return u8aToHex(u8a).toLowerCase() as `0x${string}`;
  } catch {
    return null;
  }
}

function safeBigInt(input: unknown): bigint {
  try {
    if (typeof input === 'bigint') return input;
    if (typeof input === 'number') return BigInt(Math.trunc(input));
    if (typeof input === 'string') {
      const s = input.trim();
      if (!s) return 0n;
      return BigInt(s.replace(/,/g, ''));
    }
    return 0n;
  } catch {
    return 0n;
  }
}

function formatToken(val: string | number | bigint, decimals = VARA_DECIMALS) {
  const bn = safeBigInt(val);
  const divisor = BigInt(10) ** BigInt(decimals);
  const intVal = bn / divisor;
  const frac = (bn % divisor).toString().padStart(decimals, '0').replace(/0+$/, '');
  return frac ? `${intVal.toString()}.${frac}` : intVal.toString();
}

function formatTokenCompact(val: string | number | bigint, decimals = VARA_DECIMALS) {
  const raw = formatToken(val, decimals);
  const [i, f] = raw.split('.');
  const withCommas = i.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  if (!f) return withCommas;
  return `${withCommas}.${f.slice(0, 2)}`;
}

function kickOffToMs(input: number) {
  if (!input || !Number.isFinite(input)) return 0;
  return input < 10_000_000_000 ? input * 1000 : input;
}

function formatDate(msLike: number) {
  const ms = kickOffToMs(msLike);
  if (!ms) return '-';
  const d = new Date(ms);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function formatTime(msLike: number) {
  const ms = kickOffToMs(msLike);
  if (!ms) return '-';
  const d = new Date(ms);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function formatDateTime(msLike: number) {
  const ms = kickOffToMs(msLike);
  if (!ms) return '-';
  const d = new Date(ms);
  return (
    d.toLocaleDateString(undefined, { year: '2-digit', month: 'short', day: 'numeric' }) +
    ' ' +
    d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  );
}

function timeFromNow(msLike: number) {
  const ms = kickOffToMs(msLike);
  if (!ms) return '—';
  const diff = ms - Date.now();
  const abs = Math.abs(diff);
  const sec = Math.floor(abs / 1000);
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);
  const label = day > 0 ? `${day}d` : hr > 0 ? `${hr}h` : min > 0 ? `${min}m` : `${sec}s`;
  return diff >= 0 ? `in ${label}` : `${label} ago`;
}

function closesLabel(msLike: number) {
  const ms = kickOffToMs(msLike);
  if (!ms) return '—';
  const closesAt = ms - 10 * 60 * 1000;
  const diff = closesAt - Date.now();
  if (diff <= 0) return 'Closed';
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `Closes in ${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return `Closes in ${hrs}h ${rem}m`;
}

function isFinalized(m: CoreMatch) {
  return !!((m.result as any)?.finalized || (m.result as any)?.Finalized);
}

function matchPool(m: CoreMatch): bigint {
  const tp = safeBigInt((m as any)?.total_pool);
  if (tp > 0n) return tp;
  const legacy =
    safeBigInt((m as any)?.pool_home) + safeBigInt((m as any)?.pool_draw) + safeBigInt((m as any)?.pool_away);
  return legacy;
}

function sumAllMatchPools(matches: CoreMatch[]) {
  return matches.reduce((acc, m) => acc + matchPool(m), 0n);
}

function isZeroLikeAmount(value?: string | number | bigint | null) {
  if (value === null || value === undefined) return true;
  const raw = String(value).trim().toLowerCase();
  return raw === '' || raw === '0' || raw === '0x0';
}

function HomeTeamFlag({ team }: { team: string }) {
  return <TeamFlag team={team} className="h-flag" />;
}

export default function Home() {
  const { api, isApiReady } = useApi();
  const toast = useToast();
  const { account } = useAccount();
  const navigate = useNavigate();
  const { ensureVoucher, invalidateVoucher } = useGaslessVoucher(account?.decodedAddress);

  const myWalletHex = useMemo(() => {
    const addr = account?.decodedAddress ?? (account as any)?.address ?? null;
    return toHexAddress(addr);
  }, [account]);

  const [coreState, setCoreState] = useState<CoreState | null>(null);
  const [daoProposals, setDaoProposals] = useState<DaoProposal[]>([]);
  const [loading, setLoading] = useState(false);
  const [userBets, setUserBets] = useState<any[]>([]);
  const [claimStatus, setClaimStatus] = useState<FinalPrizeClaimStatus | null>(null);
  const [claimLoading, setClaimLoading] = useState(false);
  const [apiLeaderboardRow, setApiLeaderboardRow] = useState<ApiLeaderboardRow | null>(null);
  const [apiLeaderboardRows, setApiLeaderboardRows] = useState<ApiLeaderboardRow[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        await web3Enable('SmartCup Home');
      } catch {}
    })();
  }, []);

  const coreProgram = useMemo(() => {
    if (!api || !isApiReady) return null;
    if (!CORE_PROGRAM_ID) return null;
    return new CoreProgram(api, CORE_PROGRAM_ID as HexString);
  }, [api, isApiReady]);

  const daoProgram = useMemo(() => {
    if (!api || !isApiReady) return null;
    if (!DAO_PROGRAM_ID) return null;
    return new DaoProgram(api, DAO_PROGRAM_ID as HexString);
  }, [api, isApiReady]);

  const fetchCoreState = useCallback(async () => {
    if (!coreProgram) return;

    const svc = new CoreService(coreProgram);
    const s = (await svc.queryState()) as any;

    const matches: CoreMatch[] = (s?.matches ?? []).map((m: any) => ({
      match_id: m?.match_id ?? '',
      phase: String(m?.phase ?? ''),
      home: String(m?.home ?? ''),
      away: String(m?.away ?? ''),
      kick_off: Number(m?.kick_off ?? 0),
      result: m?.result ?? { unresolved: null },
      total_pool:
        m?.total_pool ??
        m?.match_prize_pool ??
        m?.pool ??
        m?.pool_total ??
        '0',
      pool_home: m?.pool_home ?? '0',
      pool_draw: m?.pool_draw ?? '0',
      pool_away: m?.pool_away ?? '0',
      has_bets: Boolean(m?.has_bets),
      participants: Array.isArray(m?.participants) ? m.participants.map(String) : [],
    }));

    const user_points: Array<[string, number]> = Array.isArray(s?.user_points)
      ? s.user_points.map(
          (it: any) => [String(it?.[0] ?? ''), Number(it?.[1] ?? 0)] as [string, number]
        )
      : [];

    setCoreState({
      admin: String(Array.isArray(s?.admins) ? (s.admins[0] ?? '') : (s?.admin ?? s?.owner ?? '')),
      protocol_fee_accumulated: s?.protocol_fee_accumulated ?? s?.fee_accum ?? '0',
      final_prize_accumulated: s?.final_prize_accumulated ?? s?.final_prize_accum ?? '0',
      final_prize_finalized: Boolean(s?.final_prize_finalized),
      final_prize_claimable_total: s?.final_prize_claimable_total ?? '0',
      final_prize_rounding_dust: s?.final_prize_rounding_dust ?? '0',
      podium_finalized: Boolean(s?.podium_finalized),
      matches,
      phases: Array.isArray(s?.phases)
        ? s.phases.map((p: any) => ({
            name: String(p?.name ?? ''),
            start_time: Number(p?.start_time ?? 0),
            end_time: Number(p?.end_time ?? 0),
          }))
        : [],
      user_points,
    });
  }, [coreProgram]);

  const fetchUserBets = useCallback(async () => {
    if (!coreProgram || !myWalletHex) {
      setUserBets([]);
      return;
    }

    try {
      const svc = new CoreService(coreProgram);
      const bets = (await (svc as any).queryBetsByUser(myWalletHex)) as any[];
      setUserBets(Array.isArray(bets) ? bets : []);
    } catch {
      setUserBets([]);
    }
  }, [coreProgram, myWalletHex]);

  const fetchFinalPrizeClaimStatus = useCallback(async () => {
    if (!coreProgram || !account) {
      setClaimStatus(null);
      return;
    }

    try {
      const svc = new CoreService(coreProgram);
      const status = (await (svc as any).queryFinalPrizeClaimStatus(account.decodedAddress)) as any;

      setClaimStatus({
        wallet: String(status?.wallet ?? ''),
        final_prize_finalized: Boolean(status?.final_prize_finalized),
        eligible: Boolean(status?.eligible),
        amount_claimable: status?.amount_claimable?.toString?.() ?? '0',
        already_claimed: Boolean(status?.already_claimed),
        points: Number(status?.points ?? 0),
      });
    } catch (e) {
      console.error(e);
      setClaimStatus(null);
    }
  }, [coreProgram, account]);

  const fetchApiLeaderboardRow = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/leaderboard?limit=2000`);
      if (!res.ok) {
        setApiLeaderboardRows([]);
        setApiLeaderboardRow(null);
        return;
      }

      const data = (await res.json()) as { rows?: ApiLeaderboardRow[] };
      const rows = data.rows ?? [];
      const row = myWalletHex
        ? rows.find((item) => item.wallet_address.toLowerCase() === myWalletHex.toLowerCase())
        : null;
      setApiLeaderboardRows(rows);
      setApiLeaderboardRow(row ?? null);
    } catch {
      setApiLeaderboardRows([]);
      setApiLeaderboardRow(null);
    }
  }, [myWalletHex]);

  const fetchDaoProposals = useCallback(async () => {
    if (!daoProgram) {
      setDaoProposals([]);
      return;
    }

    try {
      const svc = new DaoService(daoProgram);
      const ps = (await (svc as any).queryProposals()) as any[];

      const normalized: DaoProposal[] = Array.isArray(ps)
        ? ps.map((p: any) => ({
            id: Number(p?.id ?? 0),
            proposer: String(p?.proposer ?? '0x') as `0x${string}`,
            kind: (p?.kind ?? {}) as Record<string, any>,
            description: String(p?.description ?? ''),
            start_time: Number(p?.start_time ?? 0),
            end_time: Number(p?.end_time ?? 0),
            yes: Number(p?.yes ?? 0),
            no: Number(p?.no ?? 0),
            abstain: Number(p?.abstain ?? 0),
            status: String(p?.status ?? ''),
            executed: Boolean(p?.executed),
          }))
        : [];

      setDaoProposals(normalized);
    } catch (error) {
      console.warn('[Home] Failed to load DAO proposals', error);
      setDaoProposals([]);
    }
  }, [daoProgram]);

  const fetchAll = useCallback(async () => {
    if (!isApiReady) return;

    setLoading(true);
    try {
      await Promise.all([
        fetchCoreState().catch((error) => {
          console.error('[Home] Failed to load BolaoCore state', error);
          throw error;
        }),
        fetchDaoProposals(),
        fetchUserBets(),
        fetchFinalPrizeClaimStatus(),
        fetchApiLeaderboardRow(),
      ]);
    } catch (e) {
      console.error(e);
      toast.error('Failed to load home data');
    } finally {
      setLoading(false);
    }
  }, [
    isApiReady,
    fetchCoreState,
    fetchDaoProposals,
    fetchUserBets,
    fetchFinalPrizeClaimStatus,
    fetchApiLeaderboardRow,
    toast,
  ]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const tournamentCounts = useMemo(() => {
    const matches = coreState?.matches ?? [];
    return {
      leagues: matches.filter((m) => !isWCPhase(m.phase)).length,
      worldcup: matches.filter((m) => isWCPhase(m.phase)).length,
    };
  }, [coreState?.matches]);

  const homeTournamentTabs = useMemo(() => TOURNAMENT_TAB_ORDER
    .map((tournament) => ({ ...tournament, count: tournamentCounts[tournament.key] }))
    .filter((tournament) => tournament.count > 0), [tournamentCounts]);

  const availableTournamentKeys = useMemo(
    () => homeTournamentTabs.map((tournament) => tournament.key),
    [homeTournamentTabs]
  );
  const [activeTournamentKey, setActiveTournamentKey] = useTournamentSelection(
    availableTournamentKeys.length ? availableTournamentKeys : [WORLD_CUP_2026_TOURNAMENT.key]
  );

  const activeTournament = getTournamentByKey(activeTournamentKey);
  const tournamentName = activeTournament.label;

  const activeMatches = useMemo(() => {
    const matches = coreState?.matches ?? [];
    return activeTournamentKey === 'worldcup'
      ? matches.filter((m) => isWCPhase(m.phase))
      : matches.filter((m) => !isWCPhase(m.phase));
  }, [activeTournamentKey, coreState?.matches]);

  const sortedLeaderboard = useMemo(() => {
    const pointsMap = new Map<string, number>();
    for (const [wallet, points] of coreState?.user_points ?? []) {
      const key = String(wallet ?? '').toLowerCase();
      if (key) pointsMap.set(key, Number(points ?? 0));
    }

    const matchCountMap = new Map<string, number>();
    for (const match of activeMatches) {
      for (const participant of match.participants ?? []) {
        const key = String(participant ?? '').toLowerCase();
        if (!key) continue;
        matchCountMap.set(key, (matchCountMap.get(key) ?? 0) + 1);
        if (!pointsMap.has(key)) pointsMap.set(key, 0);
      }
    }

    const apiStatsMap = new Map<string, ApiLeaderboardRow>();
    for (const row of apiLeaderboardRows) {
      const key = String(row.wallet_address ?? '').toLowerCase();
      if (key) apiStatsMap.set(key, row);
    }

    const wallets = new Set<string>();
    for (const wallet of pointsMap.keys()) {
      if (!activeMatches.length || matchCountMap.has(wallet)) wallets.add(wallet);
    }
    for (const wallet of matchCountMap.keys()) wallets.add(wallet);
    if (!wallets.size) {
      for (const wallet of apiStatsMap.keys()) wallets.add(wallet);
    }

    return Array.from(wallets)
      .map((wallet) => {
        const apiRow = apiStatsMap.get(wallet);
        return {
          wallet,
          displayName: apiRow?.display_name ?? null,
          points: pointsMap.get(wallet) ?? 0,
          matches: activeMatches.length ? matchCountMap.get(wallet) ?? 0 : apiRow?.matches_count ?? 0,
          exact: apiRow?.exact_count ?? 0,
          outcomes: apiRow?.outcome_count ?? 0,
        };
      })
      .sort((a, b) => (b.points !== a.points ? b.points - a.points : a.wallet.localeCompare(b.wallet)));
  }, [activeMatches, apiLeaderboardRows, coreState?.user_points]);

  const myRankInfo = useMemo(() => {
    const totalPlayers = sortedLeaderboard.length;
    if (!myWalletHex) return { rank: null as number | null, points: 0, totalPlayers };
    const idx = sortedLeaderboard.findIndex((x) => x.wallet.toLowerCase() === myWalletHex.toLowerCase());
    return { rank: idx >= 0 ? idx + 1 : null, points: idx >= 0 ? sortedLeaderboard[idx].points : 0, totalPlayers };
  }, [sortedLeaderboard, myWalletHex]);

  const distanceToNext = useMemo(() => {
    if (!myWalletHex || !myRankInfo.rank) {
      return null as null | { targetRank: number; targetAddr: string; gap: number };
    }

    const idx = myRankInfo.rank - 1;
    const above = sortedLeaderboard[idx - 1];
    if (!above) return null;

    const gap = Math.max(0, (above.points ?? 0) - (myRankInfo.points ?? 0));
    return { targetRank: idx, targetAddr: above.wallet, gap };
  }, [sortedLeaderboard, myWalletHex, myRankInfo.rank, myRankInfo.points]);

  const poolsInfo = useMemo(() => {
    const matches = activeMatches;
    const allPoolsBn = matches.length ? sumAllMatchPools(matches) : 0n;
    const finalPrizeBn = safeBigInt(coreState?.final_prize_accumulated ?? 0);
    const feeBn = safeBigInt(coreState?.protocol_fee_accumulated ?? 0);
    const withBets = matches.filter((m) => m.has_bets).length;
    const totalPredictions = matches.reduce((acc, m) => acc + (m.participants?.length ?? 0), 0);

    return {
      allPoolsText: formatTokenCompact(allPoolsBn),
      finalPrizeText: formatTokenCompact(finalPrizeBn),
      feeText: formatTokenCompact(feeBn),
      matchesWithBets: withBets,
      totalMatches: matches.length,
      totalPredictions,
    };
  }, [activeMatches, coreState]);

  const finalizedMatches = useMemo(() => {
    return activeMatches
      .filter((m) => isFinalized(m))
      .sort((a, b) => kickOffToMs(Number(b.kick_off)) - kickOffToMs(Number(a.kick_off)));
  }, [activeMatches]);

  const lastMatch = finalizedMatches[0] ?? null;

  const lastMatchLine = useMemo(() => {
    if (!lastMatch) return '—';
    const date = formatDate(Number(lastMatch.kick_off));
    const time = formatTime(Number(lastMatch.kick_off));
    return `${lastMatch.home} vs ${lastMatch.away} · ${date} ${time}`;
  }, [lastMatch]);

  const upcoming = useMemo(() => {
    return activeMatches
      .filter((m) => !isFinalized(m))
      .sort((a, b) => kickOffToMs(Number(a.kick_off)) - kickOffToMs(Number(b.kick_off)));
  }, [activeMatches]);

  const activeMatchIds = useMemo(
    () => new Set(activeMatches.map((m) => String(m.match_id))),
    [activeMatches]
  );

  const activeUserBets = useMemo(
    () => userBets.filter((b) => activeMatchIds.has(String(b?.match_id ?? ''))),
    [activeMatchIds, userBets]
  );

  const predictedMatchIds = useMemo(
    () => new Set(activeUserBets.map((b) => String(b?.match_id ?? ''))),
    [activeUserBets]
  );

  const nextMatch = useMemo(() => {
    const unpredicted = upcoming.filter((m) => !predictedMatchIds.has(String(m.match_id)));
    return unpredicted[0] ?? upcoming[0] ?? null;
  }, [upcoming, predictedMatchIds]);

  const nextMatchAlreadyPredicted = nextMatch
    ? predictedMatchIds.has(String(nextMatch.match_id))
    : false;

  const displayedUpcomingMatches = useMemo(() => {
    const unpredicted = upcoming.filter((m) => !predictedMatchIds.has(String(m.match_id)));
    return unpredicted.length ? unpredicted.slice(0, 4) : upcoming.slice(0, 1);
  }, [predictedMatchIds, upcoming]);

  const userPredStats = useMemo(() => {
    if (!account || !activeUserBets.length || !activeMatches.length) {
      return { made: 0, exactResults: 0, correctOutcomes: 0 };
    }

    let exact = 0;
    let outcome = 0;

    for (const b of activeUserBets) {
      const mid = String(b?.match_id ?? '');
      const m = activeMatches.find((x) => String(x.match_id) === mid);
      if (!m) continue;

      const fin = (m.result as any)?.Finalized ?? (m.result as any)?.finalized;
      if (!fin?.score) continue;

      const fs = { home: Number(fin.score.home ?? 0), away: Number(fin.score.away ?? 0) };
      const bs = { home: Number(b?.score?.home ?? 0), away: Number(b?.score?.away ?? 0) };

      if (bs.home === fs.home && bs.away === fs.away) {
        exact++;
        outcome++;
        continue;
      }

      const fOut = fs.home > fs.away ? 1 : fs.home < fs.away ? -1 : 0;
      const bOut = bs.home > bs.away ? 1 : bs.home < bs.away ? -1 : 0;

      if (fOut !== 0 && bOut === fOut) outcome++;
    }

    return { made: activeUserBets.length, exactResults: exact, correctOutcomes: outcome };
  }, [account, activeUserBets, activeMatches]);

  const totalEarnedText = useMemo(() => {
    if (!account) return '—';
    if (!apiLeaderboardRow) return '—';
    return formatTokenCompact(apiLeaderboardRow.total_claimed_planck ?? '0', VARA_DECIMALS);
  }, [account, apiLeaderboardRow]);

  const governance = useMemo(() => {
    const active = daoProposals.filter((p) => (p.status ?? '').toLowerCase() === 'active');
    const last = [...daoProposals].sort((a, b) => b.id - a.id)[0] ?? null;
    return { activeCount: active.length, last };
  }, [daoProposals]);

  const leaderboardTop = useMemo(() => {
    return sortedLeaderboard.slice(0, 10).map((r, idx) => ({
      rank: idx + 1,
      full: r.wallet,
      label: r.displayName ?? shortHex(r.wallet),
      points: r.points,
      matches: r.matches,
      exact: r.exact,
      outcomes: r.outcomes,
    }));
  }, [sortedLeaderboard]);

  const usdcLabel = 'VARA';

  const nextMatchCloses = useMemo(() => {
    if (!nextMatch) return '—';
    return closesLabel(Number(nextMatch.kick_off));
  }, [nextMatch]);

  const championshipPickState = 'waiting';
  const championshipPickSubtext = 'Available after the first Round of 32 match is defined.';

  const claimablePrizeBn = useMemo(
    () => safeBigInt(claimStatus?.amount_claimable ?? 0),
    [claimStatus]
  );

  const claimablePrizeText = useMemo(
    () => formatTokenCompact(claimStatus?.amount_claimable ?? 0, VARA_DECIMALS),
    [claimStatus]
  );

  const canClaimPrize = useMemo(() => {
    return (
      !!account &&
      !!claimStatus &&
      claimStatus.final_prize_finalized &&
      claimStatus.eligible &&
      !claimStatus.already_claimed &&
      !isZeroLikeAmount(claimStatus.amount_claimable) &&
      claimablePrizeBn > 0n &&
      !claimLoading
    );
  }, [account, claimStatus, claimablePrizeBn, claimLoading]);

  const claimPrizeStatusText = useMemo(() => {
    if (!account) return 'Connect wallet';
    if (!claimStatus) return 'Checking...';
    if (!claimStatus.final_prize_finalized) return 'Pending';
    if (claimStatus.already_claimed) return 'Claimed';
    if (!claimStatus.eligible) return 'Not eligible';
    if (isZeroLikeAmount(claimStatus.amount_claimable) || claimablePrizeBn === 0n) return 'No prize';
    return 'Eligible';
  }, [account, claimStatus, claimablePrizeBn]);

  const claimPrizeMessage = useMemo(() => {
    if (!account) return 'Connect your wallet to view your available prize.';
    if (!claimStatus) return 'Loading claim status...';
    if (!claimStatus.final_prize_finalized) return 'Final prize pool is not finalized yet.';
    if (!claimStatus.eligible) return 'You are not eligible for the final prize.';
    if (claimStatus.already_claimed) return 'Prize already claimed.';
    if (isZeroLikeAmount(claimStatus.amount_claimable) || claimablePrizeBn === 0n) {
      return 'No claimable prize available.';
    }
    return `Available to claim: ${claimablePrizeText} ${usdcLabel}`;
  }, [account, claimStatus, claimablePrizeBn, claimablePrizeText, usdcLabel]);

  const handleClaimPrize = useCallback(async () => {
    if (!account) {
      toast.error('Connect your wallet first');
      return;
    }

    if (!isApiReady || !api || !coreProgram) {
      toast.error('Node API not ready');
      return;
    }

    if (!claimStatus?.final_prize_finalized) {
      toast.error('Final prize is not finalized yet');
      return;
    }

    if (!claimStatus.eligible) {
      toast.error('You are not eligible for the final prize');
      return;
    }

    if (claimStatus.already_claimed) {
      toast.error('Prize already claimed');
      return;
    }

    if (isZeroLikeAmount(claimStatus.amount_claimable) || claimablePrizeBn === 0n) {
      toast.error('No claimable prize');
      return;
    }

    try {
      setClaimLoading(true);

      const source = account.meta?.source;
      if (!source) throw new Error('Wallet source unavailable');

      const injector = await web3FromSource(source);

      // coreProgram is stable (from component scope) — safe to capture in closure
      const txFactory: TxFactory = () =>
        (new CoreService(coreProgram) as any).claimFinalPrize();

      const { blockHash, response } = await withVoucherSignAndSend({
        txFactory,
        account: account.decodedAddress,
        signerOptions: { signer: injector.signer },
        value: 0n,
        ensureVoucher,
        invalidateVoucher,
        // uses default calculateGas() — no extra params
      });
      toast.success(`Claim tx submitted: ${blockHash}`);

      await response();
      toast.success('Prize claimed successfully');

      await Promise.all([fetchCoreState(), fetchFinalPrizeClaimStatus()]);
    } catch (e) {
      console.error(e);
      toast.error('Failed to claim prize');
    } finally {
      setClaimLoading(false);
    }
  }, [
    account,
    api,
    isApiReady,
    coreProgram,
    toast,
    claimStatus,
    claimablePrizeBn,
    fetchCoreState,
    fetchFinalPrizeClaimStatus,
    ensureVoucher,
    invalidateVoucher,
  ]);

  return (
    <div className="h-dash">
      <div className="h-bg" aria-hidden="true" />

      <header className="h-topbar">
        <div className="h-topbar__row">
          <div className="h-title">
            <h1>My Progress</h1>
            <p>Monitor your rank, points, predictions, and upcoming opportunities.</p>
          </div>

          <div className="h-user">
            <StyledWallet />
          </div>
        </div>

        <div className="h-tabs" role="tablist" aria-label="Tournament tabs">
          {(homeTournamentTabs.length ? homeTournamentTabs : [WORLD_CUP_2026_TOURNAMENT]).map((tournament) => (
            <button
              key={tournament.key}
              className={'h-tab' + (activeTournamentKey === tournament.key ? ' h-tab--active' : '')}
              type="button"
              role="tab"
              aria-selected={activeTournamentKey === tournament.key}
              onClick={() => setActiveTournamentKey(tournament.key)}>
              {tournament.label}
            </button>
          ))}
        </div>
      </header>

      <main className="h-grid">
        <section className="h-card h-card--status">
          <div className="h-card__head">
            <h3>Your SmartCup Status</h3>
          </div>

          <div className="h-status h-status--compact">
            <div className="h-status__top">
              <div className="h-status__tournament">{tournamentName}</div>

              <div className="h-rank h-rank--primary">
                <div className="h-rank__trophy" aria-hidden="true">🏆</div>
                <div className="h-rank__main">
                  <span className="h-rank__no">{myRankInfo.rank ? `#${myRankInfo.rank}` : '—'}</span>
                  <span className="h-rank__all">/ {coreState ? myRankInfo.totalPlayers : '—'}</span>
                </div>
                <div className="h-rank__hint">Rank Position</div>
              </div>
            </div>

            <div className="h-status__mid">
              <div className="h-points h-points--featured">
                <div className="h-points__value">{myRankInfo.points}</div>
                <div className="h-points__label">Points</div>
              </div>

              <div className="h-wallet">
                <div className="h-wallet__label">Wallet</div>
                <div className="h-wallet__value mono">{myWalletHex ? shortHex(myWalletHex) : '—'}</div>
              </div>
            </div>

            <div className="h-kv">
              <div className="h-kv__row">
                <span className="muted">Last match:</span>
                <span className="h-kv__value">{lastMatchLine}</span>
              </div>

              <div className="h-kv__row">
                <span className="muted">Predictions made</span>
                <span className="h-kv__value">
                  {account ? userPredStats.made : '—'}
                  {' · '}
                  <span title="Exact scores">{account ? userPredStats.exactResults : '—'} exact</span>
                  {' · '}
                  <span title="Correct outcomes">{account ? userPredStats.correctOutcomes : '—'} correct</span>
                </span>
              </div>

              <div className="h-kv__row">
                <span className="muted">Distance to next rank</span>
                <span className="h-kv__value">
                  {distanceToNext
                    ? `You're ${distanceToNext.gap} points behind #${distanceToNext.targetRank} · ${shortHex(
                        distanceToNext.targetAddr
                      )}`
                    : '—'}
                </span>
              </div>
            </div>

            <div className="h-card__foot">
              <button className="h-btn h-btn--soft" type="button" onClick={() => navigate('/leaderboard')}>
                View full Leaderboard →
              </button>
            </div>
          </div>
        </section>

        <section className="h-card h-card--perf">
          <div className="h-card__head">
            <h3>Your Prediction Performance</h3>
          </div>

          <div className="h-perf h-perf--compact">
            <div className="h-perf__kpis">
              <div className="h-kpi h-kpi--wide">
                <div className="h-kpi__label">Total Predicted</div>
                <div className="h-kpi__value">
                  {account ? `${userPredStats.made} / ${poolsInfo.totalMatches}` : '—'}
                </div>
              </div>

              <div className="h-kpi">
                <div className="h-kpi__label">Total Earned</div>
                <div className="h-kpi__value">
                  {totalEarnedText} <span className="muted">{usdcLabel}</span>
                </div>
              </div>

              <div className="h-kpi">
                <div className="h-kpi__label">Net Performance</div>
                <div className="h-kpi__value">—</div>
              </div>
            </div>

            <div className={`h-champ-pick h-champ-pick--${championshipPickState}`}>
              <div className="h-champ-pick__main">
                <div className="h-champ-pick__row">
                  <span className="h-champ-pick__title">Championship Picks</span>
                </div>
                <div className="h-champ-pick__sub">{championshipPickSubtext}</div>
              </div>

              <button className="h-champ-pick__cta" type="button" disabled>
                Waiting for R32
              </button>
            </div>

            {nextMatch && (
              <div className="h-next-match">
                <div className="h-next-match__head">
                  <span className="h-next-match__label">
                    {nextMatchAlreadyPredicted ? 'Next Predicted Match:' : 'Next Match to Predict:'}
                  </span>
                </div>
                <div className="h-next-match__info">
                  <div className="h-next-match__teamsLine">
                    <span className="h-next-match__teams">
                      <span className="h-next-match__team">
                        <HomeTeamFlag team={nextMatch.home} />
                        <span>{nextMatch.home}</span>
                      </span>
                      <span className="h-next-match__vs">vs</span>
                      <span className="h-next-match__team">
                        <HomeTeamFlag team={nextMatch.away} />
                        <span>{nextMatch.away}</span>
                      </span>
                    </span>
                    <span className="h-next-match__phase muted">
                      {(nextMatch.phase || '').replace(/_/g, ' ')}
                    </span>
                  </div>
                  <div className="h-next-match__timeLine">
                    <span className="h-next-match__meta muted">
                      {formatDateTime(Number(nextMatch.kick_off))}
                    </span>
                    <span className="h-next-match__closes muted">{nextMatchCloses}</span>
                  </div>
                </div>
                <div className="h-next-match__actions">
                  <button
                    className="h-btn h-btn--primary"
                    type="button"
                    onClick={() =>
                      navigate(
                        nextMatchAlreadyPredicted
                          ? '/my-predictions'
                          : matchPath(nextMatch.phase, nextMatch.match_id)
                      )
                    }>
                    {nextMatchAlreadyPredicted ? 'View your predictions →' : 'Predict now'}
                  </button>
                  <button
                    className="h-btn h-btn--ghost"
                    type="button"
                    onClick={() => navigate('/all-matches')}>
                    View all matches →
                  </button>
                </div>
              </div>
            )}

            {!nextMatch && (
              <div className="h-card__foot h-card__foot--bottomCenter">
                <button className="h-btn h-btn--ghost" type="button" onClick={() => navigate('/all-matches')}>
                  View all matches →
                </button>
              </div>
            )}
          </div>
        </section>

        <section className="h-card h-card--prize">
          <div className="h-card__head">
            <h3>Final Prize Pool</h3>
          </div>

          <div className="h-prize h-prize--with-trophy">
            <img
              className="h-prize__trophy"
              src="/images/WorldCupTrophy_PNG.png"
              alt="World Cup Trophy"
              aria-hidden="true"
            />

            <div className="h-prize__content">
            <div className="h-prize__big">
              <div className="h-prize__value">{coreState ? poolsInfo.finalPrizeText : '—'}</div>
              <div className="h-prize__unit">{usdcLabel}</div>
            </div>

            <div className="h-prize__rows">
              <div className="h-row">
                <span className="muted">Predictions made</span>
                <span>{coreState ? poolsInfo.totalPredictions.toLocaleString() : '—'}</span>
              </div>

              <div className="h-row">
                <span className="muted">Available to claim</span>
                <span>{account && claimStatus ? `${claimablePrizeText} ${usdcLabel}` : '—'}</span>
              </div>

              <div className="h-row">
                <span className="muted">Your points</span>
                <span>{account && claimStatus ? claimStatus.points : '—'}</span>
              </div>

              <div className="h-row">
                <span className="muted">Status</span>
                <span>{claimPrizeStatusText}</span>
              </div>
            </div>

            <div className="h-prize__note muted">Top 5 players will win after the final match</div>
            <div className="h-prize__note muted">{claimPrizeMessage}</div>

            <div className="h-split">
              <div className="h-split__bar" aria-label="Distribution 45 25 15 10 5">
                <span style={{ width: '45%' }} />
                <span style={{ width: '25%' }} />
                <span style={{ width: '15%' }} />
                <span style={{ width: '10%' }} />
                <span style={{ width: '5%' }} />
              </div>
              <div className="h-split__legend mono">
                <span>45%</span>
                <span>25%</span>
                <span>15%</span>
                <span>10%</span>
                <span>5%</span>
              </div>
            </div>

            <div className="h-prize__cta">
              <button
                className="h-btn h-btn--primary h-btn--block"
                type="button"
                disabled={!canClaimPrize}
                onClick={() => void handleClaimPrize()}>
                {claimLoading
                  ? 'Claiming...'
                  : claimStatus?.already_claimed
                    ? 'Prize Claimed'
                    : 'Claim Prize'}
              </button>
            </div>
            </div>{/* end h-prize__content */}
          </div>
        </section>

        <section className="h-card h-card--leader">
          <div className="h-card__head">
            <h3>{tournamentName} Leaderboard</h3>
          </div>

          <div className="h-table">
            <div className="h-thead">
              <div className="h-th h-th--rank">Pos.</div>
              <div className="h-th">Player</div>
              <div className="h-th h-th--num">Matches</div>
              <div className="h-th h-th--num">Exact</div>
              <div className="h-th h-th--num">Outcome</div>
              <div className="h-th h-th--num h-th--points">Points</div>
            </div>

            {leaderboardTop.map((r) => (
              <div className="h-trow" key={r.rank}>
                <div className="h-tcell h-tcell--rank">#{r.rank}</div>
                <div className="h-tcell h-tcell--player" title={r.full}>
                  {r.label}
                </div>
                <div className="h-tcell h-tcell--num">{r.matches}</div>
                <div className="h-tcell h-tcell--num">{r.exact}</div>
                <div className="h-tcell h-tcell--num">{r.outcomes}</div>
                <div className="h-tcell h-tcell--points">
                  <span className="h-pts">{r.points}</span>
                </div>
              </div>
            ))}

            {!leaderboardTop.length ? (
              <div className="h-trow">
                <div className="h-tcell muted">No data</div>
              </div>
            ) : null}
          </div>
        </section>

        <section className="h-card h-card--activity">
          <div className="h-card__head">
            <h3>Protocol Activity</h3>
          </div>

          <div className="h-activity">
            <div className="h-ok">
              <span className={'h-ok__dot' + (loading ? ' h-ok__dot--syncing' : '')} />
              <span>{loading ? 'Syncing on-chain…' : 'All systems operational'}</span>
            </div>

            <div className="h-activity__list">
              <div className="h-alist">
                <span className="h-alist__ico">🗓️</span>
                <div>
                  <div className="h-alist__title">
                    Next kick-off <span className="muted">• {nextMatch ? timeFromNow(Number(nextMatch.kick_off)) : '—'}</span>
                  </div>
                  <div className="h-alist__sub muted">{nextMatch ? formatDateTime(Number(nextMatch.kick_off)) : '—'}</div>
                </div>
              </div>

              <div className="h-alist">
                <span className="h-alist__ico">⚽</span>
                <div>
                  <div className="h-alist__title">Last match settled</div>
                  <div className="h-alist__sub muted">
                    {lastMatch ? `${lastMatch.home} vs ${lastMatch.away} · ${formatDate(Number(lastMatch.kick_off))}` : '—'}
                  </div>
                </div>
              </div>

              <div className="h-alist">
                <span className="h-alist__ico">🏛️</span>
                <div>
                  <div className="h-alist__title">
                    Governance <span className="muted">• {governance.activeCount} active</span>
                  </div>
                  <div className="h-alist__sub muted">
                    {governance.last
                      ? `Latest proposal #${governance.last.id} · ${governance.last.description}`
                      : 'No proposals yet'}
                  </div>
                </div>
              </div>

              <div className="h-alist">
                <span className="h-alist__ico">💎</span>
                <div>
                  <div className="h-alist__title">
                    Total Pool <span className="muted">• {coreState ? `${poolsInfo.allPoolsText} ${usdcLabel}` : '—'}</span>
                  </div>
                  <div className="h-alist__sub muted">Sum of pools across all matches.</div>
                </div>
              </div>
            </div>

            <div className="h-activity__foot">
              <button className="h-btn h-btn--soft" type="button" onClick={fetchAll}>
                ⟳ Refresh on-chain state
              </button>
            </div>
          </div>
        </section>

        <section className="h-card h-card--matches">
          <div className="h-card__head h-card__head--row">
            <h3>Upcoming matches</h3>
            <button
              className="h-btn h-btn--ghost h-btn--sm"
              type="button"
              onClick={() => navigate('/all-matches')}>
              View full matches →
            </button>
          </div>

          <div className="h-matches">
            {displayedUpcomingMatches.map((m) => {
              const hasPred = predictedMatchIds.has(String(m.match_id));

              return (
                <div className="h-match" key={String(m.match_id)}>
                  <div className="h-match__main">
                    <div className="h-match__teams">
                      <span className="h-team">
                        <HomeTeamFlag team={m.home} />
                        <span className="h-team__name">{m.home}</span>
                      </span>
                      <span className="h-vs">vs</span>
                      <span className="h-team">
                        <HomeTeamFlag team={m.away} />
                        <span className="h-team__name">{m.away}</span>
                      </span>
                      {hasPred && <span className="h-pred-tag">✓ Predicted</span>}
                    </div>
                    <div className="h-match__meta muted">
                      {(m.phase || '').replace(/_/g, ' ')} <span className="h-dot">•</span>{' '}
                      {formatDateTime(Number(m.kick_off))}
                    </div>
                  </div>

                  <button
                    className={hasPred ? 'h-btn h-btn--ghost' : 'h-btn h-btn--soft'}
                    type="button"
                    onClick={() => navigate(matchPath(m.phase, m.match_id))}>
                    {hasPred ? 'Predicted' : 'Predict Now'}
                  </button>
                </div>
              );
            })}

            {!displayedUpcomingMatches.length ? <div className="muted">No upcoming matches</div> : null}
          </div>
        </section>
      </main>

    </div>
  );
}
