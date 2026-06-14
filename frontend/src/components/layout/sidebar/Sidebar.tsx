import React from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { FaInstagram, FaTelegram, FaXTwitter } from 'react-icons/fa6';
import { appNavItems, AppNavItem, isAppNavItemActive } from '@/components/layout/nav-items';
import './scb-dashboard.css';

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

export const Sidebar: React.FC = () => {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  // Also highlight /home as /progress (backwards compat)
  function isActive(item: AppNavItem) {
    return isAppNavItemActive(pathname, item);
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
        {appNavItems.map((item) => (
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
