import React, { useMemo, useState } from 'react';
import styled, { keyframes } from 'styled-components';
import { useAccount, useBalance } from '@gear-js/react-hooks';
import { Wallet as GearWallet } from '@gear-js/wallet-connect';
import { useVaraPrice } from '@/hooks/useVaraPrice';
import { useWalletProfile } from '@/hooks/useWalletProfile';
import { ONBOARDING_CONNECT_EVENT } from '@/hooks/useOnboarding';
import { EditProfileModal } from './EditProfileModal';

const shimmer = keyframes`
  0%   { transform: translateX(-140%) skewX(-18deg); opacity: 0; }
  18%  { opacity: .65; }
  55%  { opacity: .28; }
  100% { transform: translateX(140%) skewX(-18deg); opacity: 0; }
`;

const breathe = keyframes`
  0%, 100% { transform: translateY(0); filter: brightness(1); }
  50%      { transform: translateY(-1px); filter: brightness(1.05); }
`;

const PLAK_DECIMALS = 12n;

function getLocaleSeparators(locale: string) {
  const parts = new Intl.NumberFormat(locale).formatToParts(1000.1);
  const group = parts.find((p) => p.type === 'group')?.value ?? ',';
  const decimal = parts.find((p) => p.type === 'decimal')?.value ?? '.';
  return { group, decimal };
}

function formatBigIntLocale(n: bigint, locale: string) {
  const { group } = getLocaleSeparators(locale);
  const s = n.toString();
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const idx = s.length - i;
    out = s[idx - 1] + out;
    if (i % 3 === 2 && idx - 1 !== 0) out = group + out;
  }
  return out;
}

function formatPlak(input: string | bigint | number | undefined, maxFractionDigits = 4, locale = 'es-MX') {
  if (input === undefined || input === null) return null;
  let raw: bigint;
  try {
    raw = typeof input === 'bigint' ? input : BigInt(String(input));
  } catch {
    return null;
  }

  const negative = raw < 0n;
  const abs = negative ? -raw : raw;
  const base = 10n ** PLAK_DECIMALS;

  const whole = abs / base;
  const frac = abs % base;

  const scale = 10n ** BigInt(maxFractionDigits);
  const scaledFrac = (frac * scale) / base;

  const { decimal } = getLocaleSeparators(locale);
  const wholeStr = formatBigIntLocale(whole, locale);
  const fracStr = scaledFrac.toString().padStart(maxFractionDigits, '0').replace(/0+$/, '');

  const sign = negative ? '-' : '';
  return fracStr.length ? `${sign}${wholeStr}${decimal}${fracStr}` : `${sign}${wholeStr}`;
}

/** ===== Layout principal: balance (izq) + wallet (der) ===== */
const Row = styled.div`
  width: 100%;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;

  &,
  & * {
    box-sizing: border-box;
  }

  @media (max-width: 720px) {
    flex-direction: column;
    align-items: stretch;
  }
`;

const Left = styled.div`
  flex: 1 1 auto;
  min-width: 0; /* CRÍTICO: permite que el texto haga ellipsis y no empuje al wallet */
  display: flex;
  align-items: center;
`;


const WalletSlot = styled.div`
  flex: 0 0 clamp(220px, 28vw, 340px);
  min-width: 220px;
  max-width: 360px;

  @media (max-width: 720px) {
    flex: 1 1 auto;
    min-width: 0;
    max-width: 100%;
  }
`;

/** Wrapper para estilizar el botón interno de GearWallet */
const InlineWrap = styled.div<{ $connected?: boolean }>`
  width: 100%;
  min-width: 0;

  /* Asegura que el GearWallet y wrappers usen todo el ancho del slot */
  > div,
  > div > div {
    width: 100%;
    min-width: 0;
  }

  div {
    background: transparent;
  }

  button {
    width: 100% !important;
    min-width: 0 !important;
    height: 46px;
    border-radius: 16px;
    position: relative;
    overflow: hidden;
    border: 1px solid ${({ $connected }) => ($connected ? 'rgba(255, 46, 118, .42)' : 'rgba(255,255,255,.14)')};
    background:
      radial-gradient(820px 220px at 18% 8%, rgba(255, 46, 118, 0.24), transparent 60%),
      radial-gradient(680px 200px at 85% 30%, rgba(112, 82, 255, 0.14), transparent 65%),
      linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(0, 0, 0, 0.16));
    backdrop-filter: blur(12px);
    color: rgba(255, 255, 255, 0.96);
    -webkit-text-fill-color: rgba(255, 255, 255, 0.96);
    font-weight: 950;
    font-size: 13px;
    letter-spacing: 0.22px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 0 14px 0 14px; /* ✅ mínimo: evita “comer” espacio con icon padding */
    box-shadow:
      0 14px 40px rgba(0, 0, 0, 0.34),
      0 0 0 1px rgba(255, 255, 255, 0.035) inset;
    cursor: pointer;
    transition:
      transform 0.16s ease,
      filter 0.16s ease,
      border-color 0.16s ease,
      box-shadow 0.16s ease;
  }

  button::after {
    content: '';
    position: absolute;
    top: -70%;
    left: -40%;
    width: 70%;
    height: 260%;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.22), transparent);
    transform: translateX(-140%) skewX(-18deg);
    opacity: 0;
    pointer-events: none;
  }

  button:hover::after {
    animation: ${shimmer} 2.1s ease-in-out infinite;
  }

  button:hover {
    transform: translateY(-1px);
    filter: brightness(1.03);
    border-color: ${({ $connected }) => ($connected ? 'rgba(255, 46, 118, .62)' : 'rgba(255,255,255,.20)')};
    box-shadow:
      0 18px 56px rgba(0, 0, 0, 0.38),
      0 0 0 1px rgba(255, 255, 255, 0.05) inset;
  }

  button:active {
    transform: translateY(0);
    filter: brightness(0.98);
  }
`;

/** ===== Balance pill — columna: label arriba, cantidad + usd abajo ===== */
const BalancePill = styled.div`
  flex: 1 1 auto;
  min-width: 0;
  max-width: 100%;

  display: inline-flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;

  padding: 9px 14px;
  border-radius: 14px;

  border: 1px solid rgba(255, 255, 255, 0.14);
  background:
    radial-gradient(520px 120px at 20% 25%, rgba(255, 46, 118, 0.14), transparent 55%),
    radial-gradient(520px 120px at 85% 55%, rgba(112, 82, 255, 0.12), transparent 60%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(0, 0, 0, 0.14));
  backdrop-filter: blur(12px);

  box-shadow:
    0 14px 44px rgba(0,0,0,.32),
    0 0 0 1px rgba(255,255,255,.04) inset;
`;

const BalanceLabel = styled.div`
  font-size: 10px;
  font-weight: 950;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.50);
  white-space: nowrap;
  line-height: 1;
`;

const NameRow = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
`;

const DisplayName = styled.span`
  font-size: 12px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.82);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 140px;
`;

const EditBtn = styled.button`
  flex-shrink: 0;
  background: none;
  border: none;
  padding: 2px 4px;
  cursor: pointer;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.38);
  line-height: 1;
  border-radius: 6px;
  transition: color 0.14s, background 0.14s;

  &:hover {
    color: rgba(255, 46, 118, 0.90);
    background: rgba(255, 46, 118, 0.10);
  }
`;

/** Fila inferior: cantidad + símbolo + badge USD, todos centrados verticalmente */
const BalanceRow = styled.div`
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
`;

const AmountGold = styled.span`
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  font-size: clamp(15px, 2.2vw, 19px);
  font-weight: 1000;
  letter-spacing: 0.2px;
  line-height: 1;

  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum' 1;

  background: linear-gradient(
    90deg,
    #fff6bf 0%,
    #ffd36a 22%,
    #f5c542 45%,
    #d6a21e 62%,
    #fff1b0 82%,
    #ffffff 100%
  );
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
`;

const TokenSymbol = styled.span`
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 950;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.70);
  white-space: nowrap;
  line-height: 1;
`;

const UsdValue = styled.span`
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.01em;
  white-space: nowrap;
  line-height: 1;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid rgba(52, 211, 153, 0.30);
  background: rgba(52, 211, 153, 0.10);
  color: rgba(110, 255, 190, 0.95);
  text-shadow: 0 0 8px rgba(52, 211, 153, 0.30);
`;

const Status = styled.div<{ $connected?: boolean }>`
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  padding: 3px 6px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 950;
  white-space: nowrap;

  border: 1px solid ${({ $connected }) => ($connected ? 'rgba(65, 214, 114, .34)' : 'rgba(255,255,255,.14)')};
  background: ${({ $connected }) => ($connected ? 'rgba(65, 214, 114, 0.12)' : 'rgba(0,0,0,0.10)')};
  color: ${({ $connected }) => ($connected ? 'rgba(210, 255, 225, 0.95)' : 'rgba(255,255,255,0.86)')};

  box-shadow: 0 10px 26px rgba(0, 0, 0, 0.18);
  animation: ${({ $connected }) => ($connected ? breathe : 'none')} 3.2s ease-in-out infinite;
`;

/** ===== Props ===== */
type StyledWalletProps = {
  showHeader?: boolean;
  tokenSymbol?: string;
  showStatus?: boolean;
};

export function StyledWallet({ showHeader = true, tokenSymbol = 'VARA', showStatus = false }: StyledWalletProps) {
  const { account } = useAccount();
  const connected = !!account;

  const address = connected ? account!.decodedAddress : undefined;
  const { balance, isBalanceReady } = useBalance(address);
  const { planckToUsd } = useVaraPrice();
  const { displayName, isSaving, save } = useWalletProfile();
  const [showEdit, setShowEdit] = useState(false);

  const amount = useMemo(() => {
    if (!connected || !isBalanceReady) return null;
    return formatPlak(balance?.toString(), 4, 'es-MX');
  }, [connected, isBalanceReady, balance]);

  const usdLabel = useMemo(() => {
    if (!connected || !isBalanceReady || !balance) return null;
    return planckToUsd(balance.toString());
  }, [connected, isBalanceReady, balance, planckToUsd]);

  const handleSave = async (name: string) => {
    const ok = await save(name);
    if (ok) setShowEdit(false);
  };

  const requestOnboarding = () => {
    window.dispatchEvent(new Event(ONBOARDING_CONNECT_EVENT));
  };

  return (
    <>
      <Row>
        {showHeader ? (
          <Left>
            {connected ? (
              <BalancePill>
                <NameRow>
                  <DisplayName title={displayName ?? address}>
                    {displayName ?? <BalanceLabel>BALANCE</BalanceLabel>}
                  </DisplayName>
                  <EditBtn
                    type="button"
                    title={displayName ? 'Edit display name' : 'Set display name'}
                    onClick={() => setShowEdit(true)}>
                    ✏
                  </EditBtn>
                </NameRow>
                <BalanceRow>
                  <AmountGold title={`${amount ?? '0'} ${tokenSymbol}`}>{amount ?? '0'}</AmountGold>
                  <TokenSymbol>{tokenSymbol}</TokenSymbol>
                  {usdLabel ? <UsdValue>{usdLabel}</UsdValue> : null}
                  {showStatus ? <Status $connected={connected}>●</Status> : null}
                </BalanceRow>
              </BalancePill>
            ) : (
              <></>
            )}
          </Left>
        ) : null}

        <WalletSlot>
          <InlineWrap $connected={connected} onClickCapture={requestOnboarding}>
            <GearWallet theme="vara" displayBalance={false} />
          </InlineWrap>
        </WalletSlot>
      </Row>

      {showEdit && (
        <EditProfileModal
          current={displayName}
          isSaving={isSaving}
          onSave={handleSave}
          onClose={() => setShowEdit(false)}
        />
      )}
    </>
  );
}
