import React, { useState, useCallback, useEffect, useMemo } from 'react';
import styled, { keyframes } from 'styled-components';
import { useAccount, useApi } from '@gear-js/react-hooks';
import { useToast } from '@/hooks/useToast';
import { web3Enable, web3FromSource } from '@polkadot/extension-dapp';
import { TransactionBuilder } from 'sails-js';
import { Program, Service } from '@/hocs/lib';


const VARA_NETWORK_ICON = 'https://img.cryptorank.io/coins/vara_network1695313579900.png';
const VARA_TOKEN_ICON = 'https://s2.coinmarketcap.com/static/img/coins/200x200/28067.png';

const PROGRAM_ID = import.meta.env.VITE_BOLAOCOREPROGRAM;


type Match = {
  match_id: string | number;
  phase: string;
  home: string;
  away: string;
  kick_off: string | number;
  result: any;
  match_prize_pool: string;
  has_bets: boolean;
  participants: string[];
  total_winner_stake: string;
  total_claimed: string;
  settlement_prepared: boolean;
  dust_swept: boolean;
};

type PhaseConfig = {
  name: string;
  start_time: string | number;
  end_time: string | number;
  points_weight: number;
};

type IoSmartCupState = {
  admin: string;
  final_prize_distributor: string;
  protocol_fee_accumulated: string;
  final_prize_accumulated: string;
  matches: Match[];
  phases: PhaseConfig[];
  user_points: [string, number][];
  podium_finalized: boolean;
  r32_lock_time?: string;
};

type SmartCupEvent = any;


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
  background: radial-gradient(900px 260px at 18% 0%, rgba(255, 0, 110, 0.12), transparent 60%),
    rgba(0, 0, 0, 0.12);
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

  .title {
    margin: 0;
    font-size: 16px;
    font-weight: 950;
    color: rgba(255, 255, 255, 0.93);
    letter-spacing: 0.2px;
    line-height: 1.2;
  }

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

const Pill = styled.span<{ $variant?: 'warn' | 'ok' | 'muted' }>`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 999px;
  font-weight: 900;
  font-size: 12px;

  border: 1px solid
    ${({ $variant }) =>
      $variant === 'ok'
        ? 'rgba(65, 214, 114, 0.35)'
        : $variant === 'warn'
        ? 'rgba(255, 194, 75, 0.25)'
        : 'rgba(255,255,255,0.12)'};

  background: ${({ $variant }) =>
    $variant === 'ok'
      ? 'rgba(65, 214, 114, 0.10)'
      : $variant === 'warn'
      ? 'rgba(255, 194, 75, 0.08)'
      : 'rgba(0,0,0,0.10)'};

  color: ${({ $variant }) =>
    $variant === 'ok'
      ? 'rgba(210, 255, 225, 0.92)'
      : $variant === 'warn'
      ? 'rgba(255, 235, 200, 0.92)'
      : 'rgba(255,255,255,0.82)'};
`;

const CardBody = styled.div`
  padding: 14px;
  display: grid;
  gap: 12px;
`;

const InfoBar = styled.div`
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.12);
  padding: 10px 12px;

  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;

  @media (max-width: 860px) {
    flex-direction: column;
    align-items: flex-start;
  }
`;

const InfoLeft = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  color: rgba(255, 255, 255, 0.74);
  font-size: 12px;
`;

const MiniBtn = styled.button`
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(0, 0, 0, 0.12);
  color: rgba(255, 255, 255, 0.88);
  padding: 10px 12px;
  border-radius: 14px;
  cursor: pointer;
  font-weight: 900;
  font-size: 13px;
  transition: transform 0.15s ease, background 0.15s ease, border-color 0.15s ease;

  &:hover {
    transform: translateY(-1px);
    border-color: rgba(255, 255, 255, 0.18);
    background: rgba(255, 255, 255, 0.08);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
  }
`;

const List = styled.div`
  border-radius: 18px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.12);
  overflow: hidden;
`;

const ListHead = styled.div`
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

const ListBody = styled.div`
  max-height: 260px;
  overflow: auto;
  padding: 10px;
  display: grid;
  gap: 8px;
`;

const Item = styled.button<{ $active?: boolean }>`
  width: 100%;
  text-align: left;
  border-radius: 16px;
  border: 1px solid ${({ $active }) => ($active ? 'rgba(255,0,110,.45)' : 'rgba(255,255,255,.10)')};
  background: ${({ $active }) =>
    $active
      ? 'radial-gradient(520px 140px at 20% 20%, rgba(255,0,110,.18), transparent 62%), rgba(0,0,0,.12)'
      : 'rgba(0,0,0,.10)'};
  color: rgba(255, 255, 255, 0.9);
  padding: 10px 12px;
  cursor: pointer;
  transition: transform 0.15s ease, border-color 0.15s ease, background 0.15s ease;

  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;

  &:hover {
    transform: translateY(-1px);
    border-color: rgba(255, 255, 255, 0.18);
    background: rgba(255, 255, 255, 0.08);
  }
`;

const ItemLeft = styled.div`
  min-width: 0;
  display: grid;
  gap: 4px;

  .main {
    font-weight: 950;
    color: rgba(255, 255, 255, 0.94);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .sub {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.68);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
`;

const ItemRight = styled.div`
  display: inline-flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
  align-items: center;
`;

const Badge = styled.span<{ $variant?: 'ok' | 'warn' | 'muted' }>`
  padding: 6px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 900;
  white-space: nowrap;

  border: 1px solid
    ${({ $variant }) =>
      $variant === 'ok'
        ? 'rgba(65, 214, 114, 0.35)'
        : $variant === 'warn'
        ? 'rgba(255, 194, 75, 0.25)'
        : 'rgba(255,255,255,0.12)'};

  background: ${({ $variant }) =>
    $variant === 'ok'
      ? 'rgba(65, 214, 114, 0.10)'
      : $variant === 'warn'
      ? 'rgba(255, 194, 75, 0.08)'
      : 'rgba(0,0,0,0.10)'};

  color: ${({ $variant }) =>
    $variant === 'ok'
      ? 'rgba(210, 255, 225, 0.92)'
      : $variant === 'warn'
      ? 'rgba(255, 235, 200, 0.92)'
      : 'rgba(255,255,255,0.82)'};
`;

const FormFoot = styled.div`
  padding: 12px;
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
  background: radial-gradient(260px 140px at 30% 20%, rgba(255, 0, 110, 0.65), transparent 60%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.04));
  box-shadow: 0 10px 28px rgba(255, 0, 110, 0.18);
  transition: transform 0.15s ease, filter 0.15s ease, opacity 0.15s ease;

  &:hover {
    transform: translateY(-1px);
    filter: brightness(1.05);
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

const Msg = styled.div<{ $variant?: 'ok' | 'warn' }>`
  padding: 10px 12px;
  border-radius: 16px;
  border: 1px solid ${({ $variant }) => ($variant === 'ok' ? 'rgba(65,214,114,.35)' : 'rgba(255,194,75,.25)')};
  background: ${({ $variant }) => ($variant === 'ok' ? 'rgba(65,214,114,.10)' : 'rgba(255,194,75,.08)')};
  color: ${({ $variant }) => ($variant === 'ok' ? 'rgba(210,255,225,.92)' : 'rgba(255,235,200,.92)')};
  font-weight: 900;
  font-size: 12px;
`;

const Empty = styled.div`
  padding: 8px 2px;
  color: rgba(255, 255, 255, 0.72);
  font-size: 12px;
`;


function isFinalizedResult(result: any): boolean {
  if (!result) return false;
  return !!(result.Finalized || result.finalized);
}

function getFinalScoreStr(result: any): string {
  const fin = result?.Finalized ?? result?.finalized;
  const s = fin?.score;
  if (!s) return '—';
  const h = Number(s.home ?? 0) || 0;
  const a = Number(s.away ?? 0) || 0;
  return `${h}-${a}`;
}

function toKickoffLabel(kick_off: string | number) {
  const n = Number(kick_off);
  if (!Number.isFinite(n) || n <= 0) return '—';
  const ms = n < 10_000_000_000 ? n * 1000 : n;
  return new Date(ms).toLocaleString(undefined, {
    year: '2-digit',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}


export const PrepareSettlementComponent: React.FC = () => {
  const { account } = useAccount();
  const toast = useToast();
  const { api, isApiReady } = useApi();

  const [loading, setLoading] = useState(false);
  const [matches, setMatches] = useState<Match[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState<string | number | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  useEffect(() => {
    void web3Enable('SmartCup – PrepareMatchSettlement');
  }, []);

  const connected = !!account?.decodedAddress;

  const fetchMatches = useCallback(async () => {
    if (!api || !isApiReady) return;
    try {
      const svc = new Service(new Program(api, PROGRAM_ID));
      const state: IoSmartCupState = await (svc as any).queryState();

      const filtered = (state.matches || []).filter((m) => {
        if (!m || typeof m !== 'object') return false;
        const finalized = isFinalizedResult(m.result);
        return finalized && !m.settlement_prepared;
      });

      filtered.sort((a, b) => Number(b.match_id) - Number(a.match_id));

      setMatches(filtered);
    } catch (e) {
      console.error(e);
      setMatches([]);
    }
  }, [api, isApiReady]);

  useEffect(() => {
    void fetchMatches();
  }, [fetchMatches, loading]);

  const selectedMatch = useMemo(
    () => matches.find((m) => String(m.match_id) === String(selectedMatchId)),
    [matches, selectedMatchId],
  );

  const handlePrepare = useCallback(async () => {
    setErrMsg(null);
    setOkMsg(null);

    if (!connected) {
      setErrMsg('Connect your wallet first.');
      toast.error('Connect your wallet first.');
      return;
    }
    if (!api || !isApiReady) {
      setErrMsg('Node API not ready');
      toast.error('Node API not ready');
      return;
    }
    if (!selectedMatchId) {
      setErrMsg('Select a match to prepare settlement');
      toast.error('Select a match first');
      return;
    }

    try {
      setLoading(true);

      const svc = new Service(new Program(api, PROGRAM_ID));
      const tx: TransactionBuilder<SmartCupEvent> = (svc as any).prepareMatchSettlement(BigInt(selectedMatchId));

      const injector = await web3FromSource(account!.meta.source);
      tx.withAccount(account!.decodedAddress, { signer: injector.signer });

      await tx.calculateGas();
      const { blockHash, response } = await tx.signAndSend();

      toast.info(`Settlement preparation included in block ${blockHash}`);
      await response();

      toast.success('Settlement prepared!');
      setOkMsg('Settlement prepared successfully!');
      setSelectedMatchId(null);
      await fetchMatches();
    } catch (err: any) {
      console.error(err);
      const m = err?.message ?? 'Settlement preparation failed';
      setErrMsg(m);
      toast.error(m);
    } finally {
      setLoading(false);
    }
  }, [selectedMatchId, connected, api, isApiReady, account, alert, fetchMatches]);

  const validationError = useMemo(() => {
    if (!connected) return 'Connect wallet';
    if (!api || !isApiReady) return 'API not ready';
    if (!PROGRAM_ID) return 'Missing PROGRAM_ID';
    if (!selectedMatchId) return 'Select a match';
    return null;
  }, [connected, api, isApiReady, selectedMatchId]);

  return (
    <Shell>
      <Card>
        <CardHead>
          <HeadLeft>
            <TitleRow>
              <div className="badge">🧾</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div className="title">Prepare Match Settlement</div>
                  <Icons>
                    <img src={VARA_NETWORK_ICON} alt="Vara Network" />
                    <img className="token" src={VARA_TOKEN_ICON} alt="VARA token" />
                  </Icons>
                </div>
                <Subtitle>
                  Admin tool. Computes <b>total_winner_stake</b> for a finalized match so users can claim.
                </Subtitle>
              </div>
            </TitleRow>
          </HeadLeft>

          <HeadRight>
            <Pill $variant={connected ? 'ok' : 'warn'}>{connected ? 'Wallet connected' : 'Wallet not connected'}</Pill>
            <Pill $variant="muted">Admin only</Pill>
          </HeadRight>
        </CardHead>

        <CardBody>
          <InfoBar>
            <InfoLeft>
              <Pill $variant="muted">Finalized only</Pill>
              <Pill $variant="muted">Not settled yet</Pill>
              <Pill $variant="muted">Enables claims</Pill>
            </InfoLeft>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <MiniBtn type="button" disabled={loading || !isApiReady} onClick={() => fetchMatches()}>
                Refresh list
              </MiniBtn>
            </div>
          </InfoBar>

          <List>
            <ListHead>
              <div>
                <div className="t">Select match</div>
                <div className="s">Only finalized matches with settlement_prepared = false.</div>
              </div>
              <div className="s">
                {validationError ? (
                  <span style={{ color: 'rgba(255,235,200,.92)' }}>⚠ {validationError}</span>
                ) : (
                  <span style={{ color: 'rgba(210,255,225,.92)' }}>✓ Ready</span>
                )}
              </div>
            </ListHead>

            <ListBody>
              {matches.length === 0 ? (
                <Empty>No finalized matches pending settlement found.</Empty>
              ) : (
                matches.map((m) => {
                  const active = String(m.match_id) === String(selectedMatchId);
                  const score = getFinalScoreStr(m.result);
                  return (
                    <Item key={String(m.match_id)} $active={active} onClick={() => setSelectedMatchId(m.match_id)} type="button">
                      <ItemLeft>
                        <div className="main">
                          #{m.match_id} • {m.home} vs {m.away}
                        </div>
                        <div className="sub">
                          Phase: {m.phase} • Kickoff: {toKickoffLabel(m.kick_off)} • Final: {score}
                        </div>
                      </ItemLeft>

                      <ItemRight>
                        <Badge $variant="warn">Needs settlement</Badge>
                      </ItemRight>
                    </Item>
                  );
                })
              )}
            </ListBody>

            <FormFoot>
              {okMsg ? <Msg $variant="ok">✓ {okMsg}</Msg> : null}
              {errMsg ? <Msg $variant="warn">⚠ {errMsg}</Msg> : null}

              <PrimaryBtn type="button" disabled={loading || !!validationError} onClick={handlePrepare}>
                {loading ? <Spinner /> : null}
                {loading ? 'Preparing…' : 'Prepare Settlement'}
              </PrimaryBtn>
            </FormFoot>
          </List>

          {selectedMatch ? (
            <Msg $variant="warn">
              Selected: #{selectedMatch.match_id} — {selectedMatch.home} vs {selectedMatch.away}. This will compute winner stake and enable claims.
            </Msg>
          ) : null}
        </CardBody>
      </Card>
    </Shell>
  );
};
