import React, { useEffect, useMemo, useState, useCallback } from 'react';
import styled, { keyframes } from 'styled-components';
import { useAccount, useApi } from '@gear-js/react-hooks';
import { useToast } from '@/hooks/useToast';
import { web3Enable, web3FromSource } from '@polkadot/extension-dapp';
import { TransactionBuilder } from 'sails-js';
import { Program, Service } from '@/hocs/lib';

const VARA_NETWORK_ICON = 'https://img.cryptorank.io/coins/vara_network1695313579900.png';
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
  transition:
    transform 0.15s ease,
    background 0.15s ease,
    border-color 0.15s ease;

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
  return Math.floor(ms);
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

export const RegisterPhaseComponent: React.FC = () => {
  const { api, isApiReady } = useApi();
  const { account } = useAccount();
  const toast = useToast();

  const connected = !!account?.decodedAddress;

  const [phaseName, setPhaseName] = useState('');
  const [startLocal, setStartLocal] = useState('');
  const [endLocal, setEndLocal] = useState('');
  const [weight, setWeight] = useState('1');

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void web3Enable('SmartCup RegisterPhase');
  }, []);

  useEffect(() => {
    const now = new Date();
    const start = new Date(now.getTime() + 5 * 60 * 1000);
    const end = new Date(now.getTime() + 12 * 60 * 60 * 1000);
    setStartLocal((prev) => prev || toLocalDateTimeValue(start));
    setEndLocal((prev) => prev || toLocalDateTimeValue(end));
  }, []);

  const startMs = useMemo(() => localDateTimeToUnixMs(startLocal), [startLocal]);
  const endMs = useMemo(() => localDateTimeToUnixMs(endLocal), [endLocal]);

  const validationError = useMemo(() => {
    if (!connected) return 'Connect wallet';
    if (!api || !isApiReady) return 'API not ready';
    if (!PROGRAM_ID) return 'Missing PROGRAM_ID';
    if (!phaseName.trim()) return 'Phase name is required';
    if (!startMs) return 'Start date/time is required';
    if (!endMs) return 'End date/time is required';
    if (startMs >= endMs) return 'Start must be before end';
    const w = Number(weight);
    if (!Number.isFinite(w) || w < 1 || w > 10000) return 'Weight must be 1–10000';
    return null;
  }, [connected, api, isApiReady, phaseName, startMs, endMs, weight]);

  const presets = useMemo(() => {
    const now = new Date();
    const groupStart = new Date(now.getTime() + 5 * 60 * 1000);
    const groupEnd = new Date(now.getTime() + 18 * 60 * 60 * 1000);

    const playoffsStart = new Date(now.getTime() + 19 * 60 * 60 * 1000);
    const playoffsEnd = new Date(now.getTime() + 28 * 60 * 60 * 1000);

    return {
      group: {
        name: 'Group Stage',
        start: toLocalDateTimeValue(groupStart),
        end: toLocalDateTimeValue(groupEnd),
        w: '1',
      },
      playoffs: {
        name: 'Playoffs',
        start: toLocalDateTimeValue(playoffsStart),
        end: toLocalDateTimeValue(playoffsEnd),
        w: '2',
      },
    };
  }, []);

  const applyPreset = (p: 'group' | 'playoffs') => {
    const v = presets[p];
    setPhaseName(v.name);
    setStartLocal(v.start);
    setEndLocal(v.end);
    setWeight(v.w);
  };

  const handleSubmit = useCallback(
    async (ev?: React.FormEvent) => {
      if (ev) ev.preventDefault();

      if (validationError) {
        toast.error(validationError);
        return;
      }
      if (!api || !isApiReady || !account) return;

      const sMs = BigInt(startMs!);
      const eMs = BigInt(endMs!);
      const w = Number(weight);

      try {
        setLoading(true);

        const svc = new Service(new Program(api, PROGRAM_ID));
        const tx: TransactionBuilder<unknown> = (svc as any).registerPhase(phaseName.trim(), sMs, eMs, w);

        const injector = await web3FromSource(account.meta.source);
        tx.withAccount(account.decodedAddress, { signer: injector.signer });

        await tx.calculateGas();
        const { blockHash, response } = await tx.signAndSend();

        toast.info(`Transaction included in block ${blockHash}`);
        await response();
        toast.success(`Phase "${phaseName}" registered!`);

        setPhaseName('');
      } catch (err) {
        console.error(err);
        toast.error((err as Error).message || 'Register phase failed');
      } finally {
        setLoading(false);
      }
    },
    [validationError, api, isApiReady, account, startMs, endMs, weight, phaseName, toast],
  );

  return (
    <Shell>
      <Card>
        <CardHead>
          <HeadLeft>
            <TitleRow>
              <div className="badge">🏁</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div className="title">Register Phase</div>
                  <Icons>
                    <img src={VARA_NETWORK_ICON} alt="Vara Network" />
                    <img className="token" src={VARA_TOKEN_ICON} alt="VARA token" />
                  </Icons>
                </div>
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
              <Pill $variant="muted">Calendar input</Pill>
              <Pill $variant="muted">Auto converts to ms</Pill>
              <Pill $variant="muted">weight 1–10000</Pill>
            </InfoLeft>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <MiniBtn type="button" disabled={loading} onClick={() => applyPreset('group')}>
                Quick fill: Group Stage
              </MiniBtn>
              <MiniBtn type="button" disabled={loading} onClick={() => applyPreset('playoffs')}>
                Quick fill: Playoffs
              </MiniBtn>
            </div>
          </InfoBar>

          <FormCard onSubmit={handleSubmit} autoComplete="off">
            <FormHead>
              <div>
                <div className="t">Phase details</div>
                <div className="s">Select date/time and submit on-chain.</div>
              </div>
              <div className="s">
                {validationError ? (
                  <span style={{ color: 'rgba(255,235,200,.92)' }}>⚠ {validationError}</span>
                ) : (
                  <span style={{ color: 'rgba(210,255,225,.92)' }}>✓ Ready</span>
                )}
              </div>
            </FormHead>

            <FormGrid>
              <Field style={{ gridColumn: '1 / -1' }}>
                <label htmlFor="phase-name">Phase Name</label>
                <Input
                  id="phase-name"
                  value={phaseName}
                  maxLength={32}
                  disabled={loading}
                  onChange={(e) => setPhaseName(e.target.value)}
                  placeholder="e.g. Group Stage"
                />
              </Field>

              <Field>
                <label htmlFor="start-local">Start date & time</label>
                <Input
                  id="start-local"
                  type="datetime-local"
                  value={startLocal}
                  disabled={loading}
                  onChange={(e) => setStartLocal(e.target.value)}
                />
                <Help>
                  Contract value: <b>{startMs ?? '—'}</b> (Unix ms)
                </Help>
              </Field>

              <Field>
                <label htmlFor="end-local">End date & time</label>
                <Input
                  id="end-local"
                  type="datetime-local"
                  value={endLocal}
                  disabled={loading}
                  onChange={(e) => setEndLocal(e.target.value)}
                />
                <Help>
                  Contract value: <b>{endMs ?? '—'}</b> (Unix ms)
                </Help>
              </Field>

              <Field style={{ gridColumn: '1 / -1' }}>
                <label htmlFor="weight">Points Weight</label>
                <Input
                  id="weight"
                  type="number"
                  value={weight}
                  min={1}
                  max={10000}
                  disabled={loading}
                  onChange={(e) => setWeight(e.target.value.replace(/[^\d]/g, ''))}
                  placeholder="1"
                />
                <Help>Recommended: 1 (Group Stage), 2+ (Knockout).</Help>
              </Field>

              <div style={{ gridColumn: '1 / -1' }}>
                <Preview>
                  <span className="k">Preview</span>
                  <span className="v">
                    {phaseName?.trim() ? `"${phaseName.trim()}"` : '—'} • Start: {formatUnixMs(startMs)} • End:{' '}
                    {formatUnixMs(endMs)} • Weight: {weight || '—'}
                  </span>
                </Preview>
              </div>
            </FormGrid>

            <FormFoot>
              <PrimaryBtn type="submit" disabled={loading || !!validationError}>
                {loading ? <Spinner /> : null}
                {loading ? 'Registering…' : 'Register Phase'}
              </PrimaryBtn>
            </FormFoot>
          </FormCard>
        </CardBody>
      </Card>
    </Shell>
  );
};
