import { Link } from 'react-router-dom';
import styles from './Footer.module.scss';
import { Copyright } from './copyright';
import { Socials } from './socials';

function Footer() {
  return (
    <footer className={styles.footer}>
      <Socials />
      <Copyright />
      <nav className={styles.legalLinks} aria-label="Legal links">
        <Link to="/terms-of-use" className={styles.legalLink}>Terms of Use</Link>
        <span className={styles.legalSep} aria-hidden="true">·</span>
        <Link to="/dao-constitution" className={styles.legalLink}>DAO Constitution</Link>
      </nav>
    </footer>
  );
}

export { Footer };
