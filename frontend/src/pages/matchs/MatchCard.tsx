import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useVaraPrice } from '@/hooks/useVaraPrice';
import { useAccount, useApi } from '@gear-js/react-hooks';
import { web3Enable, web3FromSource } from '@polkadot/extension-dapp';
import { Program, Service } from '@/hocs/lib';
import { TransactionBuilder } from 'sails-js';
import { useToast } from '@/hooks/useToast';
import './matchcard.css';
import { HexString } from '@gear-js/api';
import { TeamFlag } from '@/components/common/TeamFlag';
import { reportBet } from '@/utils/statsReporter';

const PROGRAM_ID = import.meta.env.VITE_BOLAOCOREPROGRAM as string;

type Score = { home: number; away: number };
type ResultStatus = any;

type MatchInfo = {
  match_id: string;
  phase: string;
  home: string;
  away: string;
  kick_off: string;
  result: ResultStatus;
  match_prize_pool?: string;
  total_winner_stake?: string;
  settlement_prepared?: boolean;
  pool_home?: string;
  pool_draw?: string;
  pool_away?: string;
  has_bets: boolean;
  participants: string[];
};

type PhaseInfo = {
  name: string;
  start_time: string;
  end_time: string;
  points_weight: number;
};

type IoBolaoState = {
  matches: MatchInfo[];
  phases: PhaseInfo[];
};

export type BreakdownData = {
  show: boolean;
  matchPool: bigint;
  finalPrize: bigint;
  protocolFee: bigint;
};

export interface MatchCardProps {
  id: string;
  flag1?: string;
  flag2?: string;
  currentScore?: { home: number; away: number };
  currentScoreText?: string;
  onBreakdownChange?: (data: BreakdownData) => void;
}

type BetCurrency = 'VARA' | 'wUSDC' | 'wUSDT';

const VARA_DECIMALS = 12n;
const VARA_PLANCK = 10n ** VARA_DECIMALS;

const PROTOCOL_FEE_BPS = 500n;
const FINAL_PRIZE_BPS = 1000n;
const BPS_DEN = 10_000n;
const MIN_BET_VARA = 3;

type PenaltyWinnerArg = { Home: null } | { Away: null };
type MaybePenaltyWinnerArg = PenaltyWinnerArg | null;
type ScoreText = { home: string; away: string };


function kickOffToMs(kickOff: string): number {
  const n = Number(kickOff);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n < 10_000_000_000 ? n * 1000 : n;
}

function formatKickoffMs(kickOffString: string) {
  const ms = kickOffToMs(kickOffString);
  if (!ms) return '—';
  return new Date(ms).toLocaleString(undefined, {
    year: '2-digit',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function isFinalizedResult(result: any): boolean {
  return !!(result?.Finalized || result?.finalized);
}

function getResultDetails(result: any): {
  home: number;
  away: number;
  tag: 'OPEN' | 'LIVE' | 'FINAL';
  penaltyWinner: any | null;
} {
  if (!result) return { home: 0, away: 0, tag: 'OPEN', penaltyWinner: null };

  if (result.Finalized?.score) {
    const s = result.Finalized.score;
    return {
      home: Number(s.home ?? 0) || 0,
      away: Number(s.away ?? 0) || 0,
      tag: 'FINAL',
      penaltyWinner: result.Finalized?.penalty_winner ?? null,
    };
  }

  if (result.Proposed?.score) {
    const s = result.Proposed.score;
    return {
      home: Number(s.home ?? 0) || 0,
      away: Number(s.away ?? 0) || 0,
      tag: 'LIVE',
      penaltyWinner: result.Proposed?.penalty_winner ?? null,
    };
  }

  if (result.finalized?.score) {
    const s = result.finalized.score;
    return {
      home: Number(s.home ?? 0) || 0,
      away: Number(s.away ?? 0) || 0,
      tag: 'FINAL',
      penaltyWinner: result.finalized?.penalty_winner ?? null,
    };
  }

  if (result.proposed?.score) {
    const s = result.proposed.score;
    return {
      home: Number(s.home ?? 0) || 0,
      away: Number(s.away ?? 0) || 0,
      tag: 'LIVE',
      penaltyWinner: result.proposed?.penalty_winner ?? null,
    };
  }

  if (result.Unresolved || result.unresolved) {
    return { home: 0, away: 0, tag: 'OPEN', penaltyWinner: null };
  }

  return { home: 0, away: 0, tag: 'OPEN', penaltyWinner: null };
}

function statusLabel(result: any) {
  const r = getResultDetails(result);
  if (r.tag === 'OPEN') return 'Open';
  if (r.tag === 'LIVE') return `Live (${r.home}-${r.away})`;
  return `Final (${r.home}-${r.away})`;
}

function totalPoolPlanck(m: MatchInfo): bigint {
  if (m.match_prize_pool != null) {
    try {
      return BigInt(String(m.match_prize_pool));
    } catch {
      // ignore
    }
  }

  try {
    const h = BigInt(String(m.pool_home ?? '0'));
    const d = BigInt(String(m.pool_draw ?? '0'));
    const a = BigInt(String(m.pool_away ?? '0'));
    return h + d + a;
  } catch {
    return 0n;
  }
}

function planckToVaraHuman(planck: bigint): number {
  return Number(planck) / 1_000_000_000_000;
}

function toPlanck(amount: number): bigint {
  const fixed = amount.toFixed(12);
  const [i, f = ''] = fixed.split('.');
  const frac = (f + '0'.repeat(12)).slice(0, 12);
  return BigInt(i || '0') * VARA_PLANCK + BigInt(frac || '0');
}

function clampScore(n: unknown) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(20, Math.trunc(v)));
}

function clampPenalties(n: unknown) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(10, Math.trunc(v)));
}

function normalizeCurrentScore(
  currentScore?: { home: number; away: number },
  currentScoreText?: string,
): { home: number; away: number; text: string } {
  if (currentScore && Number.isFinite(currentScore.home) && Number.isFinite(currentScore.away)) {
    const h = Number(currentScore.home) || 0;
    const a = Number(currentScore.away) || 0;
    return { home: h, away: a, text: `${h}-${a}` };
  }

  if (typeof currentScoreText === 'string' && currentScoreText.trim()) {
    const m = currentScoreText.trim().match(/^(\d+)\s*-\s*(\d+)$/);
    if (m) return { home: Number(m[1]), away: Number(m[2]), text: `${Number(m[1])}-${Number(m[2])}` };
    return { home: 0, away: 0, text: currentScoreText.trim() };
  }

  return { home: 0, away: 0, text: '0-0' };
}

function toBnSafe(v: any): bigint {
  try {
    if (typeof v === 'bigint') return v;
    return BigInt(String(v ?? '0'));
  } catch {
    return 0n;
  }
}

function computeShareBn(stake: bigint, matchPrizePool: bigint, totalWinnerStake: bigint): bigint {
  if (stake <= 0n || matchPrizePool <= 0n || totalWinnerStake <= 0n) return 0n;
  return (stake * matchPrizePool) / totalWinnerStake;
}

function formatVaraFromPlanck(planck: bigint) {
  const s = planck.toString().padStart(13, '0');
  const intPart = s.slice(0, -12);
  const frac = s.slice(-12).replace(/0+$/, '');
  return frac ? `${intPart}.${frac}` : intPart;
}

function normalizeAmountInput(v: string) {
  const s = String(v ?? '')
    .replace(',', '.')
    .replace(/[^\d.]/g, '');
  const parts = s.split('.');
  if (parts.length <= 1) return s;
  return `${parts[0]}.${parts.slice(1).join('')}`;
}

function deducePenaltyWinnerArg(pens: Score): MaybePenaltyWinnerArg {
  if (pens.home > pens.away) return { Home: null };
  if (pens.away > pens.home) return { Away: null };
  return null;
}

function outcome(score: Score): number {
  if (score.home > score.away) return 1;
  if (score.home < score.away) return -1;
  return 0;
}

function advanceOutcome(score: Score, penWinner: MaybePenaltyWinnerArg | string | null): number {
  const o = outcome(score);
  if (o !== 0) return o;

  if (!penWinner) return 0;

  if (penWinner === 'Home' || (typeof penWinner === 'object' && 'Home' in penWinner)) return 1;
  if (penWinner === 'Away' || (typeof penWinner === 'object' && 'Away' in penWinner)) return -1;

  return 0;
}

function isEligibleLikeContract(args: {
  knockout: boolean;
  betScore: Score | null;
  betPenaltyWinner: MaybePenaltyWinnerArg;
  finalScore: Score | null;
  finalPenaltyWinner: MaybePenaltyWinnerArg;
}): boolean {
  const { knockout, betScore, betPenaltyWinner, finalScore, finalPenaltyWinner } = args;
  if (!betScore || !finalScore) return false;

  const drawFinal = finalScore.home === finalScore.away;

  const exactScore = betScore.home === finalScore.home && betScore.away === finalScore.away;
  if (exactScore) {
    if (knockout && drawFinal) {
      return !!betPenaltyWinner && JSON.stringify(betPenaltyWinner) === JSON.stringify(finalPenaltyWinner);
    }
    return true;
  }

  if (!knockout) {
    return outcome(betScore) === outcome(finalScore);
  }

  const finalAdv = advanceOutcome(finalScore, finalPenaltyWinner);

  const betAdv =
    betScore.home === betScore.away
      ? advanceOutcome(betScore, betPenaltyWinner)
      : outcome(betScore);

  if (finalAdv === 0 || betAdv === 0) return false;
  return betAdv === finalAdv;
}

export const MatchCard: React.FC<MatchCardProps> = ({
  id,
  flag1,
  flag2,
  currentScore,
  currentScoreText,
  onBreakdownChange,
}) => {
  const navigate = useNavigate();
  const { account } = useAccount();
  const toast = useToast();
  const { api, isApiReady } = useApi();
  const { varaToUsd } = useVaraPrice();

  const [state, setState] = useState<IoBolaoState | null>(null);
  const [loading, setLoading] = useState(true);

  const [selectedScore, setSelectedScore] = useState<Score>({ home: 0, away: 0 });
  const [penalties, setPenalties] = useState<Score>({ home: 0, away: 0 });

  const [selectedScoreTextState, setSelectedScoreTextState] = useState<ScoreText>({
    home: '0',
    away: '0',
  });
  const [penaltiesTextState, setPenaltiesTextState] = useState<ScoreText>({
    home: '0',
    away: '0',
  });

  const [txLoadingBet, setTxLoadingBet] = useState(false);
  const [txLoadingClaim, setTxLoadingClaim] = useState(false);

  const [betAmount, setBetAmount] = useState<string>('10');
  const [betCurrency, setBetCurrency] = useState<BetCurrency>('VARA');
  const [betSucceeded, setBetSucceeded] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);

  const [userStakeBn, setUserStakeBn] = useState<bigint>(0n);
  const [userClaimed, setUserClaimed] = useState<boolean>(false);
  const [userBetScore, setUserBetScore] = useState<Score | null>(null);
  const [userBetPenaltyWinner, setUserBetPenaltyWinner] = useState<MaybePenaltyWinnerArg>(null);
  const [loadingUserBet, setLoadingUserBet] = useState<boolean>(false);

  const matchId = useMemo(() => String(id ?? '').trim(), [id]);

  const betAmountNumber = useMemo(() => {
    const n = Number(String(betAmount).replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  }, [betAmount]);

  const betDisabledByAmount = betAmountNumber < MIN_BET_VARA;

  const shownScore = useMemo(
    () => normalizeCurrentScore(currentScore, currentScoreText),
    [currentScore, currentScoreText],
  );

  useEffect(() => {
    void web3Enable('Vara Bolao MatchCard');
  }, []);

  const fetchState = useCallback(async () => {
    if (!api || !isApiReady) {
      setLoading(true);
      return;
    }

    setLoading(true);

    try {
      const svc = new Service(new Program(api, PROGRAM_ID as HexString));
      const s = (await (svc as any).queryState()) as any;

      const normalized: IoBolaoState = {
        matches: Array.isArray(s?.matches)
          ? s.matches.map((m: any) => ({
              match_id: String(m?.match_id ?? ''),
              phase: String(m?.phase ?? ''),
              home: String(m?.home ?? ''),
              away: String(m?.away ?? ''),
              kick_off: String(m?.kick_off ?? '0'),
              match_prize_pool: m?.match_prize_pool != null ? String(m.match_prize_pool) : undefined,
              total_winner_stake:
                m?.total_winner_stake != null ? String(m.total_winner_stake) : undefined,
              settlement_prepared:
                m?.settlement_prepared != null ? Boolean(m.settlement_prepared) : undefined,
              pool_home: m?.pool_home != null ? String(m.pool_home) : '0',
              pool_draw: m?.pool_draw != null ? String(m.pool_draw) : '0',
              pool_away: m?.pool_away != null ? String(m.pool_away) : '0',
              has_bets: Boolean(m?.has_bets),
              participants: Array.isArray(m?.participants) ? m.participants : [],
              result: m?.result ?? null,
            }))
          : [],
        phases: Array.isArray(s?.phases)
          ? s.phases.map((p: any) => ({
              name: String(p?.name ?? ''),
              start_time: String(p?.start_time ?? '0'),
              end_time: String(p?.end_time ?? '0'),
              points_weight: Number(p?.points_weight ?? 1) || 1,
            }))
          : [],
      };

      setState(normalized);
    } catch (e) {
      console.error('fetchState error', e);
      setState(null);
    } finally {
      setLoading(false);
    }
  }, [api, isApiReady]);

  useEffect(() => {
    void fetchState();
  }, [fetchState]);

  const match = useMemo(() => {
    if (!state?.matches || !matchId) return null;
    const idNorm = String(matchId).trim();
    return state.matches.find((m) => String(m.match_id).trim() === idNorm) || null;
  }, [state, matchId]);

  const phaseWeightMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of state?.phases ?? []) {
      const key = String(p.name ?? '').trim();
      if (key) map.set(key, Number(p.points_weight ?? 1) || 1);
    }
    return map;
  }, [state?.phases]);

  const pointsWeight = useMemo(() => {
    const phase = String(match?.phase ?? '').trim();
    return phase ? phaseWeightMap.get(phase) ?? 1 : 1;
  }, [match?.phase, phaseWeightMap]);

  const isKnockout = useMemo(() => (Number(pointsWeight) || 1) > 1, [pointsWeight]);

  const isBeforeKickoff = useMemo(() => {
    if (!match) return false;
    return kickOffToMs(match.kick_off) > Date.now();
  }, [match]);

  const chainResult = useMemo(() => getResultDetails(match?.result), [match?.result]);

  const isFinalized = useMemo(() => {
    if (!match?.result) return false;
    return isFinalizedResult(match.result);
  }, [match?.result]);

  const fetchUserBetForMatch = useCallback(async () => {
    if (!api || !isApiReady || !account || !matchId) return;

    setLoadingUserBet(true);

    try {
      const svc = new Service(new Program(api, PROGRAM_ID as HexString));
      const bets = (await (svc as any).queryBetsByUser(account.decodedAddress)) as any[];

      const b = Array.isArray(bets)
        ? bets.find((x) => String(x?.match_id) === String(matchId))
        : null;

      if (!b) {
        setUserStakeBn(0n);
        setUserClaimed(false);
        setUserBetScore(null);
        setUserBetPenaltyWinner(null);
        return;
      }

      const stake = toBnSafe(b?.stake_in_match_pool ?? 0);
      const claimed = typeof b?.claimed === 'boolean' ? b.claimed : false;

      const bs = b?.score
        ? { home: Number(b.score.home ?? 0) || 0, away: Number(b.score.away ?? 0) || 0 }
        : null;

      const bpw: MaybePenaltyWinnerArg = b?.penalty_winner ?? null;

      setUserStakeBn(stake);
      setUserClaimed(claimed);
      setUserBetScore(bs);
      setUserBetPenaltyWinner(bpw);
    } catch (e) {
      console.error('fetchUserBetForMatch error', e);
      setUserStakeBn(0n);
      setUserClaimed(false);
      setUserBetScore(null);
      setUserBetPenaltyWinner(null);
    } finally {
      setLoadingUserBet(false);
    }
  }, [api, isApiReady, account, matchId]);

  useEffect(() => {
    void fetchUserBetForMatch();
  }, [fetchUserBetForMatch]);

  const isDraw = selectedScore.home === selectedScore.away;

  useEffect(() => {
    if (!isDraw) {
      setPenalties({ home: 0, away: 0 });
      setPenaltiesTextState({ home: '0', away: '0' });
    }
  }, [isDraw]);

  const onFocusZeroToBlank = (getter: () => string, setter: (v: string) => void) => {
    const v = getter();
    if (v === '0') setter('');
  };

  const onBlurBlankToZero = (getter: () => string, setter: (v: string) => void) => {
    const v = getter().trim();
    if (v === '') setter('0');
  };

  const predictedPenaltyWinnerArg = useMemo<MaybePenaltyWinnerArg>(() => {
    if (!isDraw) return null;
    if (!isKnockout) return null;
    return deducePenaltyWinnerArg(penalties);
  }, [isDraw, isKnockout, penalties]);

  const hasExistingBet = useMemo(
    () => !loadingUserBet && userStakeBn > 0n,
    [loadingUserBet, userStakeBn],
  );

  const canBet = useMemo(() => {
    if (!match) return false;
    if (isFinalized) return false;
    if (!isBeforeKickoff) return false;
    if (betDisabledByAmount) return false;
    if (hasExistingBet) return false;
    if (isDraw && isKnockout && predictedPenaltyWinnerArg === null) return false;
    return true;
  }, [
    match,
    isFinalized,
    isBeforeKickoff,
    betDisabledByAmount,
    hasExistingBet,
    isDraw,
    isKnockout,
    predictedPenaltyWinnerArg,
  ]);

  const settlementPrepared = !!match?.settlement_prepared;
  const matchPrizePoolBn = useMemo(() => toBnSafe(match?.match_prize_pool ?? 0), [match?.match_prize_pool]);
  const totalWinnerStakeBn = useMemo(
    () => toBnSafe(match?.total_winner_stake ?? 0),
    [match?.total_winner_stake],
  );

  const userEligibleToClaim = useMemo(() => {
    if (!match) return false;
    if (!isFinalized) return false;

    const finalScore: Score | null =
      chainResult.tag === 'FINAL'
        ? { home: chainResult.home, away: chainResult.away }
        : null;

    const finalPenaltyWinner: MaybePenaltyWinnerArg =
      chainResult?.penaltyWinner != null
        ? (chainResult.penaltyWinner as MaybePenaltyWinnerArg)
        : null;

    return isEligibleLikeContract({
      knockout: isKnockout,
      betScore: userBetScore,
      betPenaltyWinner: userBetPenaltyWinner,
      finalScore,
      finalPenaltyWinner,
    });
  }, [match, isFinalized, chainResult, isKnockout, userBetScore, userBetPenaltyWinner]);

  const claimableBn = useMemo(() => {
    if (!match) return 0n;
    if (!isFinalized) return 0n;
    if (!settlementPrepared) return 0n;
    if (userClaimed) return 0n;
    if (!userEligibleToClaim) return 0n;
    return computeShareBn(userStakeBn, matchPrizePoolBn, totalWinnerStakeBn);
  }, [
    match,
    isFinalized,
    settlementPrepared,
    userClaimed,
    userEligibleToClaim,
    userStakeBn,
    matchPrizePoolBn,
    totalWinnerStakeBn,
  ]);

  const showClaimButton = useMemo(() => {
    if (!account) return false;
    if (!match) return false;
    if (!isFinalized) return false;
    if (!settlementPrepared) return false;
    if (loadingUserBet) return false;
    return claimableBn > 0n;
  }, [account, match, isFinalized, settlementPrepared, loadingUserBet, claimableBn]);

  const betValueBn = useMemo(
    () => (betCurrency === 'VARA' ? toPlanck(betAmountNumber) : 0n),
    [betCurrency, betAmountNumber],
  );

  const feeProtocolBn = useMemo(
    () => (betValueBn * PROTOCOL_FEE_BPS) / BPS_DEN,
    [betValueBn],
  );

  const feeFinalBn = useMemo(
    () => (betValueBn * FINAL_PRIZE_BPS) / BPS_DEN,
    [betValueBn],
  );

  const stakeInMatchPoolBn = useMemo(() => {
    if (betValueBn <= 0n) return 0n;
    const cut = betValueBn - feeProtocolBn - feeFinalBn;
    return cut > 0n ? cut : 0n;
  }, [betValueBn, feeProtocolBn, feeFinalBn]);

  const poolAfterBn = useMemo(
    () => matchPrizePoolBn + stakeInMatchPoolBn,
    [matchPrizePoolBn, stakeInMatchPoolBn],
  );

  const maxPayoutBn = poolAfterBn;
  const maxProfitBn = maxPayoutBn > betValueBn ? maxPayoutBn - betValueBn : 0n;
  const showToWin = useMemo(
    () => betCurrency === 'VARA' && betValueBn > 0n,
    [betCurrency, betValueBn],
  );

  useEffect(() => {
    onBreakdownChange?.({
      show: showToWin,
      matchPool: stakeInMatchPoolBn,
      finalPrize: feeFinalBn,
      protocolFee: feeProtocolBn,
    });
  }, [onBreakdownChange, showToWin, stakeInMatchPoolBn, feeFinalBn, feeProtocolBn]);

  const handlePlaceBet = useCallback(async () => {
    if (!match) return;

    if (isFinalized) {
      toast.error(`This match has ended. Final score: ${chainResult.home}-${chainResult.away}`);
      return;
    }

    if (!account) {
      toast.error('Please connect your wallet');
      return;
    }

    if (!api || !isApiReady) {
      toast.error('Node API is not ready');
      return;
    }

    if (!isBeforeKickoff) {
      toast.error('Betting is closed (kick-off time has passed)');
      return;
    }

    if (betAmountNumber < MIN_BET_VARA) {
      toast.error(`Minimum prediction amount is ${MIN_BET_VARA} VARA`);
      return;
    }

    if (hasExistingBet) {
      toast.error('You already have a prediction on this match. Only one prediction per match is allowed.');
      return;
    }

    const h = clampScore(selectedScore.home);
    const a = clampScore(selectedScore.away);

    const drawPredicted = h === a;
    let penaltyWinnerToSend: MaybePenaltyWinnerArg = null;

    if (drawPredicted && isKnockout) {
      const pensH = clampPenalties(penalties.home);
      const pensA = clampPenalties(penalties.away);

      const arg = deducePenaltyWinnerArg({ home: pensH, away: pensA });
      if (!arg) {
        toast.error('In penalties there must be a winner (no tie).');
        return;
      }

      penaltyWinnerToSend = arg;
    }

    try {
      setTxLoadingBet(true);

      const svc = new Service(new Program(api, PROGRAM_ID as HexString));
      const tx: TransactionBuilder<unknown> = (svc as any).placeBet(
        BigInt(match.match_id),
        { home: h, away: a },
        penaltyWinnerToSend,
      );

      const { signer } = await web3FromSource(account.meta.source);

      if (betCurrency === 'VARA') {
        tx.withAccount(account.decodedAddress, { signer }).withValue(toPlanck(betAmountNumber));
      } else {
        tx.withAccount(account.decodedAddress, { signer }).withValue(0n);
        toast.info(`Selected ${betCurrency}. You may need an ERC20-like approve/transfer flow.`);
      }

      await tx.calculateGas();
      const { blockHash, response } = await tx.signAndSend();

      toast.info(`Prediction included in block ${blockHash}`);
      await response();
      toast.success('Prediction placed successfully ✅');
      setBetSucceeded(true);

      // Report bet to stats backend (fire-and-forget, non-fatal)
      const outcome = h > a ? 'home' : h < a ? 'away' : 'draw';
      reportBet(account.decodedAddress, String(match.match_id), toPlanck(betAmountNumber).toString(), outcome);

      setTimeout(() => {
        void fetchState();
        void fetchUserBetForMatch();
      }, 900);
    } catch (e) {
      console.error(e);
      toast.error('Prediction failed');
    } finally {
      setTxLoadingBet(false);
    }
  }, [
    match,
    isFinalized,
    chainResult.home,
    chainResult.away,
    account,
    api,
    isApiReady,
    isBeforeKickoff,
    betAmountNumber,
    betCurrency,
    selectedScore.home,
    selectedScore.away,
    penalties.home,
    penalties.away,
    toast,
    fetchState,
    fetchUserBetForMatch,
    isKnockout,
    hasExistingBet,
  ]);

  const handleClaim = useCallback(async () => {
    if (!match) return;

    if (!account) {
      toast.error('Please connect your wallet');
      return;
    }

    if (!api || !isApiReady) {
      toast.error('Node API is not ready');
      return;
    }

    if (!isFinalizedResult(match.result)) {
      toast.error('Match is not finalized yet');
      return;
    }

    if (!match.settlement_prepared) {
      toast.error('Settlement not prepared yet');
      return;
    }

    if (claimableBn <= 0n) {
      toast.error('No claimable balance for this match');
      return;
    }

    try {
      setTxLoadingClaim(true);

      const svc = new Service(new Program(api, PROGRAM_ID as HexString));
      const tx: TransactionBuilder<unknown> = (svc as any).claimMatchReward(BigInt(match.match_id));

      const { signer } = await web3FromSource(account.meta.source);
      tx.withAccount(account.decodedAddress, { signer }).withValue(0n);

      await tx.calculateGas();
      const { blockHash, response } = await tx.signAndSend();

      toast.info(`Claim included in block ${blockHash}`);
      await response();
      toast.success('Reward claimed ✅');

      setTimeout(() => {
        void fetchState();
        void fetchUserBetForMatch();
      }, 900);
    } catch (e) {
      console.error(e);
      toast.error('Claim failed');
    } finally {
      setTxLoadingClaim(false);
    }
  }, [match, account, api, isApiReady, toast, fetchState, fetchUserBetForMatch, claimableBn]);

  const sincePredictedTop = useMemo(() => {
    if (!match) return 'Your prediction: —';
    return `Your prediction: ${match.home.toUpperCase()} ${selectedScore.home} - ${selectedScore.away} ${match.away.toUpperCase()}`;
  }, [match, selectedScore.home, selectedScore.away]);

  const resultLine = useMemo(() => {
    if (!match) return '—';
    if (!isDraw) {
      return `${match.home.toUpperCase()} ${selectedScore.home} - ${selectedScore.away} ${match.away.toUpperCase()}`;
    }

    if (isKnockout) {
      const arg = predictedPenaltyWinnerArg;
      const winner = arg && 'Home' in arg ? match.home : arg && 'Away' in arg ? match.away : '—';

      if (winner !== '—') {
        return `${match.home.toUpperCase()} ${selectedScore.home} - ${selectedScore.away} ${match.away.toUpperCase()} (${winner} wins on penalties)`;
      }

      return `${match.home.toUpperCase()} ${selectedScore.home} - ${selectedScore.away} ${match.away.toUpperCase()} (select penalties winner)`;
    }

    return `${match.home.toUpperCase()} ${selectedScore.home} - ${selectedScore.away} ${match.away.toUpperCase()}`;
  }, [match, isDraw, selectedScore.home, selectedScore.away, isKnockout, predictedPenaltyWinnerArg]);

  const finalizedMessage = useMemo(() => {
    if (!match || !isFinalized) return '';

    const base = `This match has ended. Final score: ${chainResult.home}-${chainResult.away}.`;

    if (chainResult.penaltyWinner) {
      const pw = chainResult.penaltyWinner as any;
      const winner =
        pw && typeof pw === 'object' && 'Home' in pw
          ? match.home
          : pw && typeof pw === 'object' && 'Away' in pw
            ? match.away
            : String(pw);

      return `${base} Penalty winner: ${winner}.`;
    }

    return base;
  }, [match, isFinalized, chainResult.home, chainResult.away, chainResult.penaltyWinner]);


  const prizeEstimate = useMemo(() => {
    if (!match) return null;
    if (!showToWin || stakeInMatchPoolBn <= 0n) return null;

    const predictedOutcome =
      selectedScore.home > selectedScore.away
        ? 'home'
        : selectedScore.home < selectedScore.away
          ? 'away'
          : 'draw';

    const outcomePoolRaw =
      predictedOutcome === 'home'
        ? match.pool_home
        : predictedOutcome === 'draw'
          ? match.pool_draw
          : match.pool_away;

    let outcomePoolBn = toBnSafe(outcomePoolRaw ?? '0');

    if (outcomePoolBn <= 0n) {
      outcomePoolBn = matchPrizePoolBn / 3n;
    }

    const outcomePoolAfter = outcomePoolBn + stakeInMatchPoolBn;
    if (outcomePoolAfter <= 0n) return null;

    return (stakeInMatchPoolBn * poolAfterBn) / outcomePoolAfter;
  }, [
    match,
    showToWin,
    stakeInMatchPoolBn,
    selectedScore.home,
    selectedScore.away,
    matchPrizePoolBn,
    poolAfterBn,
  ]);

  if (loading) {
    return (
      <section className="mcx">
        <div className="mcx__header">
          <div className="mcx__phase">Loading…</div>
        </div>
        <div className="mcx__body dim">Fetching contract state…</div>
      </section>
    );
  }

  if (!matchId || !match) {
    return (
      <section className="mcx">
        <div className="mcx__header">
          <div className="mcx__phase">Match not found</div>
        </div>
        <div className="mcx__body dim">
          The selected match does not exist. (id: <b>{matchId || '—'}</b>)
          <div style={{ marginTop: 12 }}>
            <button className="mcx__ghostBtn" onClick={() => navigate(-1)}>
              Back
            </button>
          </div>
        </div>
      </section>
    );
  }

  const poolVara = planckToVaraHuman(totalPoolPlanck(match));
  const topScoreHome = isFinalized ? chainResult.home : shownScore.home;
  const topScoreAway = isFinalized ? chainResult.away : shownScore.away;

  return (
    <section className="mcx">
      <div className="mcx__header">
        <div className="mcx__phase">
          {match.phase || 'Group Stage'}
          
            (weight: {pointsWeight})
         
        </div>
      </div>

      <div className="mcx__scoreTop">
        <div className="mcx__side">
          <TeamFlag className="mcx__flagLg" team={match.home} />
          <div className="mcx__teamLbl">{match.home.toUpperCase()}</div>
        </div>

        <div className="mcx__midScore">
          <div className="mcx__bigN">{topScoreHome}</div>
          <div className="mcx__vs">VS</div>
          <div className="mcx__bigN">{topScoreAway}</div>
        </div>

        <div className="mcx__side">
          <TeamFlag className="mcx__flagLg" team={match.away} />
          <div className="mcx__teamLbl">{match.away.toUpperCase()}</div>
        </div>
      </div>

      <div className="mcx__since dim">{sincePredictedTop}</div>

      <div className="mcx__miniBadge">
        <div className="mcx__miniTeam">
          <TeamFlag className="mcx__flagSm" team={match.home} alt="" />
          <div className="mcx__miniN">{selectedScore.home}</div>
        </div>
        <div className="mcx__miniVS">vs</div>
        <div className="mcx__miniTeam">
          <div className="mcx__miniN">{selectedScore.away}</div>
          <TeamFlag className="mcx__flagSm" team={match.away} alt="" />
        </div>
      </div>

      <div className="mcx__resultLine">{resultLine}</div>

      {isFinalized && <div className="mcx__closed dim">{finalizedMessage}</div>}

      {showClaimButton ? (
        <>
          <button
            className="mcx__claimBtn is-ready"
            onClick={handleClaim}
            disabled={txLoadingClaim}
          >
            {txLoadingClaim ? 'Claiming…' : `Claim ${formatVaraFromPlanck(claimableBn)} VARA`}
          </button>

          <div className="mcx__claimSub dim">
            You have <b>{formatVaraFromPlanck(claimableBn)} VARA</b> available for this match.
          </div>
        </>
      ) : null}

      <div className="mcx__bottom">
        <button className="mcx__viewAll" onClick={() => navigate('/all-matches')}>
          View All Matches <span className="mcx__arrow">→</span>
        </button>
      </div>

      <div className="mcx__predSection">
        <div className="mcx__predTitle">Place Prediction</div>

        {hasExistingBet && !isFinalized && (
          <div className="mcx__warn mcx__warn--info" role="alert">
            ℹ️ You already have a prediction on this match. Only one prediction per match is
            allowed.
          </div>
        )}

        {isFinalized ? (
          <div className="mcx__body dim" style={{ padding: 12 }}>
            <b>{finalizedMessage}</b>
            <div style={{ marginTop: 8, opacity: 0.85 }}>
              You can’t place predictions on a finalized match. Please go back to the matches
              list.
            </div>
          </div>
        ) : (
          <>
            <div className="mcx__formGrid">
              <div className="mcx__formCol">
                <div className="mcx__label dim">{match.home}</div>
                <input
                  className="mcx__inp mcx__inp--wine"
                  type="text"
                  inputMode="numeric"
                  disabled={txLoadingBet || !isBeforeKickoff}
                  value={selectedScoreTextState.home}
                  onFocus={() =>
                    onFocusZeroToBlank(
                      () => selectedScoreTextState.home,
                      (v) => setSelectedScoreTextState((s) => ({ ...s, home: v })),
                    )
                  }
                  onBlur={() => {
                    onBlurBlankToZero(
                      () => selectedScoreTextState.home,
                      (v) => setSelectedScoreTextState((s) => ({ ...s, home: v })),
                    );
                    const v = selectedScoreTextState.home.trim();
                    setSelectedScore((s) => ({ ...s, home: v === '' ? 0 : clampScore(v) }));
                  }}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/[^\d]/g, '');
                    setSelectedScoreTextState((s) => ({ ...s, home: raw }));
                    setSelectedScore((s) => ({ ...s, home: raw === '' ? 0 : clampScore(raw) }));
                  }}
                />
              </div>

              <div className="mcx__formCol">
                <div className="mcx__label dim">{match.away}</div>
                <input
                  className="mcx__inp mcx__inp--wine"
                  type="text"
                  inputMode="numeric"
                  disabled={txLoadingBet || !isBeforeKickoff}
                  value={selectedScoreTextState.away}
                  onFocus={() =>
                    onFocusZeroToBlank(
                      () => selectedScoreTextState.away,
                      (v) => setSelectedScoreTextState((s) => ({ ...s, away: v })),
                    )
                  }
                  onBlur={() => {
                    onBlurBlankToZero(
                      () => selectedScoreTextState.away,
                      (v) => setSelectedScoreTextState((s) => ({ ...s, away: v })),
                    );
                    const v = selectedScoreTextState.away.trim();
                    setSelectedScore((s) => ({ ...s, away: v === '' ? 0 : clampScore(v) }));
                  }}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/[^\d]/g, '');
                    setSelectedScoreTextState((s) => ({ ...s, away: raw }));
                    setSelectedScore((s) => ({ ...s, away: raw === '' ? 0 : clampScore(raw) }));
                  }}
                />
              </div>
            </div>

            {isDraw && isKnockout && (
              <div className="mcx__penBox mcx__penBox--wine">
                <div className="mcx__penTitle">Penalties (required)</div>

                <div className="mcx__formGrid">
                  <div className="mcx__formCol">
                    <div className="mcx__label dim">{match.home}</div>
                    <input
                      className="mcx__inp mcx__inp--wine"
                      type="text"
                      inputMode="numeric"
                      disabled={txLoadingBet || !isBeforeKickoff}
                      value={penaltiesTextState.home}
                      onFocus={() =>
                        onFocusZeroToBlank(
                          () => penaltiesTextState.home,
                          (v) => setPenaltiesTextState((p) => ({ ...p, home: v })),
                        )
                      }
                      onBlur={() => {
                        onBlurBlankToZero(
                          () => penaltiesTextState.home,
                          (v) => setPenaltiesTextState((p) => ({ ...p, home: v })),
                        );
                        const v = penaltiesTextState.home.trim();
                        setPenalties((p) => ({ ...p, home: v === '' ? 0 : clampPenalties(v) }));
                      }}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/[^\d]/g, '');
                        setPenaltiesTextState((p) => ({ ...p, home: raw }));
                        setPenalties((p) => ({ ...p, home: raw === '' ? 0 : clampPenalties(raw) }));
                      }}
                    />
                  </div>

                  <div className="mcx__formCol">
                    <div className="mcx__label dim">{match.away}</div>
                    <input
                      className="mcx__inp mcx__inp--wine"
                      type="text"
                      inputMode="numeric"
                      disabled={txLoadingBet || !isBeforeKickoff}
                      value={penaltiesTextState.away}
                      onFocus={() =>
                        onFocusZeroToBlank(
                          () => penaltiesTextState.away,
                          (v) => setPenaltiesTextState((p) => ({ ...p, away: v })),
                        )
                      }
                      onBlur={() => {
                        onBlurBlankToZero(
                          () => penaltiesTextState.away,
                          (v) => setPenaltiesTextState((p) => ({ ...p, away: v })),
                        );
                        const v = penaltiesTextState.away.trim();
                        setPenalties((p) => ({ ...p, away: v === '' ? 0 : clampPenalties(v) }));
                      }}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/[^\d]/g, '');
                        setPenaltiesTextState((p) => ({ ...p, away: raw }));
                        setPenalties((p) => ({ ...p, away: raw === '' ? 0 : clampPenalties(raw) }));
                      }}
                    />
                  </div>
                </div>

                {predictedPenaltyWinnerArg === null ? (
                  <div className="mcx__warn">
                    Penalties can’t end in a tie (knockout draw requires a winner).
                  </div>
                ) : (
                  <div className="dim" style={{ marginTop: 8 }}>
                    Winner will be sent on-chain as:{' '}
                    <b>{'Home' in predictedPenaltyWinnerArg ? 'Home' : 'Away'}</b>
                  </div>
                )}
              </div>
            )}

            <div className="mcx__formGrid" style={{ marginTop: 12 }}>
              <div className="mcx__formCol">
                <div className="mcx__label dim">Prediction Stake</div>
                <div className="mcx__amountWrap">
                  <span className="mcx__amountPill">VARA</span>
                  <input
                    className="mcx__inp mcx__inp--wine mcx__inp--amount"
                    inputMode="decimal"
                    value={betAmount}
                    onChange={(e) => setBetAmount(normalizeAmountInput(e.target.value))}
                    placeholder="0.00"
                  />
                </div>

                {betAmountNumber > 0 && varaToUsd(betAmountNumber) && (
                  <div className="mcx__stakeUsd">{varaToUsd(betAmountNumber)}</div>
                )}

                <div className="mcx__quickRow">
                  <button
                    className="mcx__qBtn"
                    type="button"
                    onClick={() => setBetAmount(String((betAmountNumber || 0) + 1))}
                  >
                    +1
                  </button>
                  <button
                    className="mcx__qBtn"
                    type="button"
                    onClick={() => setBetAmount(String((betAmountNumber || 0) + 10))}
                  >
                    +10
                  </button>
                  <button
                    className="mcx__qBtn"
                    type="button"
                    onClick={() => setBetAmount(String((betAmountNumber || 0) + 50))}
                  >
                    +50
                  </button>
                </div>
              </div>

              <div className="mcx__formCol">
                <div className="mcx__label dim">Currency</div>
                <select
                  className="mcx__sel mcx__sel--wine"
                  value={betCurrency}
                  onChange={(e) => setBetCurrency(e.target.value as BetCurrency)}
                >
                  <option value="VARA">VARA</option>
                </select>
              </div>
            </div>

            <div className="mcx__meta dim">
              Prize Pool: <b>{poolVara} VARA</b> · Has predictions:{' '}
              <b>{match.has_bets ? 'Yes' : 'No'}</b>
              <br />
              KICK-OFF: <b>{formatKickoffMs(match.kick_off)}</b> · Status:{' '}
              <b>{statusLabel(match.result)}</b>
            </div>

            {betSucceeded ? (
              <div className="mcx__betSucceeded">
                <div className="mcx__betSucceeded__msg">Prediction placed successfully ✅</div>
                <button
                  className="mcx__betBtn mcx__betBtn--wine"
                  onClick={() => navigate('/all-matches')}
                  type="button"
                >
                  ← Go Back to All Matches
                </button>
              </div>
            ) : (
              <>
                <button
                  className="mcx__betBtn mcx__betBtn--wine"
                  onClick={handlePlaceBet}
                  disabled={txLoadingBet || !canBet}
                >
                  {txLoadingBet
                    ? 'Sending Prediction…'
                    : `Send Prediction (${betAmountNumber || 0} ${betCurrency})`}
                </button>

                {prizeEstimate !== null && (
                  <div className="mcx__prizeEst">
                    <div className="mcx__prizeEst__title">
                      Win{' '}
                      <span className="mcx__prizeEst__value">
                        {formatVaraFromPlanck(prizeEstimate)} VARA
                      </span>{' '}
                      based on current pool distribution
                      <button
                        className="mcx__infoBtn"
                        type="button"
                        onClick={() => setShowInfoModal(true)}
                        aria-label="How rewards are calculated"
                        title="How rewards are calculated"
                      >
                        ⓘ
                      </button>
                    </div>
                    <div className="mcx__prizeEst__note dim">Estimate — updates as more players join</div>
                  </div>
                )}

                {betAmountNumber > 0 && betAmountNumber < MIN_BET_VARA && (
                  <div className="mcx__warn" role="alert">
                    Minimum prediction amount is {MIN_BET_VARA} VARA
                  </div>
                )}

              </>
            )}

            {showInfoModal && (
              <div className="mcx__infoOverlay" role="dialog" aria-modal="true">
                <div className="mcx__infoPanel">
                  <button className="mcx__infoClose" onClick={() => setShowInfoModal(false)} type="button">✕</button>
                  <h3 className="mcx__infoTitle">How Rewards Work</h3>

                  <p className="mcx__infoIntro">
                    SmartCup uses a <b>pari-mutuel pool system</b> — players compete against each other, not fixed odds.
                  </p>

                  <div className="mcx__infoSection">
                    <p className="mcx__infoSectionTitle">When you place a prediction stake:</p>
                    <ul className="mcx__infoList">
                      <li><span className="mcx__infoBadge mcx__infoBadge--match">85%</span> goes to the Match Winner Pool</li>
                      <li><span className="mcx__infoBadge mcx__infoBadge--final">10%</span> goes to the Final Prize Pool</li>
                      <li><span className="mcx__infoBadge mcx__infoBadge--fee">5%</span> goes to the Protocol / DAO fee</li>
                    </ul>
                  </div>

                  <div className="mcx__infoSection">
                    <p className="mcx__infoSectionTitle">After the match ends:</p>
                    <ul className="mcx__infoList">
                      <li>The 85% match pool is split among all correct predictions</li>
                      <li>Your reward depends on how many players predicted the same outcome</li>
                      <li>Rare correct predictions pay more; popular outcomes pay less</li>
                    </ul>
                  </div>

                  <div className="mcx__infoSection mcx__infoSection--warn">
                    <p className="mcx__infoSectionTitle">Important:</p>
                    <ul className="mcx__infoList">
                      <li>Rewards are <b>not fixed</b> — they update as more players join</li>
                      <li>In crowded outcomes, rewards can be lower than your prediction stake</li>
                      <li>If no one predicts correctly, the pool rolls into the Final Prize Pool</li>
                    </ul>
                  </div>

                  <a href="/rules" target="_blank" rel="noopener noreferrer" className="mcx__infoLink">View full rules →</a>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {!isFinalized && !isBeforeKickoff && (
        <div className="mcx__closed dim">Prediction is closed (kick-off time has passed).</div>
      )}
    </section>
  );
};