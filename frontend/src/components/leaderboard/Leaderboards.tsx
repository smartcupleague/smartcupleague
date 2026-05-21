import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './leaderboards.css';
import { useAccount, useApi } from '@gear-js/react-hooks';
import { useToast } from '@/hooks/useToast';
import { web3Enable } from '@polkadot/extension-dapp';
import { decodeAddress } from '@polkadot/util-crypto';
import { u8aToHex } from '@polkadot/util';
import { Program, Service } from '@/hocs/lib';
import { StyledWallet } from '../wallet/Wallet';
import { useNavigate } from 'react-router-dom';
import { useTournamentSelection } from '@/hooks/useTournamentSelection';
import {
  TOURNAMENT_TAB_ORDER,
  WORLD_CUP_2026_TOURNAMENT,
  getTournamentByKey,
  isWCPhase,
  matchPath,
} from '@/utils';
import { UserProfileModal } from './UserProfileModal';
import { TeamFlag } from '@/components/common/TeamFlag';

const PROGRAM_ID = import.meta.env.VITE_BOLAOCOREPROGRAM as `0x${string}`;
const MY_LB_KEY = 'scl_my_leaderboard_v1';
const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000';
const INDEXER_URL = import.meta.env.VITE_INDEXER_GRAPHQL_URL as string | undefined;
const INDEXER_TIMEOUT_MS = 4_000;

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

// Tabs — removed Match Performance, R32 Bonus (Picks), Earnings/ROI per spec
const tabs = ['Global Leaderboard', 'My Leaderboard'] as const;
type Tab = (typeof tabs)[number];

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

type QueryStateResponse = {
  user_points?: Array<[string, number]>;
  matches?: any[];
  podium_finalized?: boolean;
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
async function fetchFromIndexer(apiStats: Map<string, ApiStatsRow>): Promise<IndexerResult> {
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
      const wallet = String(u.id ?? '').toLowerCase();
      const apiRow = apiStats.get(wallet);
      return {
        rank: 0,
        wallet,
        displayName: apiRow?.display_name ?? null,
        totalPoints: Number(u.totalPoints ?? 0),
        matches: apiRow?.matches_count ?? Number(u.totalBets ?? 0),
        exact: apiRow?.exact_count ?? 0,
        outcomes: apiRow?.outcome_count ?? 0,
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
    const res = await fetch(`${API_BASE}/api/v1/leaderboard?limit=2000`);
    if (!res.ok) return map;
    const data: { rows: ApiStatsRow[] } = await res.json();
    for (const row of data.rows ?? []) {
      map.set(row.wallet_address.toLowerCase(), row);
    }
  } catch { /* API unavailable — empty map is fine */ }
  return map;
}

export default function Leaderboards() {
  const [activeTab, setActiveTab] = useState<Tab>('Global Leaderboard');
  const [query, setQuery] = useState('');
  const navigate = useNavigate();

  const { api, isApiReady } = useApi();
  const toast = useToast();
  const { account } = useAccount();

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<LbRow[]>([]);
  const [upcomingMatches, setUpcomingMatches] = useState<any[]>([]);
  const [stateMatches, setStateMatches] = useState<LeaderboardMatch[]>([]);
  const [profileRow, setProfileRow] = useState<LbRow | null>(null);

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
    if (!api || !isApiReady) return;

    setLoading(true);
    try {
      // Always fetch the supplementary API stats (used by both paths).
      const statsMap = await fetchApiStats();

      let chainState: QueryStateResponse | null = null;
      try {
        const svc = new Service(new Program(api, PROGRAM_ID));
        chainState = (await (svc as any).queryState()) as QueryStateResponse;
      } catch { /* non-fatal; indexer path can still render leaderboard */ }

      const normalizedStateMatches = Array.isArray(chainState?.matches)
        ? chainState.matches.map(normalizeMatch)
        : [];
      setStateMatches(normalizedStateMatches);

      // ── Path 1: indexer-first ─────────────────────────────────────────────
      try {
        const { rows: idxRows, upcomingMatches: idxUpcoming } = await fetchFromIndexer(statsMap);
        setRows(idxRows);
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
        if (wallet) pointsMap.set(String(wallet).toLowerCase(), Number(pts ?? 0));
      }

      // Build match count per wallet from participants lists
      const matchCountMap = new Map<string, number>();
      if (Array.isArray(state?.matches)) {
        for (const m of state.matches as any[]) {
          if (Array.isArray(m?.participants)) {
            for (const p of m.participants) {
              const hw = String(p ?? '').toLowerCase();
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
          const apiRow = statsMap.get(wallet);
          return {
            rank: 0,
            wallet,
            displayName: apiRow?.display_name ?? null,
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

      setRows(mapped.map((r, idx) => ({ ...r, rank: idx + 1 })));

      // Extract upcoming matches for sidebar widget
      if (Array.isArray(state?.matches)) {
        const now = Date.now();
        const upcoming = state.matches
          .map(normalizeMatch)
          .filter((m: any) => {
            const ko = Number(m?.kick_off ?? 0);
            const ms = ko < 10_000_000_000 ? ko * 1000 : ko;
            const isFinalized = !!(m?.result?.Finalized || m?.result?.finalized);
            return !isFinalized && ms > now;
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
  }, [api, isApiReady, toast]);

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
    if (!stateMatches.length) return rows;

    const matchCountMap = new Map<string, number>();
    for (const match of activeTournamentMatches) {
      for (const participant of match.participants ?? []) {
        const wallet = participant.toLowerCase();
        if (wallet) matchCountMap.set(wallet, (matchCountMap.get(wallet) ?? 0) + 1);
      }
    }

    return rows
      .filter((row) => matchCountMap.has(row.wallet.toLowerCase()))
      .map((row) => ({
        ...row,
        matches: matchCountMap.get(row.wallet.toLowerCase()) ?? 0,
      }))
      .sort((a, b) => {
        if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
        return a.wallet.localeCompare(b.wallet);
      })
      .map((row, index) => ({ ...row, rank: index + 1 }));
  }, [activeTournamentMatches, rows, stateMatches.length]);

  const selectedUpcomingMatches = useMemo(() => {
    return upcomingMatches
      .map(normalizeMatch)
      .filter((match) => selectedTournamentKey === 'worldcup' ? isWCPhase(match.phase) : !isWCPhase(match.phase))
      .slice(0, 4);
  }, [selectedTournamentKey, upcomingMatches]);

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
    return activeTournamentRows.find((r) => r.wallet.toLowerCase() === target) ?? null;
  }, [activeTournamentRows, myWalletHex]);

  const myRank = myRow?.rank ?? null;
  const myPts = myRow?.totalPoints ?? 0;
  const myExact = myRow?.exact ?? 0;
  const myOutcomes = myRow?.outcomes ?? 0;

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

  return (
    <div className="lb lb--full">
      <div className="lb__bg" aria-hidden="true" />

      <header className="lbTop">
        <div className="lbTop__left">
          {(leaderboardTournamentTabs.length ? leaderboardTournamentTabs : [WORLD_CUP_2026_TOURNAMENT]).map((tournament) => (
            <button
              key={tournament.key}
              className={'lbChip' + (selectedTournamentKey === tournament.key ? ' lbChip--active' : '')}
              type="button"
              onClick={() => setSelectedTournamentKey(tournament.key)}>
              <span className="lbChip__dot">{tournament.icon}</span>
              {tournament.label}
              <span className="lbChip__sub">{loading ? 'Syncing…' : tournament.statusLabel}</span>
            </button>
          ))}

          <button
            className="lbChip lbChip--ghost"
            aria-label="Refresh"
            type="button"
            onClick={fetchLeaderboard}
            title="Refresh">
            ⟳
          </button>
        </div>

        <div className="lbTop__right">
          <StyledWallet />
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

        <div className="lbSearch" role="search">
          <span className="lbSearch__icon" aria-hidden="true">
            ⌕
          </span>
          <input
            className="lbSearch__input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by address"
            aria-label="Search by address"
          />
        </div>
      </section>

      <section className="lbHeaderRow">
        <div className="lbTitle">
          <div className="lbTitle__main">{activeTab}</div>
          <div className="lbTitle__sub muted">
            {selectedTournament.label} • {selectedTournament.statusLabel}
          </div>
        </div>

        <div className="lbPager">
          <span className="muted tiny">{loading ? 'Loading…' : `Players: ${activeTournamentRows.length}`}</span>
          <button className="lbPage" type="button" onClick={fetchLeaderboard}>
            Refresh
          </button>
          <button className="lbPage lbPage--ghost" type="button" onClick={handleJumpToMe} disabled={!myWalletHex}>
            Jump to me
          </button>
        </div>
      </section>

      <main className="lbGrid">
        <section className="lbCard lbCard--table" aria-label="Leaderboard table">
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

            <div className="lbTBody">
              {activeTab === 'My Leaderboard' && !followedWallets.length ? (
                <div className="lbTable__foot muted tiny">
                  No wallets followed yet. Click <b>+</b> next to any player in Global Leaderboard to add them.
                </div>
              ) : loading ? (
                <div className="lbTable__foot muted tiny">Loading on-chain leaderboard…</div>
              ) : displayRows.length === 0 ? (
                <div className="lbTable__foot muted tiny">No wallets found.</div>
              ) : (
                displayRows.map((r) => {
                  const isMe = !!myWalletHex && r.wallet.toLowerCase() === myWalletHex.toLowerCase();
                  const medal = r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : r.rank === 3 ? '🥉' : '•';
                  const isFollowed = followedWallets.includes(r.wallet.toLowerCase());

                  return (
                    <div
                      key={`${r.rank}-${r.wallet}`}
                      id={`lb-row-${r.wallet.toLowerCase()}`}
                      className={'lbTRow lbTRow--6col ' + (isMe ? 'lbTRow--me' : '')}
                      onClick={() => setProfileRow(r)}
                      style={{ cursor: 'pointer' }}>
                      <div className="lbRank">
                        <span className="lbMedal" aria-hidden="true">
                          {medal}
                        </span>
                        <span className="lbRank__no">#{r.rank}</span>
                      </div>

                      <div className="lbWalletCell" title={r.wallet}>
                        <span className="lbAvatar" aria-hidden="true" />
                        <span className="lbWalletCell__text">
                          {r.displayName ?? shortHex(r.wallet)}
                        </span>
                        {isMe ? <span className="lbMe">YOU</span> : null}
                        {/* Add to My Leaderboard button */}
                        <button
                          className={'lbFollowBtn ' + (isFollowed ? 'lbFollowBtn--active' : '')}
                          type="button"
                          title={isFollowed ? 'Remove from My Leaderboard' : 'Add to My Leaderboard'}
                          aria-label={isFollowed ? 'Remove from My Leaderboard' : 'Add to My Leaderboard'}
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
          <section className="lbCard lbChampCard lbChampCard--disabled" aria-disabled="true">
            <div className="lbCard__head">
              <div className="lbCard__title">🏆 Your Championship Picks</div>
            </div>

            <div className="lbChampState lbChampState--empty">
              <p>Championship Picks are not open yet</p>
              <span>Available after the first Round of 32 match is defined.</span>
              <button className="lbBtn lbBtn--disabled wfull" type="button" disabled>
                Waiting for R32 confirmation
              </button>
            </div>
          </section>

          {/* Upcoming Matches — replaces R32 Bonus widget */}
          <section className="lbCard">
            <div className="lbCard__head">
              <div className="lbCard__title">Upcoming Matches</div>
              <button
                className="lbBtn lbBtn--ghost lbBtn--sm"
                type="button"
                onClick={() => navigate('/all-matches')}>
                View full matches →
              </button>
            </div>

            <div className="lbUpcoming">
              {selectedUpcomingMatches.length === 0 ? (
                <div className="muted tiny" style={{ padding: '8px 0' }}>No upcoming matches loaded.</div>
              ) : (
                selectedUpcomingMatches.map((m: any, i: number) => (
                  <div className="lbUpMatch" key={i}>
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
                      className="lbBtn lbBtn--soft lbBtn--sm"
                      type="button"
                      onClick={() => navigate(matchPath(m.phase, m.match_id))}>
                      Predict
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
