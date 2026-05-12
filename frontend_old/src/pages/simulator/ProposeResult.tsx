import React, { useState, useEffect, useCallback, useMemo } from 'react';
import styled, { keyframes } from 'styled-components';
import { useAccount, useApi } from '@gear-js/react-hooks';
import { useToast } from '@/hooks/useToast';
import { web3Enable, web3FromSource } from '@polkadot/extension-dapp';
import { TransactionBuilder } from 'sails-js';
import { Program, Service } from '@/hocs/lib';

const VARA_ICON = 'https://img.cryptorank.io/coins/vara_network1695313579900.png';
const VARA_TOKEN_ICON = 'https://s2.coinmarketcap.com/static/img/coins/200x200/28067.png';
const PROGRAM_ID = import.meta.env.VITE_BOLAOCOREPROGRAM;

const spin = keyframes`
  to { transform: rotate(360deg); }
`;

const Shell = styled.div`
  width: 100%;
  display: grid;
  gap: 12px;
`;

const Card = styled.section`
  border-radius: 18px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: radial-gradient(900px 260px at 18% 0%, rgba(255, 0, 110, 0.12), transparent 60%), rgba(0, 0, 0, 0.12);
  backdrop-filter: var(--blur);
  box-shadow: 0 18px 44px rgba(0, 0, 0, 0.35);
  overflow: hidden;
`;

const CardHead = styled.header`
  padding: 14px 14px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;

  @media (max-width: 860px) {
    flex-direction: column;
    align-items: stretch;
  }
`;

const HeadLeft = styled.div`
  min-width: 0;
`;

const TitleRow = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;

  .badge {
    width: 30px;
    height: 30px;
    border-radius: 12px;
    display: grid;
    place-items: center;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(0, 0, 0, 0.14);
    flex: 0 0 auto;
  }

  .title {
    margin: 0;
    font-size: 16px;
    font-weight: 950;
    color: rgba(255, 255, 255, 0.93);
    letter-spacing: 0.2px;
    line-height: 1.2;
  }
`;

const Icons = styled.div`
  display: inline-flex;
  gap: 8px;
  align-items: center;

  img {
    width: 22px;
    height: 22px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    object-fit: cover;
    background: rgba(0, 0, 0, 0.12);
  }

  .token {
    border-radius: 999px;
  }
`;

const Subtitle = styled.div`
  margin-top: 6px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
  line-height: 1.35;
`;

const HeadRight = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;

  @media (max-width: 860px) {
    justify-content: flex-start;
  }
`;

const Pill = styled.span<{ $variant?: 'warn' | 'ok' | 'muted' | 'final' }>`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 900;

  border: 1px solid
    ${({ $variant }) =>
      $variant === 'ok'
        ? 'rgba(65, 214, 114, 0.35)'
        : $variant === 'warn'
          ? 'rgba(255, 194, 75, 0.25)'
          : $variant === 'final'
            ? 'rgba(255, 0, 110, 0.35)'
            : 'rgba(255,255,255,0.12)'};

  background: ${({ $variant }) =>
    $variant === 'ok'
      ? 'rgba(65, 214, 114, 0.10)'
      : $variant === 'warn'
        ? 'rgba(255, 194, 75, 0.08)'
        : $variant === 'final'
          ? 'rgba(255, 0, 110, 0.14)'
          : 'rgba(0,0,0,0.10)'};

  color: ${({ $variant }) =>
    $variant === 'ok'
      ? 'rgba(210, 255, 225, 0.92)'
      : $variant === 'warn'
        ? 'rgba(255, 235, 200, 0.92)'
        : $variant === 'final'
          ? 'rgba(255, 220, 240, 0.95)'
          : 'rgba(255,255,255,0.82)'};
`;

const Body = styled.div`
  padding: 14px;
  display: grid;
  gap: 12px;
`;

const Section = styled.section`
  border-radius: 18px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.12);
  overflow: hidden;
`;

const SectionHead = styled.div`
  padding: 12px 12px 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;

  .t {
    font-weight: 950;
    color: rgba(255, 255, 255, 0.92);
  }
  .s {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.68);
  }

  @media (max-width: 860px) {
    flex-direction: column;
    align-items: flex-start;
  }
`;

const SectionBody = styled.div`
  padding: 12px;
  display: grid;
  gap: 12px;
`;

const Row = styled.div`
  display: grid;
  grid-template-columns: 160px 1fr;
  gap: 10px;
  align-items: center;

  @media (max-width: 860px) {
    grid-template-columns: 1fr;
  }
`;

const Label = styled.div`
  font-size: 12px;
  font-weight: 900;
  color: rgba(255, 255, 255, 0.78);
`;

const FieldLine = styled.div`
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  align-items: center;
`;

const Input = styled.input`
  height: 44px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(0, 0, 0, 0.14);
  color: rgba(255, 255, 255, 0.92);
  outline: none;
  font-weight: 900;
  font-size: 14px;
  padding: 0 12px;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.06) inset;

  &::placeholder {
    color: rgba(255, 255, 255, 0.5);
    font-weight: 700;
  }

  &:focus {
    border-color: rgba(255, 0, 110, 0.35);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const Select = styled.select`
  height: 44px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(0, 0, 0, 0.14);
  color: rgba(255, 255, 255, 0.92);
  outline: none;
  font-weight: 900;
  font-size: 14px;
  padding: 0 12px;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.06) inset;

  &:focus {
    border-color: rgba(255, 0, 110, 0.35);
  }

  option {
    color: #111;
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const BtnRow = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;

  @media (max-width: 860px) {
    justify-content: flex-start;
  }
`;

const PrimaryBtn = styled.button<{ disabled?: boolean }>`
  position: relative;
  border: 1px solid rgba(255, 0, 110, 0.25);
  border-radius: 999px;
  padding: 10px 14px;
  font-size: 13px;
  font-weight: 950;
  cursor: pointer;
  color: rgba(255, 255, 255, 0.95);
  background:
    radial-gradient(260px 140px at 30% 20%, rgba(255, 0, 110, 0.65), transparent 60%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.04));
  box-shadow: 0 10px 28px rgba(255, 0, 110, 0.18);
  transition:
    transform 0.15s ease,
    filter 0.15s ease,
    opacity 0.15s ease;

  &:hover {
    transform: translateY(-1px);
    filter: brightness(1.05);
  }
  &:active {
    transform: translateY(0);
  }

  ${({ disabled }) => disabled && 'opacity: 0.6; cursor: not-allowed; transform: none;'}
`;

const SoftBtn = styled.button<{ disabled?: boolean }>`
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 999px;
  padding: 10px 14px;
  font-size: 13px;
  font-weight: 900;
  cursor: pointer;
  color: rgba(255, 255, 255, 0.85);
  background: rgba(0, 0, 0, 0.1);
  transition:
    transform 0.15s ease,
    background 0.15s ease,
    border-color 0.15s ease,
    opacity 0.15s ease;

  &:hover {
    transform: translateY(-1px);
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.18);
  }
  &:active {
    transform: translateY(0);
  }

  ${({ disabled }) => disabled && 'opacity: 0.6; cursor: not-allowed; transform: none;'}
`;

const Spinner = styled.div`
  width: 1.05rem;
  height: 1.05rem;
  border: 2.5px solid rgba(255, 255, 255, 0.9);
  border-top-color: transparent;
  border-radius: 50%;
  animation: ${spin} 0.85s linear infinite;

  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
`;

const ErrorText = styled.div`
  color: rgba(255, 170, 170, 0.95);
  font-size: 12px;
  font-weight: 800;
`;

const MatchSummary = styled.div`
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.12);
  padding: 10px 12px;
  display: grid;
  gap: 8px;
`;

const SummaryLine = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
  color: rgba(255, 255, 255, 0.82);
  font-weight: 850;
`;

const Muted = styled.span`
  color: rgba(255, 255, 255, 0.68);
  font-weight: 800;
`;



type PenaltyWinnerUI = 'Home' | 'Away' | null;
type ScoreUI = { home: number; away: number };

type MatchView = {
  match_id: string;
  phase: string;
  home: string;
  away: string;
  kick_off: string;
  result: unknown;
};

function kickOffToMs(kickOff: unknown): number {
  const n = Number(kickOff);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n < 10_000_000_000 ? n * 1000 : n;
}

function formatKickoff(kickOff: unknown) {
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

function clampInt(n: unknown, min: number, max: number) {
  const v = Number(n);
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, Math.trunc(v)));
}


function parseResultStatus(result: any): {
  status: 'OPEN' | 'LIVE' | 'FINAL';
  score: { home: number; away: number };
  penalty_winner: PenaltyWinnerUI;
} {
  if (result?.Finalized?.score) {
    const sc = result.Finalized.score;
    return {
      status: 'FINAL',
      score: { home: Number(sc.home ?? 0) || 0, away: Number(sc.away ?? 0) || 0 },
      penalty_winner: (result.Finalized.penalty_winner ?? null) as PenaltyWinnerUI,
    };
  }
  if (result?.Proposed?.score) {
    const sc = result.Proposed.score;
    return {
      status: 'LIVE',
      score: { home: Number(sc.home ?? 0) || 0, away: Number(sc.away ?? 0) || 0 },
      penalty_winner: (result.Proposed.penalty_winner ?? null) as PenaltyWinnerUI,
    };
  }

 
  if (result?.finalized?.score) {
    const sc = result.finalized.score;
    return {
      status: 'FINAL',
      score: { home: Number(sc.home ?? 0) || 0, away: Number(sc.away ?? 0) || 0 },
      penalty_winner: (result.finalized.penalty_winner ?? null) as PenaltyWinnerUI,
    };
  }
  if (result?.proposed?.score) {
    const sc = result.proposed.score;
    return {
      status: 'LIVE',
      score: { home: Number(sc.home ?? 0) || 0, away: Number(sc.away ?? 0) || 0 },
      penalty_winner: (result.proposed.penalty_winner ?? null) as PenaltyWinnerUI,
    };
  }

  return { status: 'OPEN', score: { home: 0, away: 0 }, penalty_winner: null };
}

function statusPillVariant(status: 'OPEN' | 'LIVE' | 'FINAL') {
  if (status === 'FINAL') return 'final' as const;
  if (status === 'LIVE') return 'ok' as const;
  return 'muted' as const;
}

function statusLabel(status: 'OPEN' | 'LIVE' | 'FINAL') {
  if (status === 'FINAL') return 'FINALIZED';
  if (status === 'LIVE') return 'PROPOSED';
  return 'OPEN';
}

async function readAllMatchesFromState(api: unknown): Promise<MatchView[]> {
  const svc = new Service(new Program(api as any, PROGRAM_ID));
  const state = await (svc as any).queryState();

  const list: any[] = Array.isArray((state as any)?.matches) ? (state as any).matches : [];

  return list.map((m: any) => ({
    match_id: String(m?.match_id ?? ''),
    phase: String(m?.phase ?? ''),
    home: String(m?.home ?? ''),
    away: String(m?.away ?? ''),
    kick_off: String(m?.kick_off ?? '0'),
    result: m?.result ?? null,
  })) as MatchView[];
}

export const ProposeResultComponent: React.FC = () => {
  const { account } = useAccount();
  const toast = useToast();
  const { api, isApiReady } = useApi();

  const connected = !!account?.decodedAddress;

  
  const [allMatches, setAllMatches] = useState<MatchView[]>([]);
  const [loadingState, setLoadingState] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [matchId, setMatchId] = useState<string>('');
  const [score, setScore] = useState<ScoreUI>({ home: 0, away: 0 });
  const [penaltyWinner, setPenaltyWinner] = useState<PenaltyWinnerUI>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void web3Enable('Smart Cup Admin');
  }, []);

  const refreshStateMatches = useCallback(async () => {
    if (!api || !isApiReady) return;
    setLoadingState(true);
    setError(null);

    try {
      const list = await readAllMatchesFromState(api);

      list.sort((a: MatchView, b: MatchView) => Number(a.match_id) - Number(b.match_id));

      setAllMatches(list);
    } catch (e) {
      console.error(e);
      setAllMatches([]);
      setError('Failed to load matches from queryState()');
    } finally {
      setLoadingState(false);
    }
  }, [api, isApiReady]);

  useEffect(() => {
    if (isApiReady) void refreshStateMatches();
  }, [isApiReady, refreshStateMatches]);

  const match = useMemo(() => {
    if (!matchId || !/^\d+$/.test(matchId)) return null;
    return allMatches.find((m) => String(m.match_id) === String(matchId)) ?? null;
  }, [allMatches, matchId]);

  const current = useMemo(() => parseResultStatus(match?.result), [match]);

  const validate = useCallback(() => {
    if (!connected) return 'Connect your wallet first';
    if (!api || !isApiReady) return 'Node API not ready';
    if (!matchId || !/^\d+$/.test(matchId)) return 'Enter a valid match ID';
    if (!match) return 'Match not found in queryState() (refresh and try again)';
    if (current.status === 'FINAL') return 'This match is already finalized';
    if (score.home < 0 || score.home > 99 || score.away < 0 || score.away > 99) return 'Scores must be 0–99';
    return null;
  }, [connected, api, isApiReady, matchId, match, current.status, score.home, score.away]);

  const handlePropose = useCallback(async () => {
    setError(null);
    const err = validate();
    if (err) {
      setError(err);
      toast.error(err);
      return;
    }
    if (!api || !isApiReady || !account || !match) return;

    try {
      setSubmitting(true);

      const svc = new Service(new Program(api as any, PROGRAM_ID));

      const tx: TransactionBuilder<unknown> = (svc as any).proposeResult(
        BigInt(match.match_id),
        { home: score.home, away: score.away },
        penaltyWinner !== null ? penaltyWinner : null,
      );

      const { signer } = await web3FromSource(account.meta.source);
      tx.withAccount(account.decodedAddress, { signer }).withValue(0n);

      await tx.calculateGas();

      const { blockHash, response } = await tx.signAndSend();
      toast.info(`TX included in block ${blockHash}`);
      await response();

      toast.success('Result proposal sent!');
      await refreshStateMatches();
    } catch (e) {
      console.error(e);
      setError('Failed to submit proposal');
      toast.error('Failed to submit proposal');
    } finally {
      setSubmitting(false);
    }
  }, [validate, api, isApiReady, account, match, score.home, score.away, penaltyWinner, alert, refreshStateMatches]);

  return (
    <Shell>
      <Card>
        <CardHead>
          <HeadLeft>
            <TitleRow>
              <div className="badge">🧪</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div className="title">Propose Match Result</div>
                  <Icons>
                    <img src={VARA_ICON} alt="Vara Network" />
                    <img className="token" src={VARA_TOKEN_ICON} alt="VARA token" />
                  </Icons>
                </div>
                <Subtitle>Reads matches from queryState() and submits a proposeResult transaction (oracle/admin).</Subtitle>
              </div>
            </TitleRow>
          </HeadLeft>

          <HeadRight>
            <Pill $variant={connected ? 'ok' : 'warn'}>{connected ? 'Wallet connected' : 'Wallet not connected'}</Pill>
            <SoftBtn type="button" onClick={refreshStateMatches} disabled={loadingState}>
              {loadingState ? 'Refreshing…' : 'Refresh matches'}
            </SoftBtn>
          </HeadRight>
        </CardHead>

        <Body>
          <Section>
            <SectionHead>
              <div>
                <div className="t">1) Select match</div>
                <div className="s">Type the match id (from queryState).</div>
              </div>
              <div className="s">
                Loaded: <b>{allMatches.length}</b>
              </div>
            </SectionHead>

            <SectionBody>
              <Row>
                <Label>Match ID</Label>
                <FieldLine>
                  <Input
                    style={{ width: 160 }}
                    placeholder="e.g. 1"
                    value={matchId}
                    onChange={(e) => {
                      setMatchId(e.target.value.replace(/\D/g, ''));
                      setError(null);
                    }}
                    disabled={submitting}
                  />

                  <Pill $variant={match ? 'ok' : 'muted'}>{match ? `Loaded: #${match.match_id}` : matchId ? 'Not found' : '—'}</Pill>

                  {match ? (
                    <Pill $variant={statusPillVariant(current.status)}>
                      {statusLabel(current.status)} • {current.score.home}-{current.score.away}
                      {current.penalty_winner ? ` (${current.penalty_winner})` : ''}
                    </Pill>
                  ) : null}
                </FieldLine>
              </Row>

              {match ? (
                <MatchSummary>
                  <SummaryLine>
                    <Pill $variant="muted">#{match.match_id}</Pill>
                    <Pill $variant="muted">{match.phase || '—'}</Pill>
                    <Pill $variant="muted">
                      Kickoff: <b style={{ color: 'rgba(255,255,255,0.92)' }}>{formatKickoff(match.kick_off)}</b>
                    </Pill>
                  </SummaryLine>
                  <SummaryLine>
                    <Muted>
                      {match.home} vs {match.away}
                    </Muted>
                  </SummaryLine>
                </MatchSummary>
              ) : (
                <div style={{ color: 'rgba(255,255,255,0.68)', fontSize: 12, fontWeight: 800 }}>
                  Tip: Click <b>Refresh matches</b> if you just registered new matches.
                </div>
              )}
            </SectionBody>
          </Section>

          <Section>
            <SectionHead>
              <div>
                <div className="t">2) Enter result</div>
                <div className="s">Score 0–99. Set penalty winner only if needed.</div>
              </div>
              <div className="s">
                Current: <b>{statusLabel(current.status)}</b>
              </div>
            </SectionHead>

            <SectionBody>
              <Row>
                <Label>Score</Label>
                <FieldLine>
                  <Input
                    type="number"
                    min={0}
                    max={99}
                    value={score.home}
                    disabled={submitting || !match || current.status === 'FINAL'}
                    onChange={(e) => setScore((s) => ({ ...s, home: clampInt(e.target.value, 0, 99) }))}
                    style={{ width: 120 }}
                  />
                  <span style={{ fontWeight: 950, opacity: 0.7 }}>—</span>
                  <Input
                    type="number"
                    min={0}
                    max={99}
                    value={score.away}
                    disabled={submitting || !match || current.status === 'FINAL'}
                    onChange={(e) => setScore((s) => ({ ...s, away: clampInt(e.target.value, 0, 99) }))}
                    style={{ width: 120 }}
                  />

                  <Pill $variant="muted">
                    Draft:{' '}
                    <b style={{ color: 'rgba(255,255,255,0.92)' }}>
                      {score.home}-{score.away}
                    </b>
                  </Pill>
                </FieldLine>
              </Row>

              <Row>
                <Label>Penalty winner</Label>
                <FieldLine>
                  <Select
                    value={penaltyWinner ?? ''}
                    onChange={(e) => setPenaltyWinner(e.target.value === '' ? null : (e.target.value as PenaltyWinnerUI))}
                    disabled={submitting || !match || current.status === 'FINAL'}
                    style={{ width: 220 }}
                  >
                    <option value="">—</option>
                    <option value="Home">Home</option>
                    <option value="Away">Away</option>
                  </Select>

                  <Pill $variant="muted">Optional</Pill>
                </FieldLine>
              </Row>
            </SectionBody>
          </Section>

          <Section>
            <SectionHead>
              <div>
                <div className="t">3) Submit on-chain</div>
                <div className="s">proposeResult(matchId, score, penaltyWinner?)</div>
              </div>
            </SectionHead>

            <SectionBody>
              <BtnRow>
                <PrimaryBtn type="button" onClick={handlePropose} disabled={submitting || !!validate()}>
                  {submitting ? <Spinner /> : null}
                  {submitting ? 'Submitting…' : 'Propose Result'}
                </PrimaryBtn>
              </BtnRow>

              {error ? <ErrorText>{error}</ErrorText> : null}
              {current.status === 'FINAL' ? <ErrorText>This match is finalized. You must not propose a new result.</ErrorText> : null}
            </SectionBody>
          </Section>
        </Body>
      </Card>
    </Shell>
  );
};

