import type { CSSProperties } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { appNavItems, isAppNavItemActive } from '@/components/layout/nav-items';
import './mobile-tab-bar.css';

export function MobileTabBar() {
  const { pathname } = useLocation();

  return (
    <nav
      className="scb-mobile-tabbar"
      aria-label="Primary app navigation"
      style={{ '--mobile-tab-count': appNavItems.length } as CSSProperties}>
      {appNavItems.map((item) => (
        <NavLink
          key={item.key}
          to={item.path}
          aria-label={item.label}
          className={'scb-mobile-tabbar__item ' + (isAppNavItemActive(pathname, item) ? 'scb-mobile-tabbar__item--active' : '')}>
          {item.icon}
          <span>{item.shortLabel}</span>
        </NavLink>
      ))}
    </nav>
  );
}
