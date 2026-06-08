import { Link } from 'react-router-dom';
import { PiGiftBold } from 'react-icons/pi';
import { useFreebetBalance } from '@/hooks/useFreebetBalance';
import { formatVaraCompact } from '@/utils/formatters';
import './freebet-balance-pill.css';

type Props = {
  compact?: boolean;
};

export function FreebetBalancePill({ compact = false }: Props) {
  const { balance, error, isConfigured, isLoading, wallet } = useFreebetBalance();
  const label = !wallet
    ? 'Connect wallet'
    : !isConfigured
      ? 'Not configured'
      : isLoading
        ? 'Loading'
        : error
          ? 'Unavailable'
          : `${formatVaraCompact(balance)} VARA`;

  return (
    <Link className={compact ? 'fb-pill fb-pill--compact' : 'fb-pill'} to="/rewards" aria-label="Open rewards">
      <span className="fb-pill__icon" aria-hidden="true">
        <PiGiftBold />
      </span>
      <span className="fb-pill__text">
        <span className="fb-pill__label">Freebet</span>
        <span className="fb-pill__value">{label}</span>
      </span>
    </Link>
  );
}
