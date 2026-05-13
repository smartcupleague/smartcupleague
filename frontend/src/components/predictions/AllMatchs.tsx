import React, { useEffect, useState, useCallback, useMemo } from 'react';
import './all-matchs.css';
import { useApi, useAccount } from '@gear-js/react-hooks';
import { web3Enable, web3FromSource } from '@polkadot/extension-dapp';
import { Program, Service } from '@/hocs/lib';
import { useNavigate } from 'react-router-dom';
import { TransactionBuilder } from 'sails-js';
import { useToast } from '@/hooks/useToast';
import { HexString } from '@gear-js/api';
import { TeamFlag } from '@/components/common/TeamFlag';
import { StyledWallet } from '@/components/wallet/Wallet';
import { useVaraPrice } from '@/hooks/useVaraPrice';
import { useTournamentSelection } from '@/hooks/useTournamentSelection';
import { reportClaim } from '@/utils/statsReporter';
import { TOURNAMENT_TAB_ORDER, getTournamentByKey, isWCPhase, matchPath } from '@/utils';

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
      return { label: 'FINAL', home: Number(s.home ?? 0) || 0, away: Number(s.away ?? 0) || 0, penaltyWinner: null };
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
    const divisor = BigInt(10) ** BigInt(decimals);
    const intVal = bn / divisor;
    const frac = (bn % divisor).toString().padStart(decimals, '0').replace(/0+$/, '');
    return frac ? `${intVal.toString()}.${frac}` : intVal.toString();
  } catch {
    return '—';
  }
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
    home: 'England',
    away: 'Argentina',
    kick_off: '1774645200',
    result: { finalized: { score: { home: 1, away: 3 } } },
    match_prize_pool: '6475000000000000',
    has_bets: true,
    settlement_prepared: true,
  },
  {
    match_id: '3',
    phase: 'GROUP_STAGE',
    home: 'Brazil',
    away: 'Belgium',
    kick_off: '1774731600',
    result: { finalized: { score: { home: 2, away: 1 } } },
    match_prize_pool: '6180000000000000',
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

function buildPreviewBets(matches: MatchInfo[]): Map<string, UserBetView> {
  const previewBets = new Map<string, UserBetView>();
  for (const m of matches.slice(0, 4)) {
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
      penalty_winner: null,
    });
  }
  return previewBets;
}

type SortField = 'match_id_asc' | 'match_id_desc' | 'date_asc' | 'date_desc';
type StatusFilter = '' | 'predicted' | 'not_predicted';
export const MatchesTableComponent: React.FC = () => {
  const { api, isApiReady } = useApi();
  const { account } = useAccount();
  const toast = useToast();
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

  useEffect(() => {
    void web3Enable('Bolao Matches UI');
  }, []);

  const fetchMatches = useCallback(async () => {
    const useLocalPreview = isLocalPredictedPreview();
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
        match_prize_pool: String(m?.match_prize_pool ?? m?.total_pool ?? '0'),
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

  const fetchUserBets = useCallback(async () => {
    const previewBets = isLocalPredictedPreview() ? buildPreviewBets(matches ?? []) : null;
    if (!api || !isApiReady || !account) {
      if (previewBets?.size) setUserBetsByMatchId(previewBets);
      return;
    }
    try {
      const svc = new Service(new Program(api, PROGRAM_ID as HexString));
      const bets = (await (svc as any).queryBetsByUser(account.decodedAddress)) as any[];
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
  }, [api, isApiReady, account, matches]);

  useEffect(() => { void fetchUserBets(); }, [fetchUserBets]);

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
        const svc = new Service(new Program(api, PROGRAM_ID as HexString));

        const tx: TransactionBuilder<unknown> = (svc as any).claimMatchReward(BigInt(matchId));

        const { signer } = await web3FromSource(account.meta.source);
        tx.withAccount(account.decodedAddress, { signer }).withValue(0n);

        // Snapshot balance before claim to compute the earned amount
        let balanceBefore = 0n;
        try {
          const raw = await (api as any).balance.findOut(account.decodedAddress);
          balanceBefore = BigInt(raw.toString());
        } catch { /* non-fatal */ }

        await tx.calculateGas();
        const { blockHash, response } = await tx.signAndSend();
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
    [api, isApiReady, account, toast, fetchMatches],
  );

  return (
    <div className="mxShell">
      {/* Header — same pattern as My Predictions, with wallet */}
      <header className="mxTop">
        <div className="mxTop__row">
          <div className="mxTitle">
            <h1>⚽ All Matches</h1>
            <p>Browse markets, live scores, pools, and predict outcomes.</p>
          </div>

          <div className="mxTop__right">
            <div className="mxSearch" role="search">
              <span className="mxSearch__icon" aria-hidden="true">
                ⌕
              </span>
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

        {/* Filters row */}
        <div className="mxFilters">
          <div className="mxFilters__left">
            <span className="mxPill">Prediction closes 10m before kickoff</span>
            <span className="mxPill">85% Match / 10% Final / 5% DAO</span>
            <span className="mxPill">On-chain pools</span>
            <span className="mxPill mxPill--live">LIVE</span>
          </div>
          <div className="mxFilters__right">
            {/* Sort */}
            <select
              className="mxFilterSelect"
              value={sortField}
              onChange={(e) => setSortField(e.target.value as SortField)}
              aria-label="Sort by">
              <option value="match_id_asc">Match #: First → Last</option>
              <option value="match_id_desc">Match #: Last → First</option>
              <option value="date_asc">Date: Oldest First</option>
              <option value="date_desc">Date: Newest First</option>
            </select>

            {/* Status filter */}
            <select
              className="mxFilterSelect"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as StatusFilter)}
              aria-label="Filter by prediction status">
              <option value="">All Statuses</option>
              <option value="predicted">Predicted</option>
              <option value="not_predicted">Not Predicted</option>
            </select>

            {/* Stage filter */}
            <select
              className="mxFilterSelect"
              value={filterStage}
              onChange={(e) => setFilterStage(e.target.value)}
              aria-label="Filter by stage">
              <option value="">All Stages</option>
              {phases.map((p) => (
                <option key={p} value={p}>{p.replace(/_/g, ' ')}</option>
              ))}
            </select>

            {/* Date filter */}
            <input
              className="mxFilterDate"
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              aria-label="Filter by date"
              title="Filter by date"
            />

            {/* Clear filters */}
            {(filterStage || filterDate || filterSearch || headerSearch || filterStatus) && (
              <button
                className="mxBtn mxBtn--ghost"
                type="button"
                onClick={() => {
                  setFilterStage('');
                  setFilterDate('');
                  setFilterSearch('');
                  setHeaderSearch('');
                  setFilterStatus('');
                }}>
                Clear
              </button>
            )}

            <button className="mxBtn mxBtn--ghost" type="button" onClick={fetchMatches}>
              Refresh
            </button>
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
              const totalPoolHuman = formatAmount(m.match_prize_pool, 12);

              const prediction = predictionWindow(m.kick_off);
              const displayLabel = r.label === "OPEN" && prediction.closed ? "CLOSED" : r.label;

              const statusText =
                r.label === "FINAL"
                  ? "Final score " + r.home + "-" + r.away + "."
                  : r.label === "LIVE"
                    ? "Live now " + r.home + "-" + r.away + " (proposed)."
                    : r.label === "CANCELLED"
                      ? "Match cancelled • Refund available if eligible."
                      : prediction.closed
                        ? "Prediction closed • Awaiting result."
                        : "Open for predictions • " + prediction.label + ".";

              const userBet = userBetsByMatchId.get(m.match_id);
              const hasPrediction = !!userBet;
              const pickText = userBet ? `${userBet.score.home}-${userBet.score.away}` : '';

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

                      <span className={"mxStatus mxStatus--" + displayLabel.toLowerCase()}>
                        {displayLabel}
                      </span>
                    </div>

                    <div className="mxCard__topRight">
                      {r.label === "OPEN" ? <span className="mxPill">{prediction.label}</span> : null}

                      {/* Prediction Made badge on the right */}
                      {hasPrediction && (
                        <span className="mxStatus mxStatus--predicted">✓ Predicted</span>
                      )}

                      {/* Claim badge — non-interactive, goes to match page for actual claim */}
                      {r.label === 'FINAL' && hasPrediction && m.settlement_prepared ? (
                        <span className="mxBtn mxBtn--claim mxBtn--static">
                          Reward Ready
                        </span>
                      ) : hasPrediction ? (
                        <button
                          className="mxBtn mxBtn--soft"
                          onClick={() => navigate(matchPath(m.phase, m.match_id))}
                          type="button">
                          Details
                        </button>
                      ) : r.label === "OPEN" && !prediction.closed ? (
                        <button
                          className="mxBtn mxBtn--primary"
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
                      <span className="mxMeta__chip">{m.has_bets ? 'Has predictions ✓' : 'No predictions'}</span>
                    </div>

                    {userBet ? (
                      <div className="mxYourPick" aria-label={`Your pick ${pickText}`}>
                        <span className="mxYourPick__label">Your Pick</span>
                        <span className="mxYourPick__score">{pickText}</span>
                      </div>
                    ) : null}

                    <div className="mxScore">
                      <div className="mxScore__label">
                        {displayLabel === "OPEN" ? "OPEN" : displayLabel === "CLOSED" ? "CLOSED" : r.label === "LIVE" ? "LIVE SCORE" : r.label === "CANCELLED" ? "CANCELLED" : "FINAL SCORE"}
                      </div>
                      <div className="mxScore__value">
                        {r.home}-{r.away}
                      </div>
                      <div className="mxScore__sub">
                        {r.label === "FINAL"
                          ? "On-chain finalized result"
                          : r.label === "LIVE"
                            ? "On-chain proposed score"
                            : r.label === "CANCELLED"
                              ? "Match cancelled"
                              : prediction.closed
                                ? "Awaiting on-chain result"
                                : "Open for predictions"}
                      </div>
                    </div>

                    <div className="mxPools">
                      <div className="mxPool">
                        <div className="mxPool__k">Match Prize Pool</div>
                        <div className="mxPool__v">
                          {totalPoolHuman !== '—' ? `${totalPoolHuman} VARA` : (m.has_bets ? 'Pool active' : '—')}
                        </div>
                        {totalPoolHuman !== '—' && (
                          <div className="mxPool__usd">{planckToUsd(m.match_prize_pool) || 'USD conversion unavailable'}</div>
                        )}
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
