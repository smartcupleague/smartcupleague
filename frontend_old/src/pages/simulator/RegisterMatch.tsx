import React, { useState, useCallback, useEffect, useMemo } from 'react';
import styled, { keyframes } from 'styled-components';
import { useAccount, useApi } from '@gear-js/react-hooks';
import { useToast } from '@/hooks/useToast';
import { web3Enable, web3FromSource } from '@polkadot/extension-dapp';
import { TransactionBuilder } from 'sails-js';
import { Program, Service } from '@/hocs/lib';
import { HexString } from '@gear-js/api';

const VARA_NETWORK_ICON = 'https://img.cryptorank.io/coins/vara_network1695313579900.png';
const VARA_TOKEN_ICON = 'https://s2.coinmarketcap.com/static/img/coins/200x200/28067.png';

const PROGRAM_ID = import.meta.env.VITE_BOLAOCOREPROGRAM as string;

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

const Pill = styled.span<{ $variant?: 'warn' | 'ok' | 'muted' }>`
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

const FormCard = styled.form`
  border-radius: 18px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.12);
  overflow: hidden;
`;

const FormHead = styled.div`
  padding: 12px 12px 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  align-items: center;
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

const FormGrid = styled.div`
  padding: 12px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;

  @media (max-width: 860px) {
    grid-template-columns: 1fr;
  }
`;

const Field = styled.div`
  display: grid;
  gap: 8px;

  label {
    font-size: 12px;
    font-weight: 900;
    color: rgba(255, 255, 255, 0.78);
  }
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

const Help = styled.div`
  font-size: 12px;
  color: rgba(255, 255, 255, 0.62);
  line-height: 1.35;
`;

const Preview = styled.div`
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(0, 0, 0, 0.12);
  padding: 10px 12px;

  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;

  .k {
    font-weight: 900;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.68);
  }
  .v {
    font-weight: 950;
    color: rgba(255, 255, 255, 0.92);
    font-size: 12px;
  }
`;

const FormFoot = styled.div`
  padding: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
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

function toLocalDateTimeValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localDateTimeToUnixMs(v: string): number | null {
  if (!v || typeof v !== 'string') return null;
  const ms = new Date(v).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return ms;
}

function formatUnixMs(ms: number | null): string {
  if (!ms || ms <= 0) return '—';
  return new Date(ms).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const RegisterMatchComponent: React.FC = () => {
  const { account } = useAccount();
  const toast = useToast();
  const { api, isApiReady } = useApi();

  const connected = !!account?.decodedAddress;

  const [phase, setPhase] = useState('');
  const [home, setHome] = useState('');
  const [away, setAway] = useState('');

  const [kickoffLocal, setKickoffLocal] = useState('');

  const kickoffMs = useMemo(() => localDateTimeToUnixMs(kickoffLocal), [kickoffLocal]);

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void web3Enable('SmartCup RegisterMatch');
  }, []);

  useEffect(() => {
    const now = new Date();
    const v = new Date(now.getTime() + 60 * 60 * 1000);
    setKickoffLocal((prev) => prev || toLocalDateTimeValue(v));
  }, []);

  const validationError = useMemo(() => {
    if (!connected) return 'Connect wallet';
    if (!api || !isApiReady) return 'API not ready';
    if (!PROGRAM_ID) return 'Missing PROGRAM_ID';
    if (!phase.trim()) return 'Phase is required';
    if (!home.trim()) return 'Home team is required';
    if (!away.trim()) return 'Away team is required';
    if (home.trim().toLowerCase() === away.trim().toLowerCase()) return 'Home and away teams must be different';
    if (!kickoffMs) return 'Kickoff date/time is required';
    return null;
  }, [connected, api, isApiReady, phase, home, away, kickoffMs]);

  const handleRegister = useCallback(
    async (e?: React.FormEvent) => {
      if (e) e.preventDefault();

      if (validationError) {
        toast.error(validationError);
        return;
      }
      if (!api || !isApiReady || !account) return;

      try {
        setLoading(true);

        const svc = new Service(new Program(api, PROGRAM_ID as HexString));

        const tx: TransactionBuilder<unknown> = (svc as any).registerMatch(
          phase.trim(),
          home.trim(),
          away.trim(),
          BigInt(kickoffMs!), // 🔥 ms
        );

        const { signer } = await web3FromSource(account.meta.source);
        tx.withAccount(account.decodedAddress, { signer });

        await tx.calculateGas();
        const { blockHash, response } = await tx.signAndSend();

        toast.info(`Included in block ${blockHash}`);
        await response();
        toast.success('Match registered!');

        setPhase('');
        setHome('');
        setAway('');

        const now = new Date();
        setKickoffLocal(toLocalDateTimeValue(new Date(now.getTime() + 60 * 60 * 1000)));
      } catch (err) {
        console.error(err);
        toast.error((err as Error).message || 'Failed to register match');
      } finally {
        setLoading(false);
      }
    },
    [validationError, api, isApiReady, account, alert, phase, home, away, kickoffMs],
  );

  return (
    <Shell>
      <Card>
        <CardHead>
          <HeadLeft>
            <TitleRow>
              <div className="badge">🗓️</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div className="title">Register Match</div>
                  <Icons>
                    <img src={VARA_NETWORK_ICON} alt="Vara Network" />
                    <img className="token" src={VARA_TOKEN_ICON} alt="VARA token" />
                  </Icons>
                </div>
                <Subtitle>
                  Friendly kickoff picker (calendar). We convert to <b>Unix milliseconds</b> and send it to the
                  contract.
                </Subtitle>
              </div>
            </TitleRow>
          </HeadLeft>

          <HeadRight>
            <Pill $variant={connected ? 'ok' : 'warn'}>{connected ? 'Wallet connected' : 'Wallet not connected'}</Pill>
            {validationError ? <Pill $variant="warn">⚠ {validationError}</Pill> : <Pill $variant="ok">✓ Ready</Pill>}
          </HeadRight>
        </CardHead>

        <div style={{ padding: 14, display: 'grid', gap: 12 }}>
          <div
            style={{
              borderRadius: 16,
              border: '1px solid rgba(255,255,255,0.10)',
              background: 'rgba(0,0,0,0.12)',
              padding: '10px 12px',
              display: 'flex',
              gap: 10,
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Pill $variant="muted">home ≠ away</Pill>
              <Pill $variant="muted">Phase label</Pill>
              <Pill $variant="muted">Calendar kickoff</Pill>
            </div>
            <div style={{ color: 'rgba(255,255,255,0.68)', fontSize: 12, fontWeight: 800 }}>
              Contract kickoff (ms): <span style={{ color: 'rgba(255,255,255,0.92)' }}>{kickoffMs ?? '—'}</span>
            </div>
          </div>

          <FormCard onSubmit={handleRegister} autoComplete="off">
            <FormHead>
              <div>
                <div className="t">Match details</div>
                <div className="s">Fill all fields and submit on-chain.</div>
              </div>
              <div className="s">Preview: {formatUnixMs(kickoffMs)}</div>
            </FormHead>

            <FormGrid>
              <Field style={{ gridColumn: '1 / -1' }}>
                <label htmlFor="phase">Phase</label>
                <Input
                  id="phase"
                  type="text"
                  placeholder="e.g. Group Stage / Quarter-Final"
                  value={phase}
                  onChange={(e) => setPhase(e.target.value)}
                  disabled={loading}
                />
              </Field>

              <Field>
                <label htmlFor="home">Home team</label>
                <Input
                  id="home"
                  type="text"
                  placeholder="Mexico"
                  value={home}
                  onChange={(e) => setHome(e.target.value)}
                  disabled={loading}
                />
              </Field>

              <Field>
                <label htmlFor="away">Away team</label>
                <Input
                  id="away"
                  type="text"
                  placeholder="South Africa"
                  value={away}
                  onChange={(e) => setAway(e.target.value)}
                  disabled={loading}
                />
              </Field>

              <Field style={{ gridColumn: '1 / -1' }}>
                <label htmlFor="kickoffLocal">Kickoff date & time</label>
                <Input
                  id="kickoffLocal"
                  type="datetime-local"
                  value={kickoffLocal}
                  onChange={(e) => setKickoffLocal(e.target.value)}
                  disabled={loading}
                />
                <Help>
                  We send <b>{kickoffMs ?? '—'}</b> (<b>Unix milliseconds</b>) to the contract.
                </Help>
              </Field>

              <div style={{ gridColumn: '1 / -1' }}>
                <Preview>
                  <span className="k">Preview</span>
                  <span className="v">
                    {phase.trim() ? phase.trim() : '—'} • <b>{home.trim() || 'Home'}</b> vs{' '}
                    <b>{away.trim() || 'Away'}</b> • Kickoff: {formatUnixMs(kickoffMs)}
                  </span>
                </Preview>
              </div>
            </FormGrid>

            <FormFoot>
              <PrimaryBtn type="submit" disabled={loading || !!validationError}>
                {loading ? <Spinner /> : null}
                {loading ? 'Registering…' : 'Register Match'}
              </PrimaryBtn>
            </FormFoot>
          </FormCard>
        </div>
      </Card>
    </Shell>
  );
};
