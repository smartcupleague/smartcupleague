import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAccount } from '@gear-js/react-hooks';
import {
  FaArrowRightArrowLeft,
  FaBuildingColumns,
  FaCopy,
  FaCreditCard,
  FaUpRightFromSquare,
  FaWallet,
  FaXmark,
} from 'react-icons/fa6';
import { StyledWallet } from '@/components/wallet/Wallet';
import { useToast } from '@/hooks/useToast';
import './get-vara.css';

type GetVaraPlacement = 'footer' | 'floating';

type VaraBuyOption = {
  name: string;
  href: string;
  sourceHref?: string;
  label: string;
  title: string;
  body: string;
  featured?: boolean;
};

const VARA_BUY_OPTIONS: VaraBuyOption[] = [
  {
    name: 'Exolix',
    href: 'https://exolix.com/currencies/vara',
    label: 'Swap',
    title: 'Swap crypto into VARA',
    body: 'Exchange supported assets into VARA and use your connected wallet address as the destination where required.',
    featured: true,
  },
  {
    name: 'Banxa',
    href: 'https://gear.banxa.com/?coinType=VARA',
    sourceHref: 'https://vara.network/ecosystem/banxa',
    label: 'On-ramp',
    title: 'Buy with card or local payments',
    body: 'Fast fiat-to-VARA route for funding a wallet before you place real VARA predictions.',
  },
  {
    name: 'Meld',
    href: 'https://meldcrypto.com/',
    label: 'On-ramp',
    title: 'Buy with card or local payments',
    body: 'Use Meld to buy VARA using payment option supported in your region.',
  },
  {
    name: 'Coinbase',
    href: 'https://www.coinbase.com/advanced-trade/spot/VARA-USD',
    label: 'USD route',
    title: 'Buy or convert where available',
    body: 'Useful if you already use Coinbase. Availability can vary by region.',
  },
  {
    name: 'Vara Bridge',
    href: 'https://bridge.vara.network/?network=mainnet',
    label: 'Bridge',
    title: 'Move assets to Vara mainnet',
    body: 'Bridge into Vara mainnet when you already hold supported assets elsewhere.',
  },
  {
    name: 'Gate',
    href: 'https://www.gate.io/trade/VARA_USDT',
    label: 'VARA/USDT',
    title: 'Trade the spot pair',
    body: 'Use the VARA/USDT market if you already hold USDT or prefer an exchange order book.',
  },
  {
    name: 'MEXC',
    href: 'https://www.mexc.com/price/VARA',
    label: 'VARA/USDT',
    title: 'Trade the spot pair',
    body: 'Another exchange route for users who already fund with stablecoins.',
  },
  {
    name: 'Crypto.com',
    href: 'https://crypto.com/price/vara-network',
    label: 'US app',
    title: 'Buy Vara Network in app',
    body: 'A familiar app route for USD deposits, cards, and mobile-first purchases where supported.',
  },
];

function getVaraBuyIcon(option: VaraBuyOption) {
  if (option.featured || option.name === 'Vara Bridge') return <FaArrowRightArrowLeft aria-hidden="true" />;
  if (option.name === 'Coinbase') return <FaBuildingColumns aria-hidden="true" />;
  return <FaCreditCard aria-hidden="true" />;
}

function getPlacementClass(placement: GetVaraPlacement) {
  if (placement === 'footer') return 'getVara--footer';
  return 'getVara--floating';
}

export function GetVaraModal({ placement = 'floating' }: { placement?: GetVaraPlacement }) {
  const { account } = useAccount();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const address = account?.decodedAddress;

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  const handleCopyWallet = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      toast.success('Wallet address copied.');
    } catch {
      toast.error('Could not copy the wallet address.');
    }
  };

  const dialog = (
    <div className="getVara__overlay" role="dialog" aria-modal="true" aria-labelledby="get-vara-title">
      <button className="getVara__backdrop" type="button" aria-label="Close Get VARA" onClick={() => setOpen(false)} />
      <section className="getVara__panel">
        <header className="getVara__header">
          <button className="getVara__close" type="button" aria-label="Close Get VARA" onClick={() => setOpen(false)}>
            <FaXmark aria-hidden="true" />
          </button>
          <div className="getVara__eyebrowRow">
            <span className="getVara__badge getVara__badge--primary">Mainnet routes</span>
            <span className="getVara__eyebrow">Get VARA</span>
          </div>
          <h2 className="getVara__title" id="get-vara-title">Fund your SmartCup League wallet</h2>
          <p className="getVara__subtitle">
            Copy your current wallet address, then choose the provider that works in your region.
          </p>
        </header>

        <div className="getVara__body">
          <section className="getVara__addressBox">
            <div className="getVara__addressTop">
              <div>
                <h3>Current wallet address</h3>
                <p>Use this address as the destination or withdrawal address where the provider asks for it.</p>
              </div>
              {address ? (
                <button className="getVara__copyBtn" type="button" onClick={handleCopyWallet}>
                  <FaCopy aria-hidden="true" />
                  <span>Copy</span>
                </button>
              ) : (
                <div className="getVara__walletInline">
                  <StyledWallet showHeader={false} />
                </div>
              )}
            </div>

            {address ? (
              <div className="getVara__addressValue" title={address}>
                {address}
              </div>
            ) : (
              <p className="getVara__connectHint">
                Connect your wallet to copy the destination address before using a provider.
              </p>
            )}
          </section>

          <div className="getVara__options">
            {VARA_BUY_OPTIONS.map((option) => (
              <article className={'getVara__card ' + (option.featured ? 'getVara__card--featured' : '')} key={option.name}>
                <div className="getVara__cardTop">
                  <span className="getVara__icon">{getVaraBuyIcon(option)}</span>
                  <span className={'getVara__badge ' + (option.featured ? 'getVara__badge--solid' : '')}>{option.label}</span>
                </div>
                <h3>{option.name}</h3>
                <strong>{option.title}</strong>
                <p>{option.body}</p>
                <div className="getVara__actions">
                  <a className="getVara__providerBtn" href={option.href} target="_blank" rel="noreferrer">
                    <span>Open {option.name}</span>
                    <FaUpRightFromSquare aria-hidden="true" />
                  </a>
                  {option.sourceHref ? (
                    <a className="getVara__sourceLink" href={option.sourceHref} target="_blank" rel="noreferrer">
                      Vara ecosystem page
                    </a>
                  ) : null}
                </div>
              </article>
            ))}
          </div>

          <p className="getVara__disclaimer">
            Not financial advice. Provider availability, KYC, fees, limits, and withdrawal networks vary by region.
            Always verify the asset and network before sending funds.
          </p>
        </div>
      </section>
    </div>
  );

  return (
    <>
      <button
        className={'getVara__trigger ' + getPlacementClass(placement)}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        <FaWallet aria-hidden="true" />
        <span>Get VARA</span>
      </button>

      {open ? createPortal(dialog, document.body) : null}
    </>
  );
}
