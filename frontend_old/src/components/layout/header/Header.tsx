import { Wallet, WalletModal } from '@gear-js/wallet-connect';
import styles from './Header.module.scss';
import { StyledWallet } from '@/components/wallet/Wallet';

function Header() {
  return (
    <header className={styles.header}>
      <StyledWallet />
    </header>
  );
}

export { Header };
