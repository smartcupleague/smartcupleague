import React, { useMemo } from 'react';
import styled, { createGlobalStyle, keyframes } from 'styled-components';
import { useAccount, useBalance } from '@gear-js/react-hooks';
import { Wallet as GearWallet } from '@gear-js/wallet-connect';
import { useVaraPrice } from '@/hooks/useVaraPrice';
import { useWalletProfile } from '@/hooks/useWalletProfile';
import { ONBOARDING_CONNECT_EVENT } from '@/hooks/useOnboarding';
import { useFreebetBalance } from '@/hooks/useFreebetBalance';

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
const PREVIEW_WALLET_ADDRESS = '0x32a06f5e0a0e5b66c3bce45d3cb90a77278d048b1c71257ad22ddac2b1a8800b';

const WalletMenuViewportGuard = createGlobalStyle`
  @media (max-width: 768px) {
    [class*="Modal-module_overlay"] {
      width: 100vw !important;
      max-width: 100vw !important;
      height: 100dvh !important;
      max-height: 100dvh !important;
      padding: max(12px, env(safe-area-inset-top)) 12px max(12px, env(safe-area-inset-bottom)) !important;
      align-items: center !important;
      overflow: hidden !important;
    }

    [class*="Modal-module_modal"] {
      width: min(100%, 420px) !important;
      max-width: calc(100vw - 24px) !important;
      max-height: calc(100dvh - 24px) !important;
      display: flex !important;
      flex-direction: column !important;
      min-width: 0 !important;
    }

    [class*="Modal-module_header"],
    [class*="Modal-module_body"],
    [class*="Modal-module_footer"] {
      min-width: 0 !important;
      padding-left: 18px !important;
      padding-right: 18px !important;
    }

    [class*="Modal-module_header"] {
      flex: 0 0 auto !important;
      padding-top: 16px !important;
      padding-bottom: 16px !important;
    }

    [class*="Modal-module_heading"] {
      min-width: 0 !important;
      font-size: 20px !important;
      line-height: 1.15 !important;
      overflow-wrap: anywhere !important;
    }

    [class*="Modal-module_body"] {
      flex: 1 1 auto !important;
      max-height: none !important;
      overflow-y: auto !important;
      overscroll-behavior: contain !important;
      padding-top: 18px !important;
      padding-bottom: 18px !important;
    }

    [class*="Modal-module_footer"] {
      flex: 0 0 auto !important;
      padding-top: 14px !important;
      padding-bottom: 14px !important;
    }

    [class*="_list_142au"],
    [class*="_account_142au"],
    [class*="_footer_142au"] {
      min-width: 0 !important;
      max-width: 100% !important;
    }

    [class*="_list_142au"] {
      gap: 10px !important;
    }

    [class*="_account_142au"],
    [class*="_footer_142au"] {
      align-items: stretch !important;
      gap: 8px !important;
    }

    [class*="_account_142au"] > *,
    [class*="_footer_142au"] > * {
      min-width: 0 !important;
    }

    [class*="_account_142au"] button,
    [class*="_footer_142au"] button {
      min-height: 44px !important;
      max-width: 100% !important;
    }

    [class*="_account_142au"] button span,
    [class*="_footer_142au"] button span,
    [class*="_text_142au"] {
      min-width: 0 !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
      white-space: nowrap !important;
    }
  }
`;

function getPreviewWalletParam(name: string) {
  if (!import.meta.env.DEV || typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get(name);
}

export function getPreviewWalletAddress() {
  if (getPreviewWalletParam('previewWallet') !== '1') return null;
  return getPreviewWalletParam('previewWalletAddress') ?? PREVIEW_WALLET_ADDRESS;
}

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
  justify-content: flex-end;
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
  min-width: 0;
  max-width: min(100%, 500px);
  display: flex;
  align-items: center;
  justify-content: flex-end;

  @media (max-width: 720px) {
    flex: 1 1 auto;
    min-width: 0;
    max-width: 100%;
  }
`;

const BalanceCluster = styled.div`
  display: inline-flex;
  align-items: stretch;
  gap: 8px;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  justify-content: flex-end;

  @media (max-width: 720px) {
    width: 100%;
  }

  @media (max-width: 520px) {
    flex-direction: column;
    gap: 8px;
  }
`;


const WalletSlot = styled.div`
  flex: 0 0 190px;
  min-width: 170px;
  max-width: 210px;

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
    height: 54px;
    border-radius: 13px;
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
    font-size: clamp(11px, 0.9vw, 12.5px);
    letter-spacing: 0.08px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    padding: 0 10px;
    box-shadow:
      0 12px 34px rgba(0, 0, 0, 0.32),
      0 0 0 1px rgba(255, 255, 255, 0.035) inset;
    cursor: pointer;
    transition:
      transform 0.16s ease,
      filter 0.16s ease,
      border-color 0.16s ease,
      box-shadow 0.16s ease;
  }

  button > *,
  button span,
  button div {
    min-width: 0 !important;
  }

  button span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  button img,
  button svg {
    width: 18px !important;
    height: 18px !important;
    flex: 0 0 18px;
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
      0 14px 40px rgba(0, 0, 0, 0.34),
      0 0 0 1px rgba(255, 255, 255, 0.05) inset;
  }

  button:active {
    transform: translateY(0);
    filter: brightness(0.98);
  }

  @media (max-width: 768px) {
    button {
      min-height: 54px;
      padding: 0 12px;
      font-size: var(--mobile-body-size, 12.5px);
      letter-spacing: 0;
    }

    .walletPreviewIcon {
      flex: 0 0 auto;
    }

    .walletPreviewName {
      min-width: 0;
      max-width: 100%;
      overflow: visible;
      text-overflow: clip;
      white-space: nowrap;
    }
  }
`;

/** ===== Balance pill — columna: label arriba, cantidad + usd abajo ===== */
const BalancePill = styled.div`
  flex: 1 1 260px;
  width: auto;
  min-width: 172px;
  max-width: 300px;

  display: inline-flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;

  padding: 9px 12px;
  border-radius: 13px;

  border: 1px solid rgba(255, 255, 255, 0.14);
  background:
    radial-gradient(520px 120px at 20% 25%, rgba(255, 46, 118, 0.14), transparent 55%),
    radial-gradient(520px 120px at 85% 55%, rgba(112, 82, 255, 0.12), transparent 60%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(0, 0, 0, 0.14));
  backdrop-filter: blur(12px);

  box-shadow:
    0 14px 44px rgba(0,0,0,.32),
    0 0 0 1px rgba(255,255,255,.04) inset;

  @media (max-width: 520px) {
    flex: 0 0 auto;
    width: 100%;
    min-width: 0;
    max-width: 100%;
    min-height: 54px;
    justify-content: center;
    padding: 10px 12px;
  }
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
  width: 100%;
  min-width: 0;
`;

const DisplayName = styled.span`
  font-size: 12px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.82);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: clamp(96px, 12vw, 170px);

  @media (max-width: 768px) {
    max-width: 100%;
    overflow: visible;
    text-overflow: clip;
    font-size: 12.5px;
    line-height: 1.2;
  }
`;

/** Fila inferior: cantidad + símbolo + badge USD, todos centrados verticalmente */
const BalanceRow = styled.div`
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  max-width: 100%;
  min-width: 0;

  @media (max-width: 768px) {
    flex-wrap: wrap;
    gap: 5px 7px;
  }
`;

const AmountGold = styled.span`
  min-width: 0;
  flex: 0 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  font-size: clamp(15px, 1.45vw, 18px);
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

  @media (max-width: 768px) {
    font-size: 16px;
    letter-spacing: 0;
  }
`;

const TokenSymbol = styled.span`
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 950;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.70);
  white-space: nowrap;
  line-height: 1;

  @media (max-width: 768px) {
    letter-spacing: 0;
  }
`;

const UsdValue = styled.span`
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.01em;
  white-space: nowrap;
  line-height: 1;
  padding: 2px 7px;
  border-radius: 999px;
  border: 1px solid rgba(52, 211, 153, 0.30);
  background: rgba(52, 211, 153, 0.10);
  color: rgba(110, 255, 190, 0.95);
  text-shadow: 0 0 8px rgba(52, 211, 153, 0.30);

  @media (max-width: 1380px) {
    display: none;
  }

  @media (max-width: 768px) {
    display: inline-flex;
    align-items: center;
    max-width: 100%;
    padding: 2px 6px;
    font-size: 10px;
    letter-spacing: 0;
  }
`;

const FreebetPill = styled.div`
  flex: 0 0 158px;
  min-width: 138px;
  max-width: 170px;
  min-height: 54px;
  display: inline-flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
  padding: 9px 10px;
  border-radius: 13px;
  border: 1px solid rgba(255, 211, 106, 0.20);
  background:
    radial-gradient(420px 120px at 18% 20%, rgba(255, 211, 106, 0.16), transparent 56%),
    radial-gradient(420px 120px at 88% 55%, rgba(255, 46, 118, 0.10), transparent 60%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.055), rgba(0, 0, 0, 0.14));
  box-shadow:
    0 14px 44px rgba(0,0,0,.28),
    0 0 0 1px rgba(255,255,255,.035) inset;
  @media (max-width: 720px) {
    flex: 1 1 150px;
    max-width: none;
  }

  @media (max-width: 520px) {
    flex: 0 0 auto;
    width: 100%;
    min-width: 0;
    max-width: 100%;
    min-height: 54px;
    padding: 10px 12px;
  }
`;

const FreebetValue = styled.span`
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: clamp(13px, 1.1vw, 15px);
  font-weight: 1000;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  color: rgba(255, 236, 162, 0.98);

  @media (max-width: 768px) {
    font-size: var(--mobile-body-size, 12.5px);
    letter-spacing: 0;
  }
`;

const FreebetHint = styled.span`
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 10px;
  font-weight: 850;
  line-height: 1;
  color: rgba(255, 255, 255, 0.52);

  @media (max-width: 1380px) {
    display: none;
  }
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
  const previewWalletAddress = getPreviewWalletAddress();
  const previewWallet = !!previewWalletAddress;
  const connected = !!account || previewWallet;

  const address = account?.decodedAddress ?? previewWalletAddress ?? undefined;
  const { balance, isBalanceReady } = useBalance(account?.decodedAddress);
  const { planckToUsd, source: priceSource, updatedAt: priceUpdatedAt } = useVaraPrice();
  const { displayName } = useWalletProfile();
  const {
    balance: freebetBalance,
    error: freebetError,
    isConfigured: isFreebetConfigured,
    isLoading: isFreebetLoading,
  } = useFreebetBalance();

  const amount = useMemo(() => {
    if (previewWallet) return getPreviewWalletParam('previewWalletBalance') ?? '22,320.7689';
    if (!connected || !isBalanceReady) return null;
    return formatPlak(balance?.toString(), 4, 'es-MX');
  }, [connected, isBalanceReady, balance, previewWallet]);

  const usdLabel = useMemo(() => {
    if (previewWallet) return getPreviewWalletParam('previewWalletUsd') ?? '≈ $11.17';
    if (!connected || !isBalanceReady || !balance) return null;
    return planckToUsd(balance.toString());
  }, [connected, isBalanceReady, balance, planckToUsd, previewWallet]);

  const requestOnboarding = () => {
    window.dispatchEvent(new Event(ONBOARDING_CONNECT_EVENT));
  };

  const freebetLabel = useMemo(() => {
    if (previewWallet) return getPreviewWalletParam('previewFreebetBalance') ?? '8,500 VARA';
    if (!connected) return 'Connect wallet';
    if (!isFreebetConfigured) return 'Not configured';
    if (isFreebetLoading) return 'Loading';
    if (freebetError) return 'Unavailable';
    return `${formatPlak(freebetBalance, 2, 'es-MX') ?? '0'} VARA`;
  }, [connected, freebetBalance, freebetError, isFreebetConfigured, isFreebetLoading, previewWallet]);

  const walletDisplayName = previewWallet ? (getPreviewWalletParam('previewWalletName') ?? 'SmartPredictor_01') : displayName;

  return (
    <>
      <WalletMenuViewportGuard />
      <Row>
      {showHeader ? (
        <Left>
          {connected ? (
            <BalanceCluster>
              <BalancePill>
                <NameRow>
                  <DisplayName title={walletDisplayName ?? address}>
                    {walletDisplayName ?? <BalanceLabel>BALANCE</BalanceLabel>}
                  </DisplayName>
                </NameRow>
                <BalanceRow>
                  <AmountGold title={`${amount ?? '0'} ${tokenSymbol}`}>{amount ?? '0'}</AmountGold>
                  <TokenSymbol>{tokenSymbol}</TokenSymbol>
                  {usdLabel ? (
                    <UsdValue title={priceUpdatedAt ? `${priceSource || 'VARA/USD'} updated ${priceUpdatedAt.toLocaleString()}` : priceSource || undefined}>
                      {usdLabel}
                    </UsdValue>
                  ) : null}
                  {showStatus ? <Status $connected={connected}>●</Status> : null}
                </BalanceRow>
              </BalancePill>
              <FreebetPill aria-label="Freebet balance">
                <BalanceLabel>FREEBET</BalanceLabel>
                <FreebetValue title={freebetLabel}>{freebetLabel}</FreebetValue>
                <FreebetHint>available credits</FreebetHint>
              </FreebetPill>
            </BalanceCluster>
          ) : (
            <></>
          )}
        </Left>
      ) : null}

      <WalletSlot>
        <InlineWrap $connected={connected} onClickCapture={previewWallet ? undefined : requestOnboarding}>
          {previewWallet ? (
            <button type="button" aria-label="Preview connected wallet">
              <span className="walletPreviewIcon" aria-hidden="true">S</span>
              <span className="walletPreviewName">{walletDisplayName}</span>
            </button>
          ) : (
            <GearWallet theme="vara" displayBalance={false} />
          )}
        </InlineWrap>
      </WalletSlot>
      </Row>
    </>
  );
}
