import React from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import './scb-dashboard.css';

type SectionKey = 'progress' | 'my-predictions' | 'leaderboard' | 'all-matches' | 'dao' | 'admin-fixtures';

interface NavItem {
  key: SectionKey;
  label: string;
  path: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  {
    key: 'all-matches',
    label: 'All Matches',
    path: '/all-matches',
    icon: <span className="scb-icon">⚽</span>,
  },
  {
    key: 'my-predictions',
    label: 'My Predictions',
    path: '/my-predictions',
    icon: <span className="scb-icon">🎯</span>,
  },
  {
    key: 'leaderboard',
    label: 'Leaderboard',
    path: '/leaderboard',
    icon: <span className="scb-icon">🏅</span>,
  },
  {
    key: 'progress',
    label: 'My Progress',
    path: '/progress',
    icon: <span className="scb-icon">🏆</span>,
  },
  {
    key: 'dao',
    label: 'DAO',
    path: '/dao',
    icon: <span className="scb-icon">🏛️</span>,
  },
];

export const Sidebar: React.FC = () => {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  // Also highlight /home as /progress (backwards compat)
  function isActive(item: NavItem) {
    if (item.key === 'progress') {
      return pathname.startsWith('/progress') || pathname.startsWith('/home');
    }
    if (item.key === 'all-matches') {
      return pathname.startsWith('/all-matches') || pathname.startsWith('/all-predictions');
    }
    if (item.key === 'leaderboard') {
      return pathname.startsWith('/leaderboard');
    }
    return pathname.startsWith(item.path);
  }

  return (
    <aside className="scb-sidebar">
      <div
        className="logo-small"
        style={{ cursor: 'pointer' }}
        onClick={() => navigate('/progress')}
        role="link"
        aria-label="Go to My Progress">
        <img className="logo-small" src="./Logos.png" alt="SmartCup League" />
      </div>
      <div className="scb-sidebar__brand" />

      <nav className="scb-sidebar__nav">
        {navItems.map((item) => (
          <NavLink
            key={item.key}
            to={item.path}
            className={'scb-sidebar__item ' + (isActive(item) ? 'scb-sidebar__item--active' : '')}>
            {item.icon}
            <span className="scb-sidebar__label">{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
};
