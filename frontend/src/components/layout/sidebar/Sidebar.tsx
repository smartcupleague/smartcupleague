import React from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { FaInstagram, FaTelegram, FaXTwitter } from 'react-icons/fa6';
import {
  PiCalendarDotsBold,
  PiChartLineUpBold,
  PiGiftBold,
  PiRankingBold,
  PiTargetBold,
} from 'react-icons/pi';
import './scb-dashboard.css';

type SectionKey = 'progress' | 'my-predictions' | 'leaderboard' | 'all-matches' | 'rewards' | 'admin-fixtures';

interface NavItem {
  key: SectionKey;
  label: string;
  path: string;
  icon: React.ReactNode;
}


const socialLinks = [
  {
    label: 'X',
    href: 'https://x.com/smartcupleague',
    icon: <FaXTwitter aria-hidden="true" />,
  },
  {
    label: 'Instagram',
    href: 'https://instagram.com/smartcupleague',
    icon: <FaInstagram aria-hidden="true" />,
  },
  {
    label: 'Telegram',
    href: 'https://t.me/smartcupcommunity',
    icon: <FaTelegram aria-hidden="true" />,
  },
];

const navItems: NavItem[] = [
  {
    key: 'all-matches',
    label: 'All Matches',
    path: '/all-matches',
    icon: <PiCalendarDotsBold className="scb-icon" aria-hidden="true" />,
  },
  {
    key: 'my-predictions',
    label: 'My Predictions',
    path: '/my-predictions',
    icon: <PiTargetBold className="scb-icon" aria-hidden="true" />,
  },
  {
    key: 'leaderboard',
    label: 'Leaderboard',
    path: '/leaderboard',
    icon: <PiRankingBold className="scb-icon" aria-hidden="true" />,
  },
  {
    key: 'rewards',
    label: 'Rewards',
    path: '/rewards',
    icon: <PiGiftBold className="scb-icon" aria-hidden="true" />,
  },
  {
    key: 'progress',
    label: 'My Progress',
    path: '/progress',
    icon: <PiChartLineUpBold className="scb-icon" aria-hidden="true" />,
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
    if (item.key === 'rewards') {
      return pathname.startsWith('/rewards');
    }
    return pathname.startsWith(item.path);
  }

  return (
    <aside className="scb-sidebar">
      <div
        className="logo-small"
        style={{ cursor: 'pointer' }}
        onClick={() => navigate('/')}
        role="link"
        aria-label="Go to homepage">
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

      <div className="scb-sidebar__bottom" aria-label="SmartCup League social links">
        <div className="scb-sidebar__socials">
          {socialLinks.map((item) => (
            <a
              key={item.href}
              className="scb-sidebar__social"
              href={item.href}
              target="_blank"
              rel="noreferrer"
              aria-label={item.label}>
              {item.icon}
            </a>
          ))}
        </div>
      </div>
    </aside>
  );
};
