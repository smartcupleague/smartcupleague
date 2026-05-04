import React, { useState, useEffect, useCallback, useMemo } from 'react';
import './my-predictions.css';
import { useAccount, useApi } from '@gear-js/react-hooks';
import { useToast } from '@/hooks/useToast';
import { web3Enable, web3FromSource } from '@polkadot/extension-dapp';
import { Program, Service } from '@/hocs/lib';
import { TransactionBuilder } from 'sails-js';
import { TeamFlag } from '@/components/common/TeamFlag';
import { Header } from '../layout';

const PROGRAM_ID = import.meta.env.VITE_BOLAOCOREPROGRAM;

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

function normalizeTeamKey(team: string) {
  return (team || '').trim().toUpperCase().replace(/\s+/g, ' ');
}

const WC_PHASES = new Set([
  'GROUP_STAGE', 'Group Stage', 'ROUND_OF_16', 'Round Of 16', 'Round of 16',
  'QUARTER_FINALS', 'Quarter Finals', 'Quarter-finals',
  'SEMI_FINALS', 'Semi Finals', 'Semi-finals',
  'THIRD_PLACE', 'Third Place', 'FINAL', 'Final',
]);

function isWCPhase(phase: string): boolean {
  if (WC_PHASES.has(phase)) return true;
  const u = phase.toUpperCase();
  return u.includes('GROUP') || u.includes('ROUND') || u.includes('QUARTER') ||
    u.includes('SEMI') || u.includes('FINAL') || u.includes('KNOCKOUT');
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
  const divisor = BigInt(10) ** BigInt(decimals);
  const intVal = bn / divisor;
  const frac = (bn % divisor).toString().padStart(decimals, '0').replace(/0+$/, '');
  return frac ? `${intVal.toString()}.${frac}` : intVal.toString();
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

  const [bets, setBets] = useState<ContractUserBetView[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const [matches, setMatches] = useState<MatchInfo[] | null>(null);
  const [phases, setPhases] = useState<PhaseConfig[]>([]);

  const [tab, setTab] = useState<'leagues' | 'wc'>('leagues');
  const [search, setSearch] = useState('');
  const [filterStage, setFilterStage] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [sortField, setSortField] = useState<'match_id' | 'date' | 'az' | 'za'>('match_id');
  const [filterStatus, setFilterStatus] = useState<'' | 'claimed' | 'pending' | 'eligible' | 'not_eligible'>('');
  const [claimingByMatch, setClaimingByMatch] = useState<Record<number, boolean>>({});
  const [pendingRefund, setPendingRefund] = useState<bigint>(0n);
  const [claimingRefund, setClaimingRefund] = useState(false);

  useEffect(() => {
    void web3Enable('Bolao Bets UI');
  }, []);

  const fetchState = useCallback(async () => {
    if (!api || !isApiReady) return;
    try {
      const svc = new Service(new Program(api, PROGRAM_ID));
      const state = (await (svc as any).queryState()) as any;

      const list: MatchInfo[] = Array.isArray(state?.matches)
        ? state.matches.map((m: any) => ({
            match_id: String(m?.match_id ?? ''),
            phase: String(m?.phase ?? ''),
            home: String(m?.home ?? ''),
            away: String(m?.away ?? ''),
            kick_off: String(m?.kick_off ?? '0'),
            result: m?.result ?? null,
            match_prize_pool: String(m?.match_prize_pool ?? '0'),
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
  }, [api, isApiReady]);

  const fetchBets = useCallback(async () => {
    if (!api || !isApiReady || !account) return;

    setLoading(true);
    setErrMsg(null);

    try {
      const svc = new Service(new Program(api, PROGRAM_ID));
      const result = (await (svc as any).queryBetsByUser(account.decodedAddress)) as any[];

      const parsed: ContractUserBetView[] = (result ?? []).map((v: any) => ({
        match_id: Number(v?.match_id ?? 0),
        score: { home: Number(v?.score?.home ?? 0) || 0, away: Number(v?.score?.away ?? 0) || 0 },
        penalty_winner: v?.penalty_winner ?? null,
        stake_in_match_pool: v?.stake_in_match_pool ?? 0,
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
  }, [api, isApiReady, account, toast]);

  const fetchPendingRefund = useCallback(async () => {
    if (!api || !isApiReady || !account) {
      setPendingRefund(0n);
      return;
    }
    try {
      const svc = new Service(new Program(api, PROGRAM_ID));
      const raw = await (svc as any).queryPendingRefund(account.decodedAddress);
      setPendingRefund(toBn(raw));
    } catch (e) {
      console.error('Failed to fetch pending refund', e);
      setPendingRefund(0n);
    }
  }, [api, isApiReady, account]);

  useEffect(() => {
    if (isApiReady) void fetchState();
  }, [isApiReady, fetchState]);

  useEffect(() => {
    if (account && isApiReady) {
      void fetchBets();
      void fetchPendingRefund();
    }
  }, [account, isApiReady, fetchBets, fetchPendingRefund]);

  const connected = !!account;

  const matchById = useMemo(() => {
    const map = new Map<number, MatchInfo>();
    for (const m of matches ?? []) {
      const idNum = Number(m.match_id);
      if (Number.isFinite(idNum)) map.set(idNum, m);
    }
    return map;
  }, [matches]);

  const tabCounts = useMemo(() => {
    const all = bets ?? [];
    const leagues = all.filter((b) => {
      const phase = matchById.get(Number(b.match_id))?.phase ?? '';
      return !isWCPhase(phase);
    }).length;
    const wc = all.length - leagues;
    return { leagues, wc };
  }, [bets, matchById]);

  // Unique phases for filter dropdown
  const availablePhases = useMemo(() => {
    const set = new Set<string>();
    for (const m of matches ?? []) {
      if (m.phase) set.add(m.phase);
    }
    return Array.from(set).sort();
  }, [matches]);

  const wcBets = useMemo(() => {
    let list = (bets ?? []) as ContractUserBetView[];

    // Text search
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((b) => {
        const pick = `${b.score.home}-${b.score.away}`;
        const m = matchById.get(Number(b.match_id));
        const teams = m ? `${m.home} ${m.away}` : '';
        const s = `#${String(b.match_id)} ${teams} ${pick} ${b.claimed ? 'claimed' : 'pending'}`.toLowerCase();
        return s.includes(q);
      });
    }

    // Stage filter
    if (filterStage) {
      list = list.filter((b) => {
        const m = matchById.get(Number(b.match_id));
        return m?.phase === filterStage;
      });
    }

    // Date filter
    if (filterDate) {
      list = list.filter((b) => {
        const m = matchById.get(Number(b.match_id));
        if (!m) return false;
        const n = Number(m.kick_off);
        if (!n) return false;
        const ms = n < 10_000_000_000 ? n * 1000 : n;
        return new Date(ms).toISOString().slice(0, 10) === filterDate;
      });
    }

    // Status filter
    if (filterStatus === 'claimed') {
      list = list.filter((b) => b.claimed);
    } else if (filterStatus === 'pending') {
      list = list.filter((b) => !b.claimed);
    } else if (filterStatus === 'eligible') {
      list = list.filter((b) => {
        const m = matchById.get(Number(b.match_id));
        if (!m || !isMatchFinal(m.result)) return false;
        const betPenalty = parsePenaltyWinner(b.penalty_winner);
        const { score: finalScore, penaltyWinner: finalPenalty } = getFinalizedResult(m.result);
        const phaseWeight = getPhaseWeight(m.phase, phases);
        return eligibleForPayout(b.score, betPenalty, finalScore, finalPenalty, phaseWeight);
      });
    } else if (filterStatus === 'not_eligible') {
      list = list.filter((b) => {
        const m = matchById.get(Number(b.match_id));
        if (!m || !isMatchFinal(m.result)) return true;
        const betPenalty = parsePenaltyWinner(b.penalty_winner);
        const { score: finalScore, penaltyWinner: finalPenalty } = getFinalizedResult(m.result);
        const phaseWeight = getPhaseWeight(m.phase, phases);
        return !eligibleForPayout(b.score, betPenalty, finalScore, finalPenalty, phaseWeight);
      });
    }

    // Sort
    if (sortField === 'date') {
      list = [...list].sort((a, b) => {
        const ma = matchById.get(Number(a.match_id));
        const mb = matchById.get(Number(b.match_id));
        return Number(ma?.kick_off ?? 0) - Number(mb?.kick_off ?? 0);
      });
    } else if (sortField === 'az') {
      list = [...list].sort((a, b) => {
        const ma = matchById.get(Number(a.match_id));
        const mb = matchById.get(Number(b.match_id));
        return (`${ma?.home ?? ''} ${ma?.away ?? ''}`).localeCompare(`${mb?.home ?? ''} ${mb?.away ?? ''}`);
      });
    } else if (sortField === 'za') {
      list = [...list].sort((a, b) => {
        const ma = matchById.get(Number(a.match_id));
        const mb = matchById.get(Number(b.match_id));
        return (`${mb?.home ?? ''} ${mb?.away ?? ''}`).localeCompare(`${ma?.home ?? ''} ${ma?.away ?? ''}`);
      });
    } else {
      // Default: match #
      list = [...list].sort((a, b) => Number(a.match_id) - Number(b.match_id));
    }

    // Tab filter
    list = list.filter((b) => {
      const m = matchById.get(Number(b.match_id));
      const phase = m?.phase ?? '';
      return tab === 'wc' ? isWCPhase(phase) : !isWCPhase(phase);
    });

    return list;
  }, [bets, search, matchById, filterStage, filterDate, sortField, filterStatus, phases, tab]);

  const claim = useCallback(
    async (matchId: number) => {
      if (!api || !isApiReady || !account) return;

      setClaimingByMatch((p) => ({ ...p, [matchId]: true }));
      try {
        const svc = new Service(new Program(api, PROGRAM_ID));
        const tx: TransactionBuilder<unknown> = (svc as any).claimMatchReward(matchId);

        const injector = await web3FromSource(account.meta.source);
        tx.withAccount(account.decodedAddress, { signer: injector.signer });

        await tx.calculateGas();
        const { blockHash, response } = await tx.signAndSend();

        toast.info(`Transaction included in block ${blockHash}`);
        await response();

        toast.success('Claim completed!');
        await fetchBets();
        await fetchState();
      } catch (e: any) {
        console.error('Claim failed', e);
        toast.error(e?.message ?? 'Claim failed');
      } finally {
        setClaimingByMatch((p) => ({ ...p, [matchId]: false }));
      }
    },
    [api, isApiReady, account, toast, fetchBets, fetchState],
  );

  const claimRefund = useCallback(async () => {
    if (!api || !isApiReady || !account) return;
    if (pendingRefund <= 0n) return;

    setClaimingRefund(true);
    try {
      const svc = new Service(new Program(api, PROGRAM_ID));
      const tx: TransactionBuilder<unknown> = (svc as any).claimRefund();

      const injector = await web3FromSource(account.meta.source);
      tx.withAccount(account.decodedAddress, { signer: injector.signer });

      await tx.calculateGas();
      const { blockHash, response } = await tx.signAndSend();

      toast.info(`Refund tx included in block ${blockHash}`);
      await response();

      toast.success('Refund claimed!');
      await fetchPendingRefund();
      await fetchBets();
      await fetchState();
    } catch (e: any) {
      console.error('Refund claim failed', e);
      toast.error(e?.message ?? 'Refund claim failed');
    } finally {
      setClaimingRefund(false);
    }
  }, [api, isApiReady, account, pendingRefund, toast, fetchPendingRefund, fetchBets, fetchState]);

  return (
    <div className="mpShell">
      <div className="mpBg" aria-hidden="true" />

      <header className="mpTop">
        <div className="mpTop__row mpTop__row--walletSafe">
          <div className="mpTitle mpTitle--shrink">
            <h1>My Predictions</h1>
            <p>Potential Winnings is an estimate and becomes exact once the match is finalized + settled.</p>
          </div>
          <Header />
        </div>

        <div className="mpTabs">
          <div className="mpTabGroup">
            <button
              className={'mpTab ' + (tab === 'leagues' ? 'is-active' : '')}
              onClick={() => { setTab('leagues'); setFilterStage(''); }}
              type="button">
              Leagues {tabCounts.leagues > 0 ? `(${tabCounts.leagues})` : ''}
            </button>
            <button
              className={'mpTab ' + (tab === 'wc' ? 'is-active' : '')}
              onClick={() => { setTab('wc'); setFilterStage(''); }}
              type="button">
              World Cup 2026 {tabCounts.wc > 0 ? `(${tabCounts.wc})` : ''}
            </button>
          </div>

          <div className="mpSearch">
            <span className="mpSearch__icon" aria-hidden="true">
              ⌕
            </span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search teams, match id, score (e.g. 2-1), status"
              aria-label="Search predictions"
            />
          </div>

          <div className="mpTools">
            <button
              className="mpIconBtn"
              title="Refresh predictions"
              onClick={() => (account && isApiReady ? fetchBets() : undefined)}
              type="button">
              ⟳
            </button>
            <button className="mpIconBtn" title="Refresh state" onClick={() => (isApiReady ? fetchState() : undefined)} type="button">
              ⛁
            </button>
          </div>
        </div>

        <div className="mpHintbar">
          <span className="mpPill">Prediction closes 10m before kickoff</span>
          <span className="mpPill">85% Match / 10% Final / 5% DAO</span>
          <span className="mpPill">On-chain pools</span>
          <span className="mpPill mpPill--live">LIVE</span>

          {/* Sort + Stage + Date filters */}
          <select
            className="mpFilterSelect"
            value={sortField}
            onChange={(e) => setSortField(e.target.value as 'match_id' | 'date' | 'az' | 'za')}
            aria-label="Sort predictions">
            <option value="match_id">Sort: Match #</option>
            <option value="date">Sort: Date</option>
            <option value="az">Sort: A → Z</option>
            <option value="za">Sort: Z → A</option>
          </select>

          <select
            className="mpFilterSelect"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as '' | 'claimed' | 'pending' | 'eligible' | 'not_eligible')}
            aria-label="Filter by status">
            <option value="">All Statuses</option>
            <option value="claimed">Claimed</option>
            <option value="pending">Pending</option>
            <option value="eligible">Eligible</option>
            <option value="not_eligible">Not Eligible</option>
          </select>

          <select
            className="mpFilterSelect"
            value={filterStage}
            onChange={(e) => setFilterStage(e.target.value)}
            aria-label="Filter by stage">
            <option value="">All Stages</option>
            {availablePhases.map((p) => (
              <option key={p} value={p}>{p.replace(/_/g, ' ')}</option>
            ))}
          </select>

          <input
            className="mpFilterDate"
            type="date"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            aria-label="Filter by date"
            title="Filter by date"
          />

          {(filterStage || filterDate || filterStatus) && (
            <button
              className="mpIconBtn"
              type="button"
              title="Clear filters"
              onClick={() => { setFilterStage(''); setFilterDate(''); setFilterStatus(''); }}>
              ✕
            </button>
          )}
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
          <div className="mpSection__main">{tab === 'wc' ? 'World Cup 2026' : 'Leagues'}</div>
          <div className="mpSection__sub">{tab === 'wc' ? 'All phases' : 'Current season matches'}</div>
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
            <div className="mpCard__head">
              <div className="mpCard__left">
                <span className="mpCup">🏆</span>
                <div className="mpCard__ttl">
                  <div className="t">{tab === 'wc' ? 'World Cup 2026' : 'Leagues'}</div>
                  <div className="s">{tab === 'wc' ? 'All phases' : 'Current season matches'}</div>
                </div>
              </div>

              <div className="mpCard__right">
                <span className="mpMini">{`Total bets: ${wcBets.length}`}</span>
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
                    const m = matchById.get(Number(b.match_id));

                    const stakeBn = toBn(b.stake_in_match_pool);
                    const stakeHuman = Number(formatAmount(stakeBn, 12));

                    const pickText = `${b.score.home}-${b.score.away}`;
                    const betPenalty = parsePenaltyWinner(b.penalty_winner);

                    const home = m?.home ?? `Home`;
                    const away = m?.away ?? `Away`;
                    const phase = m?.phase ?? '—';
                    const kickoff = m?.kick_off ? formatKickoff(m.kick_off) : '—';
                    const poolHuman = m ? totalPoolVara(m) : '—';

                    const current = m ? getCurrentScore(m.result) : { home: 0, away: 0, tag: 'OPEN' as const };
                    const matchFinal = m ? isMatchFinal(m.result) : false;

                    const settlementPrepared = !!m?.settlement_prepared;
                    const matchPoolBn = toBn(m?.match_prize_pool ?? 0);
                    const totalWinnerStakeBn = toBn(m?.total_winner_stake ?? 0);

                    const phaseWeight = m ? getPhaseWeight(m.phase, phases) : 1;
                    const { score: finalScore, penaltyWinner: finalPenalty } = m ? getFinalizedResult(m.result) : {};

                    const eligible = matchFinal
                      ? eligibleForPayout(b.score, betPenalty, finalScore, finalPenalty, phaseWeight)
                      : false;

                    const realBn =
                      matchFinal && settlementPrepared && eligible
                        ? computeDeterministicShareBn(stakeBn, matchPoolBn, totalWinnerStakeBn)
                        : 0n;

                    const realHuman = Number(formatAmount(realBn, 12));
                    const potentialBefore = matchPoolBn > 0n ? matchPoolBn : 0n;
                    const potentialText = potentialBefore > 0n ? `${formatAmount(potentialBefore, 12)}` : '—';

                    const displayValue =
                      settlementPrepared && matchFinal ? (eligible ? realHuman.toFixed(4) : '0.0000') : potentialText;

                    const exactHit = matchFinal ? isExactScore(b.score, finalScore) : false;

                    const displaySub =
                      settlementPrepared && matchFinal
                        ? eligible
                          ? exactHit
                            ? 'Real (claimable • exact)'
                            : 'Real (claimable • outcome)'
                          : 'Not eligible'
                        : 'Potential (max pool)';

                    const claimed = !!b.claimed;
                    const matchCancelled = m ? isCancelledMatch(m.result) : false;
                    const canClaim = matchFinal && settlementPrepared && eligible && !claimed && realBn > 0n && !matchCancelled;

                    const statusLabelText = matchCancelled
                      ? 'Cancelled'
                      : claimed
                        ? 'Claimed'
                        : matchFinal
                          ? 'Finalized'
                          : 'Pending';
                    const statusTone = matchCancelled
                      ? 'muted'
                      : claimed
                        ? 'ok'
                        : matchFinal
                          ? 'final'
                          : 'muted';

                    const isClaiming = !!claimingByMatch[Number(b.match_id)];

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
                            {Number.isFinite(stakeHuman) ? stakeHuman.toFixed(1) : '0.0'}
                          </div>
                          <div className="mpNum__sub">VARA</div>
                        </div>

                        <div className="mpPick">
                          <div className="mpPick__label">YOUR PICK</div>
                          <div className="mpPick__score">{pickText}</div>
                          <div className="mpPick__hint">Score / outcome</div>
                        </div>

                        <div className="mpWin hideMd">
                          <div className="mpWin__main">{displayValue}</div>
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