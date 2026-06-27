import { type KeyboardEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useAccount, useApi } from '@gear-js/react-hooks';
import { Link, useNavigate } from 'react-router-dom';
import { web3Enable, web3FromSource } from '@polkadot/extension-dapp';
import { TransactionBuilder } from 'sails-js';
import { useGaslessVoucher, withVoucherSignAndSend, TxFactory } from '@/hooks/useGaslessVoucher';
import { decodeAddress } from '@polkadot/util-crypto';
import { u8aToHex } from '@polkadot/util';
import { GetVaraModal } from '@/components/get-vara';
import { StyledWallet, getPreviewWalletAddress } from '@/components/wallet/Wallet';
import { MobileTabBar } from '@/components/layout/mobile-nav';
import { TeamFlag } from '@/components/common/TeamFlag';
import { useToast } from '@/hooks/useToast';
import { useVaraPrice } from '@/hooks/useVaraPrice';
import { usePodiumPick } from '@/hooks/usePodiumPick';
import { useDynamicMinimumBet } from '@/hooks/useDynamicMinimumBet';
import { Program, Service } from '@/hocs/lib';
import { WORLD_CUP_TEAMS, WORLD_CUP_TEAM_LABELS } from '@/utils/teams';
import { getChampionshipPickLockMs } from '@/utils/podium';
import '../matchs/match.css';
import './championship-pick.css';

const PROGRAM_ID = import.meta.env.VITE_BOLAOCOREPROGRAM;
const VARA_DECIMALS = 12n;
const VARA_PLANCK = 10n ** VARA_DECIMALS;
const USD_MINIMUM_MICRO = 3_000_000n;

type ChampionshipPreviewState = 'setup-pending' | 'locked' | 'submitted' | 'price-off' | null;

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
    kick_off?: string | number | bigint;
    kickOff?: string | number | bigint;
    result?: any;
  }>;
  user_points?: Array<[string, number]>;
};

const pickSlots: PickSlot[] = [
  { key: 'champion', medal: '🥇', title: 'Champion', points: '+20 pts', condition: 'If your predicted champion wins the World Cup' },
  { key: 'runnerUp', medal: '🥈', title: 'Runner-Up', points: '+10 pts', condition: 'If your predicted vice champion reaches the final' },
  { key: 'thirdPlace', medal: '🥉', title: '3rd Place', points: '+5 pts', condition: 'If your predicted third-place team wins the 3rd-place match' },
];

function displayTeamName(team: string) {
  if (WORLD_CUP_TEAM_LABELS[team]) return WORLD_CUP_TEAM_LABELS[team];
  return team
    .toLowerCase()
    .split(' ')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
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

function ceilDivBn(a: bigint, b: bigint): bigint {
  if (b <= 0n) return 0n;
  return (a + b - 1n) / b;
}

function toPlanck(amount: number): bigint {
  const fixed = amount.toFixed(12);
  const [integer, fraction = ''] = fixed.split('.');
  const planckFraction = (fraction + '0'.repeat(12)).slice(0, 12);
  return BigInt(integer || '0') * VARA_PLANCK + BigInt(planckFraction || '0');
}

function planckToVaraHuman(planck: bigint): number {
  return Number(planck) / Number(VARA_PLANCK);
}

function formatVaraFromPlanckFixed(planck: bigint, fractionDigits = 2) {
  return planckToVaraHuman(planck).toLocaleString(undefined, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

function formatVaraInputFromPlanck(planck: bigint, fractionDigits = 4) {
  const value = planckToVaraHuman(planck);
  if (!Number.isFinite(value)) return '';
  return value
    .toFixed(fractionDigits)
    .replace(/0+$/, '')
    .replace(/\.$/, '');
}

function formatVaraAmount(amount: number): string {
  const value = Number.isFinite(amount) ? amount : 0;
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getChampionshipPreviewState(): ChampionshipPreviewState {
  if (!import.meta.env.DEV || typeof window === 'undefined') return null;
  const value = new URLSearchParams(window.location.search).get('previewChampionshipState');
  return value === 'setup-pending' || value === 'locked' || value === 'submitted' || value === 'price-off' ? value : null;
}

export function ChampionshipPick() {
  const navigate = useNavigate();
  const { account } = useAccount();
  const { api, isApiReady } = useApi();
  const toast = useToast();
  const effectiveWalletAddress = account?.decodedAddress ?? getPreviewWalletAddress();
  const addressDisplay = effectiveWalletAddress ? formatAddress(effectiveWalletAddress) : "Not connected";
  const mobileAddressDisplay = effectiveWalletAddress ? formatAddress(effectiveWalletAddress, 3, 3) : "Not connected";
  const walletReady = !!effectiveWalletAddress;
  const { ensureVoucher, invalidateVoucher } = useGaslessVoucher(account?.decodedAddress);
  const { rate: varaUsdRate, varaToUsd } = useVaraPrice();
  const podiumPick = usePodiumPick();
  const previewChampionshipState = getChampionshipPreviewState();

  const [picks, setPicks] = useState<Record<PickKey, string>>({ champion: '', runnerUp: '', thirdPlace: '' });
  const [coreState, setCoreState] = useState<CoreState | null>(null);
  const minimumBet = useDynamicMinimumBet(coreState);
  const [loadingState, setLoadingState] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [stakeAmount, setStakeAmount] = useState('');
  const [userBets, setUserBets] = useState<any[]>([]);
  const [desktopPicker, setDesktopPicker] = useState<PickKey | null>(null);
  const [mobilePicker, setMobilePicker] = useState<PickKey | null>(null);
  const submitted = previewChampionshipState === 'submitted' || podiumPick.submitted;

  const selectedTeams = useMemo(() => Object.values(picks).filter(Boolean), [picks]);
  const complete = pickSlots.every((slot) => picks[slot.key]);
  const lockMs = getChampionshipPickLockMs(coreState?.r32_lock_time ?? null, coreState?.matches);
  const hasR32Lock = previewChampionshipState === 'setup-pending' ? false : lockMs !== null;
  const isLocked = previewChampionshipState === 'locked' || (!!lockMs && Date.now() >= lockMs);
  const hasDuplicate = new Set(selectedTeams).size !== selectedTeams.length;
  const stakeAmountNumber = useMemo(() => {
    const amount = Number(String(stakeAmount).replace(',', '.'));
    return Number.isFinite(amount) ? amount : 0;
  }, [stakeAmount]);
  const stakeValuePlanck = useMemo(() => toPlanck(stakeAmountNumber), [stakeAmountNumber]);
  const liveUsdMinimumPlanck = useMemo(() => {
    if (!Number.isFinite(varaUsdRate) || varaUsdRate <= 0) return 0n;
    const priceMicro = BigInt(Math.max(1, Math.floor(varaUsdRate * 1_000_000)));
    return ceilDivBn(USD_MINIMUM_MICRO * VARA_PLANCK, priceMicro);
  }, [varaUsdRate]);
  const liveMinVaraText = useMemo(() => {
    if (liveUsdMinimumPlanck <= 0n) return '';
    return formatVaraFromPlanckFixed(liveUsdMinimumPlanck);
  }, [liveUsdMinimumPlanck]);
  const stakeMinimumPlanck = liveUsdMinimumPlanck > 0n ? liveUsdMinimumPlanck : minimumBet.minPlanck;
  const stakeBelowMinimum = stakeValuePlanck < stakeMinimumPlanck;
  const isStakePricingAvailable = liveUsdMinimumPlanck > 0n && previewChampionshipState !== 'price-off';
  const stakeMinimumLabel = isStakePricingAvailable
    ? `Minimum required: ${liveMinVaraText} VARA (${minimumBet.targetUsdText})`
    : 'Minimum unavailable until the VARA/USD price feed reconnects.';
  const stakePlaceholder = liveMinVaraText ? `Min ${liveMinVaraText}` : '';

  const canSubmit =
    !!account &&
    isApiReady &&
    hasR32Lock &&
    isStakePricingAvailable &&
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
    if (!walletReady) return 'Connect wallet to submit';
    if (!isApiReady) return 'Node API not ready';
    if (!hasR32Lock) return 'Loading pick availability';
    if (isLocked) return 'Championship Pick Locked';
    if (!isStakePricingAvailable) return 'Price feed reconnecting';
    if (!complete) return 'Select all 3 teams';
    if (hasDuplicate) return 'Choose 3 different teams';
    if (stakeBelowMinimum) return liveMinVaraText ? `Min $3 USD ≈ ${liveMinVaraText} VARA` : minimumBet.shortLabel;
    return `Submit Championship Pick (${formatVaraAmount(stakeAmountNumber)} VARA)`;
  }, [complete, hasDuplicate, hasR32Lock, isApiReady, isLocked, isStakePricingAvailable, liveMinVaraText, minimumBet.shortLabel, stakeAmountNumber, stakeBelowMinimum, submitted, submitting, walletReady]);

  const stateNotice = useMemo(() => {
    if (submitted) {
      return {
        tone: 'success',
        title: 'Championship Pick submitted',
        body: 'Your Top 3 pick is saved. Team selectors and stake controls are locked for this wallet.',
      };
    }
    if (!walletReady) {
      return {
        tone: 'warn',
        title: 'Wallet required',
        body: 'Connect your wallet to submit your Championship Pick on-chain.',
      };
    }
    if (!isApiReady) {
      return {
        tone: 'warn',
        title: 'Node API not ready',
        body: 'The page is waiting for the Vara node connection before submission can start.',
      };
    }
    if (!hasR32Lock) {
      return {
        tone: 'warn',
        title: 'Checking availability',
        body: 'Championship Picks open as soon as the first Round of 32 match is registered.',
      };
    }
    if (isLocked) {
      return {
        tone: 'locked',
        title: 'Championship Pick locked',
        body: 'The Round of 32 lock has passed. Team selectors and stake controls are now read-only.',
      };
    }
    if (!isStakePricingAvailable) {
      return {
        tone: 'warn',
        title: 'Price feed reconnecting',
        body: 'Submission is paused while the $3 minimum stake can be calculated safely.',
      };
    }
    if (!complete) {
      return {
        tone: 'info',
        title: 'Select all three teams',
        body: 'Choose Champion, Runner-Up, and 3rd Place before submitting.',
      };
    }
    if (hasDuplicate) {
      return {
        tone: 'warn',
        title: 'Choose different teams',
        body: 'Champion, Runner-Up, and 3rd Place must be three different teams.',
      };
    }
    if (stakeAmountNumber > 0 && stakeBelowMinimum) {
      return {
        tone: 'warn',
        title: 'Stake below minimum',
        body: stakeMinimumLabel,
      };
    }
    return {
      tone: 'success',
      title: 'Ready to submit',
      body: 'Review your Top 3 teams and submit the Championship Pick transaction.',
    };
  }, [complete, hasDuplicate, hasR32Lock, isApiReady, isLocked, isStakePricingAvailable, stakeAmountNumber, stakeBelowMinimum, stakeMinimumLabel, submitted, walletReady]);

  function updatePick(key: PickKey, team: string) {
    setPicks((current) => ({ ...current, [key]: team }));
  }

  function chooseDesktopPick(key: PickKey, team: string) {
    updatePick(key, team);
    setDesktopPicker(null);
  }

  function chooseMobilePick(key: PickKey, team: string) {
    updatePick(key, team);
    setMobilePicker(null);
  }

  const mobilePickerSlot = mobilePicker ? pickSlots.find((slot) => slot.key === mobilePicker) ?? null : null;

  const handleDesktopPickerKeyDown = (event: KeyboardEvent, key: PickKey) => {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setDesktopPicker(key);
    }
    if (event.key === 'Escape') {
      setDesktopPicker(null);
    }
  };

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
              kick_off: match?.kick_off ?? match?.kickOff ?? 0,
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
    if (!api || !isApiReady || !PROGRAM_ID || !myWalletHex) {
      setUserBets([]);
      return;
    }

    try {
      const svc = new Service(new Program(api, PROGRAM_ID));
      const bets = (await (svc as any).queryBetsByUser(myWalletHex)) as any[];
      setUserBets(Array.isArray(bets) ? bets : []);
    } catch {
      setUserBets([]);
    }
  }, [api, isApiReady, myWalletHex]);

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

  useEffect(() => {
    if (!desktopPicker) return;

    const closeOnOutsideClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (target?.closest('.cpSelect')) return;
      setDesktopPicker(null);
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setDesktopPicker(null);
    };

    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [desktopPicker]);

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
    if (!hasR32Lock) {
      toast.error('Championship Pick availability is still loading');
      return;
    }
    if (isLocked) {
      toast.error('Championship Pick is locked');
      return;
    }
    if (!isStakePricingAvailable) {
      toast.error('Championship Pick is paused while the VARA/USD price feed reconnects.');
      return;
    }
    if (stakeBelowMinimum) {
      toast.error(`Minimum Championship Pick amount is ${stakeMinimumLabel}`);
      return;
    }

    try {
      setSubmitting(true);

      const source = account.meta?.source;
      if (!source) throw new Error('Wallet source unavailable');
      const extensions = await web3Enable('SmartCup League');
      if (!extensions.length) throw new Error('Wallet extension access was not granted');
      const { signer } = await web3FromSource(source);

      const txFactory: TxFactory = () =>
        (new Service(new Program(api, PROGRAM_ID)) as any).submitPodiumPick(
          picks.champion,
          picks.runnerUp,
          picks.thirdPlace,
        );

      const { blockHash, response } = await withVoucherSignAndSend({
        txFactory,
        account: account.decodedAddress,
        signerOptions: { signer },
        value: stakeValuePlanck,
        ensureVoucher,
        invalidateVoucher,
        // uses default calculateGas() — no extra params
      });
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
  }, [account, api, complete, fetchCoreState, hasDuplicate, hasR32Lock, isApiReady, isLocked, isStakePricingAvailable, picks, podiumPick, previewChampionshipState, stakeBelowMinimum, stakeMinimumLabel, stakeValuePlanck, toast, ensureVoucher, invalidateVoucher]);

  const controlsLocked = submitted || submitting || isLocked;

  useEffect(() => {
    if (controlsLocked) {
      setDesktopPicker(null);
      setMobilePicker(null);
    }
  }, [controlsLocked]);

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
            <div className="arena__walletGroup">
              <div className="arena__address dim">
                {effectiveWalletAddress ? (
                  <>
                    <span className="arena__addressDesktop">{addressDisplay}</span>
                    <span className="arena__addressMobile">{mobileAddressDisplay}</span>
                  </>
                ) : (
                  addressDisplay
                )}
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
                  <b>{hasR32Lock && !isLocked ? 'Open' : isLocked ? 'Locked' : 'Checking setup'}</b>
                </div>
                <div className="sideRow">
                  <span>Pick status</span>
                  <b>{submitted ? 'Submitted' : !hasR32Lock ? 'Checking' : isLocked ? 'Locked' : 'Open'}</b>
                </div>
                <div className="sideRow">
                  <span>Minimum stake</span>
                  <b>{liveMinVaraText ? `${liveMinVaraText} VARA` : 'Price feed reconnecting'}</b>
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

                <div className={`cpStateNotice cpStateNotice--${stateNotice.tone}`} role="status" aria-live="polite">
                  <strong>{stateNotice.title}</strong>
                  <span>{stateNotice.body}</span>
                </div>

                <div className="cpPickList">
                  {pickSlots.map((slot) => {
                    const value = picks[slot.key];
                    const disabled = controlsLocked;
                    return (
                      <div className="cpPick" key={slot.key}>
                        <span className="cpPick__meta">
                          <span className="cpPick__medal" aria-hidden="true">{slot.medal}</span>
                          <span>
                            <strong>{slot.title}</strong>
                            <small>{slot.points}</small>
                          </span>
                        </span>

                        <span className={`cpSelect ${desktopPicker === slot.key ? 'is-open' : ''}`}>
                          {value ? <TeamFlag className="cpSelect__flag" team={value} alt="" /> : <span className="cpSelect__empty" />}
                          <button
                            className="cpSelect__trigger"
                            type="button"
                            onClick={() => setDesktopPicker((current) => current === slot.key ? null : slot.key)}
                            onKeyDown={(event) => handleDesktopPickerKeyDown(event, slot.key)}
                            disabled={disabled}
                            aria-haspopup="listbox"
                            aria-expanded={desktopPicker === slot.key}
                            aria-controls={`cp-team-menu-${slot.key}`}
                            aria-label={`Select ${slot.title} team`}>
                            <span>{value ? displayTeamName(value) : 'Select Team'}</span>
                            <span className="cpSelect__chevron" aria-hidden="true">⌄</span>
                          </button>
                          {desktopPicker === slot.key ? (
                            <div className="cpTeamMenu" id={`cp-team-menu-${slot.key}`} role="listbox" aria-label={`Select ${slot.title} team`}>
                              <button
                                className={!value ? 'is-selected' : ''}
                                type="button"
                                role="option"
                                aria-selected={!value}
                                onClick={() => chooseDesktopPick(slot.key, '')}>
                                <span className="cpSelect__empty" />
                                <span>Select Team</span>
                                {!value ? <b>Selected</b> : null}
                              </button>
                              {WORLD_CUP_TEAMS.map((team) => {
                                const selectedInThisSlot = value === team.value;
                                const disabledByOtherSlot = !selectedInThisSlot && selectedTeams.includes(team.value);
                                return (
                                  <button
                                    className={selectedInThisSlot ? 'is-selected' : ''}
                                    key={team.value}
                                    type="button"
                                    role="option"
                                    aria-selected={selectedInThisSlot}
                                    onClick={() => chooseDesktopPick(slot.key, team.value)}
                                    disabled={disabledByOtherSlot}>
                                    <TeamFlag className="cpSelect__flag" team={team.value} alt="" />
                                    <span>{displayTeamName(team.value)}</span>
                                    {selectedInThisSlot ? <b>Selected</b> : null}
                                  </button>
                                );
                              })}
                            </div>
                          ) : null}
                          <button
                            className="cpSelect__mobileBtn"
                            type="button"
                            onClick={() => {
                              setDesktopPicker(null);
                              setMobilePicker(slot.key);
                            }}
                            disabled={disabled}
                            aria-label={`Select ${slot.title} team`}>
                            <span>{value ? displayTeamName(value) : 'Select Team'}</span>
                            <span aria-hidden="true">v</span>
                          </button>
                        </span>
                      </div>
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
                          placeholder={stakePlaceholder}
                          disabled={controlsLocked}
                        />
                      </span>
                      <span className="cpStakeField__minimum">{stakeMinimumLabel}</span>
                    </label>

                    <div className="cpQuickRow" aria-label="Quick stake amount controls">
                      <button type="button" disabled={controlsLocked || !isStakePricingAvailable} onClick={() => setStakeAmount(formatVaraInputFromPlanck(liveUsdMinimumPlanck, 12))}>Min</button>
                      <button type="button" disabled={controlsLocked} onClick={() => setStakeAmount(String((stakeAmountNumber || 0) + 1))}>+1</button>
                      <button type="button" disabled={controlsLocked} onClick={() => setStakeAmount(String((stakeAmountNumber || 0) + 10))}>+10</button>
                      <button type="button" disabled={controlsLocked} onClick={() => setStakeAmount(String((stakeAmountNumber || 0) + 50))}>+50</button>
                    </div>
                  </div>

                  <div className="cpStakeBox__meta">
                    {stakeAmountNumber > 0 && varaToUsd(stakeAmountNumber) ? (
                      <span className="cpStakeBox__converted">{varaToUsd(stakeAmountNumber)}</span>
                    ) : null}
                    <span className="cpStakeBox__payout">95% Final Prize Pool • 5% Protocol Fee</span>
                  </div>
                </div>

                <div className="cpSubmitRow">
                  <button className="cpSubmit" type="button" disabled={!canSubmit} onClick={() => void handleSubmit()}>
                    {submitLabel}
                  </button>
                  {!hasR32Lock ? (
                    <span className="cpWarn">Championship Pick availability is still loading.</span>
                  ) : !isStakePricingAvailable ? (
                    <span className="cpWarn">Championship Pick is paused while the VARA/USD price feed reconnects, so the $3 minimum can be calculated correctly.</span>
                  ) : stakeAmountNumber > 0 && stakeBelowMinimum ? (
                    <span className="cpWarn">{stakeMinimumLabel}</span>
                  ) : (
                    <span>Your stake is submitted together with your Championship Pick.</span>
                  )}
                </div>
              </section>
            </section>
          </main>
        </div>

        <footer className="match-footer cpFooter">
          <div className="cpFooter__links">
            <span className="match-footer__copy">© 2026 SmartCup League</span>
            <span className="match-footer__sep">·</span>
            <Link to="/terms-of-use" className="match-footer__link">Terms of Use</Link>
            <span className="match-footer__sep">·</span>
            <Link to="/rules" className="match-footer__link">Rules</Link>
            <span className="match-footer__sep">·</span>
            <Link to="/dao-constitution" className="match-footer__link">DAO Constitution</Link>
          </div>
          <GetVaraModal placement="footer" />
        </footer>
      </div>
      {mobilePickerSlot ? (
        <div className="cpTeamSheet" role="dialog" aria-modal="true" aria-label={`Select ${mobilePickerSlot.title} team`}>
          <button className="cpTeamSheet__backdrop" type="button" aria-label="Close team selector" onClick={() => setMobilePicker(null)} />
          <div className="cpTeamSheet__panel">
            <div className="cpTeamSheet__head">
              <div>
                <span>Choose team</span>
                <strong>{mobilePickerSlot.title}</strong>
              </div>
              <button type="button" onClick={() => setMobilePicker(null)}>Close</button>
            </div>

            <div className="cpTeamSheet__list">
              <button
                className={!picks[mobilePickerSlot.key] ? 'is-selected' : ''}
                type="button"
                onClick={() => chooseMobilePick(mobilePickerSlot.key, '')}>
                <span className="cpSelect__empty" />
                <span>Select Team</span>
              </button>
              {WORLD_CUP_TEAMS.map((team) => {
                const selectedInThisSlot = picks[mobilePickerSlot.key] === team.value;
                const disabledByOtherSlot = !selectedInThisSlot && selectedTeams.includes(team.value);
                return (
                  <button
                    className={selectedInThisSlot ? 'is-selected' : ''}
                    key={team.value}
                    type="button"
                    onClick={() => chooseMobilePick(mobilePickerSlot.key, team.value)}
                    disabled={disabledByOtherSlot}>
                    <TeamFlag className="cpSelect__flag" team={team.value} alt="" />
                    <span>{displayTeamName(team.value)}</span>
                    {selectedInThisSlot ? <b>Selected</b> : null}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
      <MobileTabBar />
    </div>
  );
}
