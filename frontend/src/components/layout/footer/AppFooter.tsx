import React from 'react';
import { Link } from 'react-router-dom';
import './AppFooter.css';

interface AppFooterProps {
  className?: string;
}

export const AppFooter: React.FC<AppFooterProps> = ({ className = '' }) => {
  return (
    <footer className={'app-footer ' + className}>
      <span className="app-footer__copy">© 2026 SmartCup League</span>
      <span className="app-footer__sep" aria-hidden="true">·</span>
      <Link to="/terms-of-use" className="app-footer__link">Terms of Use</Link>
      <span className="app-footer__sep" aria-hidden="true">·</span>
      <Link to="/rules" className="app-footer__link">Rules</Link>
      <span className="app-footer__sep" aria-hidden="true">·</span>
      <Link to="/dao-constitution" className="app-footer__link">DAO Constitution</Link>
    </footer>
  );
};
