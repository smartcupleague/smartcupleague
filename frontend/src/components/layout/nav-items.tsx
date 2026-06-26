import type { ReactNode } from 'react';
import {
  PiCalendarDotsBold,
  PiChartLineUpBold,
  PiRankingBold,
  PiTargetBold,
  PiTrophyBold,
} from 'react-icons/pi';

export type AppNavKey =
  | 'progress'
  | 'my-predictions'
  | 'championship-pick'
  | 'leaderboard'
  | 'all-matches';

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
    key: 'championship-pick',
    label: 'Championship Picks',
    shortLabel: 'Champs',
    path: '/championship-pick',
    icon: <PiTrophyBold className="scb-icon" aria-hidden="true" />,
  },
  {
    key: 'leaderboard',
    label: 'Leaderboard',
    shortLabel: 'Leaders',
    path: '/leaderboard',
    icon: <PiRankingBold className="scb-icon" aria-hidden="true" />,
  },
  {
    key: 'progress',
    label: 'My Progress',
    shortLabel: 'Prog',
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
  return pathname.startsWith(item.path);
}
