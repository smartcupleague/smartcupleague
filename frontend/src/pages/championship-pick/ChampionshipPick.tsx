import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAccount, useApi } from '@gear-js/react-hooks';
import { Link, useNavigate } from 'react-router-dom';
import { web3FromSource } from '@polkadot/extension-dapp';
import { TransactionBuilder } from 'sails-js';
import { decodeAddress } from '@polkadot/util-crypto';
import { u8aToHex } from '@polkadot/util';
import { StyledWallet } from '@/components/wallet/Wallet';
import { TeamFlag } from '@/components/common/TeamFlag';
import { useToast } from '@/hooks/useToast';
import { useVaraPrice } from '@/hooks/useVaraPrice';
import { usePodiumPick } from '@/hooks/usePodiumPick';
import { useDynamicMinimumBet } from '@/hooks/useDynamicMinimumBet';
import { Program, Service } from '@/hocs/lib';
import { TEAM_FLAGS } from '@/utils/teams';
import '../matchs/match.css';
import './championship-pick.css';

const PROGRAM_ID = import.meta.env.VITE_BOLAOCOREPROGRAM;
const VARA_DECIMALS = 12n;
const VARA_PLANCK = 10n ** VARA_DECIMALS;

type PickKey = 'champion' | 'runnerUp' | 'thirdPlace';

type PickSlot = {
  key: PickKey;
  medal: string;
  title: string;
  points: string;
  condition: string;
};

type CoreState = {
  r32_lock_time?: string | number | bigint | null;
  podium_finalized?: boolean;
  vara_price_usd_micro?: string | number | bigint | null;
  price_cached_at?: string | number | bigint | null;
  price_staleness_limit_ms?: string | number | bigint | null;
  matches?: Array<{
    match_id: string | number;
    phase?: string;
    result?: any;
  }>;
  user_points?: Array<[string, number]>;
};

const pickSlots: PickSlot[] = [
  { key: 'champion', medal: '🥇', title: 'Champion', points: '+20 pts', condition: 'If your predicted champion wins the World Cup' },
  { key: 'runnerUp', medal: '🥈', title: 'Runner-Up', points: '+10 pts', condition: 'If your predicted vice champion reaches the final' },
  { key: 'thirdPlace', medal: '🥉', title: '3rd Place', points: '+5 pts', condition: 'If your predicted third-place team wins the 3rd-place match' },
];

const teams = Object.keys(TEAM_FLAGS).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

function displayTeamName(team: string) {
  return team
    .toLowerCase()
    .split(' ')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function timestampToMs(value?: string | number | bigint | null) {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n < 10_000_000_000 ? n * 1000 : n;
}

function formatLockTime(ms: number | null) {
  if (!ms) return 'R32 lock not set';
  return new Date(ms).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatAddress(addr?: string, start = 4, end = 4) {
  if (!addr) return "—";
  if (addr.length <= start + end) return addr;
  return `${addr.slice(0, start)}…${addr.slice(-end)}`;
}

function toHexAddress(input?: string | null): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('0x')) return trimmed.toLowerCase();
  try {
    return u8aToHex(decodeAddress(trimmed)).toLowerCase();
  } catch {
    return null;
  }
}

function normalizeAmountInput(value: string) {
  const normalized = String(value ?? '')
    .replace(',', '.')
    .replace(/[^\d.]/g, '');
  const parts = normalized.split('.');
  if (parts.length <= 1) return normalized;
  return `${parts[0]}.${parts.slice(1).join('')}`;
}

function toPlanck(amount: number): bigint {
  const fixed = amount.toFixed(12);
  const [integer, fraction = ''] = fixed.split('.');
  const planckFraction = (fraction + '0'.repeat(12)).slice(0, 12);
  return BigInt(integer || '0') * VARA_PLANCK + BigInt(planckFraction || '0');
}

export function ChampionshipPick() {
  const navigate = useNavigate();
  const { account } = useAccount();
  const { api, isApiReady } = useApi();
  const toast = useToast();
  const { varaToUsd } = useVaraPrice();
  const podiumPick = usePodiumPick();

  const [picks, setPicks] = useState<Record<PickKey, string>>({ champion: '', runnerUp: '', thirdPlace: '' });
  const [coreState, setCoreState] = useState<CoreState | null>(null);
  const minimumBet = useDynamicMinimumBet(coreState);
  const [loadingState, setLoadingState] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [stakeAmount, setStakeAmount] = useState('');
  const [userBets, setUserBets] = useState<any[]>([]);
  const submitted = podiumPick.submitted;

  const selectedTeams = useMemo(() => Object.values(picks).filter(Boolean), [picks]);
  const complete = pickSlots.every((slot) => picks[slot.key]);
  const lockMs = timestampToMs(coreState?.r32_lock_time ?? null);
  const isLocked = !!lockMs && Date.now() >= lockMs;
  const hasDuplicate = new Set(selectedTeams).size !== selectedTeams.length;
  const stakeAmountNumber = useMemo(() => {
    const amount = Number(String(stakeAmount).replace(',', '.'));
    return Number.isFinite(amount) ? amount : 0;
  }, [stakeAmount]);
  const stakeValuePlanck = useMemo(() => toPlanck(stakeAmountNumber), [stakeAmountNumber]);
  const stakeBelowMinimum = stakeValuePlanck < minimumBet.minPlanck;

  useEffect(() => {
    if (stakeAmount === '' && !minimumBet.isLoading && minimumBet.minVaraText) {
      setStakeAmount(minimumBet.minVaraText);
    }
  }, [minimumBet.isLoading, minimumBet.minVaraText, stakeAmount]);

  const canSubmit =
    !!account &&
    isApiReady &&
    complete &&
    !hasDuplicate &&
    !isLocked &&
    !submitted &&
    !submitting &&
    !stakeBelowMinimum;
  const myWalletHex = useMemo(() => {
    const addr = account?.decodedAddress ?? (account as any)?.address ?? null;
    return toHexAddress(addr);
  }, [account]);

  const userRankInfo = useMemo(() => {
    if (!myWalletHex || !coreState?.user_points?.length) return { rank: null as number | null, points: 0 };
    const sorted = [...coreState.user_points].sort((a, b) => Number(b[1]) - Number(a[1]));
    const idx = sorted.findIndex(([wallet]) => wallet.toLowerCase() === myWalletHex);
    return { rank: idx >= 0 ? idx + 1 : null, points: idx >= 0 ? Number(sorted[idx][1]) : 0 };
  }, [coreState?.user_points, myWalletHex]);

  const userBetStats = useMemo(() => {
    if (!account || !userBets.length || !coreState?.matches?.length) {
      return { matchesPredicted: 0, exactResults: 0, correctOutcomes: 0 };
    }

    let exact = 0;
    let outcome = 0;

    for (const bet of userBets) {
      const match = coreState.matches.find((item) => String(item.match_id) === String(bet?.match_id ?? ''));
      const finalized = (match?.result as any)?.Finalized ?? (match?.result as any)?.finalized;
      if (!finalized?.score) continue;

      const finalScore = { home: Number(finalized.score.home ?? 0), away: Number(finalized.score.away ?? 0) };
      const betScore = { home: Number(bet?.score?.home ?? 0), away: Number(bet?.score?.away ?? 0) };

      if (betScore.home === finalScore.home && betScore.away === finalScore.away) {
        exact++;
        outcome++;
        continue;
      }

      const finalOutcome = finalScore.home > finalScore.away ? 1 : finalScore.home < finalScore.away ? -1 : 0;
      const betOutcome = betScore.home > betScore.away ? 1 : betScore.home < betScore.away ? -1 : 0;
      if (finalOutcome !== 0 && betOutcome === finalOutcome) outcome++;
    }

    return { matchesPredicted: userBets.length, exactResults: exact, correctOutcomes: outcome };
  }, [account, coreState?.matches, userBets]);

  const matchPhaseLabel = useMemo(() => {
    const phase = coreState?.matches?.find((match) => String(match.phase ?? '').trim())?.phase ?? 'Group Stage';
    return String(phase).replace(/_/g, ' ');
  }, [coreState?.matches]);

  const submitLabel = useMemo(() => {
    if (submitting) return 'Submitting Pick...';
    if (submitted) return 'Championship Pick Submitted';
    if (!account) return 'Connect wallet to submit';
    if (!isApiReady) return 'Node API not ready';
    if (isLocked) return 'Championship Pick Locked';
    if (!complete) return 'Select all 3 teams';
    if (hasDuplicate) return 'Choose 3 different teams';
    if (stakeBelowMinimum) return minimumBet.shortLabel;
    return `Submit Championship Pick (${stakeAmountNumber || 0} VARA)`;
  }, [account, complete, hasDuplicate, isApiReady, isLocked, minimumBet.shortLabel, stakeAmountNumber, stakeBelowMinimum, submitted, submitting]);

  function updatePick(key: PickKey, team: string) {
    setPicks((current) => ({ ...current, [key]: team }));
  }

  const fetchCoreState = useCallback(async () => {
    if (!api || !isApiReady || !PROGRAM_ID) return;
    setLoadingState(true);
    try {
      const svc = new Service(new Program(api, PROGRAM_ID));
      const state = (await (svc as any).queryState()) as any;
      setCoreState({
        r32_lock_time: state?.r32_lock_time ?? null,
        podium_finalized: Boolean(state?.podium_finalized),
        vara_price_usd_micro: state?.vara_price_usd_micro ?? null,
        price_cached_at: state?.price_cached_at ?? null,
        price_staleness_limit_ms: state?.price_staleness_limit_ms ?? null,
        matches: Array.isArray(state?.matches)
          ? state.matches.map((match: any) => ({
              match_id: match?.match_id ?? '',
              phase: String(match?.phase ?? ''),
              result: match?.result ?? null,
            }))
          : [],
        user_points: Array.isArray(state?.user_points)
          ? state.user_points.map((item: any) => [String(item?.[0] ?? ''), Number(item?.[1] ?? 0)] as [string, number])
          : [],
      });
    } catch (error) {
      console.error('Failed to load podium pick state', error);
      toast.error('Failed to load Championship Pick state');
    } finally {
      setLoadingState(false);
    }
  }, [api, isApiReady, toast]);

  useEffect(() => {
    void fetchCoreState();
  }, [fetchCoreState]);

  const fetchUserBets = useCallback(async () => {
    if (!api || !isApiReady || !PROGRAM_ID || !account) {
      setUserBets([]);
      return;
    }

    try {
      const svc = new Service(new Program(api, PROGRAM_ID));
      const bets = (await (svc as any).queryBetsByUser(account.decodedAddress)) as any[];
      setUserBets(Array.isArray(bets) ? bets : []);
    } catch {
      setUserBets([]);
    }
  }, [account, api, isApiReady]);

  useEffect(() => {
    void fetchUserBets();
  }, [fetchUserBets]);

  useEffect(() => {
    if (!podiumPick.pick) {
      setPicks({ champion: '', runnerUp: '', thirdPlace: '' });
      return;
    }

    setPicks({
      champion: podiumPick.pick.champion,
      runnerUp: podiumPick.pick.runnerUp,
      thirdPlace: podiumPick.pick.thirdPlace,
    });
  }, [podiumPick.pick]);

  const handleSubmit = useCallback(async () => {
    if (!account) {
      toast.error('Connect your wallet first');
      return;
    }
    if (!api || !isApiReady || !PROGRAM_ID) {
      toast.error('Node API not ready');
      return;
    }
    if (!complete) {
      toast.error('Select Champion, Runner-Up, and 3rd Place');
      return;
    }
    if (hasDuplicate) {
      toast.error('Choose three different teams');
      return;
    }
    if (isLocked) {
      toast.error('Championship Pick is locked');
      return;
    }
    if (stakeBelowMinimum) {
      toast.error(`Minimum Championship Pick amount is ${minimumBet.label}`);
      return;
    }

    try {
      setSubmitting(true);
      const svc = new Service(new Program(api, PROGRAM_ID));
      const tx: TransactionBuilder<unknown> = (svc as any).submitPodiumPick(
        picks.champion,
        picks.runnerUp,
        picks.thirdPlace,
      );

      const source = account.meta?.source;
      if (!source) throw new Error('Wallet source unavailable');
      const { signer } = await web3FromSource(source);

      tx.withAccount(account.decodedAddress, { signer }).withValue(stakeValuePlanck);
      await tx.calculateGas();

      const { blockHash, response } = await tx.signAndSend();
      toast.info(`Championship Pick included in block ${blockHash}`);
      await response();

      podiumPick.cachePick(picks);
      toast.success('Championship Pick submitted successfully');
      await Promise.all([fetchCoreState(), podiumPick.refresh()]);
    } catch (error: any) {
      console.error('Championship Pick submission failed', error);
      toast.error(error?.message ?? 'Championship Pick submission failed');
    } finally {
      setSubmitting(false);
    }
  }, [account, api, complete, fetchCoreState, hasDuplicate, isApiReady, isLocked, minimumBet.label, picks, podiumPick, stakeBelowMinimum, stakeValuePlanck, toast]);

  return (
    <div className="cpArena">
      <div className="arena__frame cpArena__frame">
        <header className="arena__topbar">
          <div className="arena__topbarLeft">
            <button
              className="arena__logoBtn arena__logoBtn--sm"
              type="button"
              onClick={() => navigate("/")}
              aria-label="SmartCup League home">
              <img className="logo-xs" src="/Logos.png" alt="SmartCup League" />
            </button>
            <button
              className="arena__backBtn"
              type="button"
              onClick={() => navigate("/all-matches")}
              aria-label="Back to All Matches">
              ← All Matches
            </button>
          </div>

          <div className="arena__topbarRight">
            <span className="arena__statPill">Locks: {loadingState ? "Loading..." : formatLockTime(lockMs)}</span>
            <div className="arena__walletGroup">
              <div className="arena__address dim">
                {account?.decodedAddress ? formatAddress(account.decodedAddress) : "Not connected"}
              </div>
              <StyledWallet />
            </div>
          </div>
        </header>

        <div className="arena__grid cpArena__grid">
          <aside className="left-column">
            <section className="sideCard">
              <div className="sideCard__title">YOUR TOURNAMENT STATS</div>
              <div className="sideRows">
                <div className="sideRow">
                  <span className="dim">Position</span>
                  <b>{userRankInfo.rank ? `#${userRankInfo.rank}` : '—'}</b>
                </div>
                <div className="sideRow">
                  <span className="dim">Points</span>
                  <b>{account ? userRankInfo.points : '—'}</b>
                </div>
                <div className="sideRow">
                  <span className="dim">Matches Predicted</span>
                  <b>{account ? userBetStats.matchesPredicted : '—'}</b>
                </div>
                <div className="sideRow">
                  <span className="dim">Exact Results</span>
                  <b>{account ? userBetStats.exactResults : '—'}</b>
                </div>
                <div className="sideRow">
                  <span className="dim">Correct Outcomes</span>
                  <b>{account ? userBetStats.correctOutcomes : '—'}</b>
                </div>
                <div className="sideDivider" />
                <div className="sideRow">
                  <span className="dim">Match Phase</span>
                  <b className="arena__phaseCenter">{matchPhaseLabel}</b>
                </div>
              </div>
            </section>

            <section className="sideCard">
              <div className="sideCard__title">Tournament Status</div>
              <div className="sideRows">
                <div className="sideRow">
                  <span>Stage</span>
                  <b>Pre R32</b>
                </div>
                <div className="sideRow">
                  <span>Pick status</span>
                  <b>{submitted ? 'Submitted' : isLocked ? 'Locked' : 'Open'}</b>
                </div>
                <div className="sideRow">
                  <span>Minimum stake</span>
                  <b>{minimumBet.minVaraText} VARA</b>
                </div>
                <div className="sideDivider" />
                <div className="sideHint">All three picks lock permanently at the Round of 32 kickoff.</div>
              </div>
            </section>

            <section className="sideCard">
              <div className="sideCard__title">Bonus Points</div>
              <div className="sideRows">
                {pickSlots.map((slot) => (
                  <div className="sideRow" key={slot.key}>
                    <span>{slot.medal} {slot.title}</span>
                    <b>{slot.points}</b>
                  </div>
                ))}
              </div>
              <div className="sideHint">Adds bonus points to the tournament leaderboard.</div>
            </section>

            <section className="sideCard">
              <div className="sideCard__title">Allocation</div>
              <div className="barGroup">
                <div>
                  <div className="barRow"><span>Final Prize Pool</span><b>95%</b></div>
                  <div className="bar"><i style={{ width: '95%' }} /></div>
                </div>
                <div>
                  <div className="barRow"><span>Protocol Fee</span><b>5%</b></div>
                  <div className="bar"><i style={{ width: '5%' }} /></div>
                </div>
              </div>
              <div className="sideHint">This bonus pick does not affect match payouts.</div>
            </section>

            <section className="sideCard">
              <div className="sideCard__title">Rules</div>
              <ul className="checkList">
                <li>One Championship Pick per wallet</li>
                <li>Champion, Runner-Up, and 3rd Place must be different teams</li>
                <li>Submission is final after signing on-chain</li>
              </ul>
            </section>
          </aside>

          <main className="main-column">
            <section className="mainPanel mainPanel--fill cpMainPanel">
              <div className="cpHero">
                <div>
                  <div className="cpEyebrow">Pick Top 3 Teams</div>
                  <h1>🏆 Championship Prediction</h1>
                  <p>Winner, Runner-Up, and 3rd Place for the entire tournament.</p>
                </div>
                <div className="cpLock">
                  <span>{isLocked ? 'LOCKED' : 'LOCKS'}</span>
                  <strong>{loadingState ? 'Loading...' : formatLockTime(lockMs)}</strong>
                </div>
              </div>

              <section className="cpPanel" aria-labelledby="championship-pick-title">
                <div className="cpPanel__head">
                  <div>
                    <h2 id="championship-pick-title">Championship Pick</h2>
                    <p>Submit Winner, Runner-Up, and 3rd Place before the Round of 32 begins.</p>
                  </div>
                </div>

                <div className="cpPickList">
                  {pickSlots.map((slot) => {
                    const value = picks[slot.key];
                    return (
                      <label className="cpPick" key={slot.key}>
                        <span className="cpPick__meta">
                          <span className="cpPick__medal" aria-hidden="true">{slot.medal}</span>
                          <span>
                            <strong>{slot.title}</strong>
                            <small>{slot.points}</small>
                          </span>
                        </span>

                        <span className="cpSelect">
                          {value ? <TeamFlag className="cpSelect__flag" team={value} alt="" /> : <span className="cpSelect__empty" />}
                          <select
                            value={value}
                            onChange={(event) => updatePick(slot.key, event.target.value)}
                            aria-label={slot.title}
                            disabled={submitted || submitting || isLocked}>
                            <option value="">Select Team</option>
                            {teams.map((team) => (
                              <option key={team} value={team} disabled={value !== team && selectedTeams.includes(team)}>
                                {displayTeamName(team)}
                              </option>
                            ))}
                          </select>
                        </span>
                      </label>
                    );
                  })}
                </div>

                <div className="cpStakeBox">
                  <div className="cpStakeBox__main">
                    <label className="cpStakeField">
                      <span>Championship Pick Stake</span>
                      <span className="cpStakeField__input">
                        <span>VARA</span>
                        <input
                          inputMode="decimal"
                          value={stakeAmount}
                          onChange={(event) => setStakeAmount(normalizeAmountInput(event.target.value))}
                          placeholder="0.00"
                          disabled={submitted || submitting || isLocked}
                        />
                      </span>
                    </label>

                    <div className="cpQuickRow" aria-label="Quick stake amount controls">
                      <button type="button" onClick={() => setStakeAmount(minimumBet.minVaraText)}>Min</button>
                      <button type="button" onClick={() => setStakeAmount(String((stakeAmountNumber || 0) + 1))}>+1</button>
                      <button type="button" onClick={() => setStakeAmount(String((stakeAmountNumber || 0) + 10))}>+10</button>
                      <button type="button" onClick={() => setStakeAmount(String((stakeAmountNumber || 0) + 50))}>+50</button>
                    </div>
                  </div>

                  <div className="cpStakeBox__meta">
                    {stakeAmountNumber > 0 && varaToUsd(stakeAmountNumber) ? (
                      <span className="cpStakeBox__converted">{varaToUsd(stakeAmountNumber)}</span>
                    ) : null}
                    <span>95% Final Prize • 5% Protocol Fee</span>
                  </div>
                </div>

                <div className="cpSubmitRow">
                  <button className="cpSubmit" type="button" disabled={!canSubmit} onClick={() => void handleSubmit()}>
                    {submitLabel}
                  </button>
                  {stakeAmountNumber > 0 && stakeBelowMinimum ? (
                    <span className="cpWarn">{minimumBet.label}</span>
                  ) : (
                    <span>Payment is sent on-chain with the Championship Pick transaction.</span>
                  )}
                </div>
              </section>
            </section>
          </main>
        </div>

        <footer className="match-footer">
          <span>© 2026 SmartCup League</span>
          <span className="match-footer__sep">·</span>
          <Link to="/terms-of-use" className="match-footer__link">Terms of Use</Link>
          <span className="match-footer__sep">·</span>
          <Link to="/rules" className="match-footer__link">Rules</Link>
          <span className="match-footer__sep">·</span>
          <Link to="/dao-constitution" className="match-footer__link">DAO Constitution</Link>
        </footer>
      </div>
    </div>
  );
}
