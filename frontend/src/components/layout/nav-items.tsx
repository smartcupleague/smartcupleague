import type { ReactNode } from 'react';
import {
  PiCalendarDotsBold,
  PiChartLineUpBold,
  PiGiftBold,
  PiRankingBold,
  PiTargetBold,
} from 'react-icons/pi';

export type AppNavKey = 'progress' | 'my-predictions' | 'leaderboard' | 'all-matches' | 'rewards';

export interface AppNavItem {
  key: AppNavKey;
  label: string;
  shortLabel: string;
  path: string;
  icon: ReactNode;
}

export const appNavItems: AppNavItem[] = [
  {
    key: 'all-matches',
    label: 'All Matches',
    shortLabel: 'Matches',
    path: '/all-matches',
    icon: <PiCalendarDotsBold className="scb-icon" aria-hidden="true" />,
  },
  {
    key: 'my-predictions',
    label: 'My Predictions',
    shortLabel: 'Picks',
    path: '/my-predictions',
    icon: <PiTargetBold className="scb-icon" aria-hidden="true" />,
  },
  {
    key: 'leaderboard',
    label: 'Leaderboard',
    shortLabel: 'Leaders',
    path: '/leaderboard',
    icon: <PiRankingBold className="scb-icon" aria-hidden="true" />,
  },
  {
    key: 'rewards',
    label: 'Rewards',
    shortLabel: 'Rewards',
    path: '/rewards',
    icon: <PiGiftBold className="scb-icon" aria-hidden="true" />,
  },
  {
    key: 'progress',
    label: 'My Progress',
    shortLabel: 'Progress',
    path: '/progress',
    icon: <PiChartLineUpBold className="scb-icon" aria-hidden="true" />,
  },
];

export function isAppNavItemActive(pathname: string, item: AppNavItem) {
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
