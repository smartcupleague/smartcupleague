export type TournamentKey = 'leagues' | 'worldcup';

export type TournamentDefinition = {
  key: TournamentKey;
  label: string;
  sectionLabel: string;
  emptyLabel: string;
  statusLabel: string;
  icon: string;
};

export const LEAGUES_TOURNAMENT: TournamentDefinition = {
  key: 'leagues',
  label: 'Leagues',
  sectionLabel: 'Leagues',
  emptyLabel: 'Current season matches',
  statusLabel: 'On-chain',
  icon: '⚽',
};

export const WORLD_CUP_2026_TOURNAMENT: TournamentDefinition = {
  key: 'worldcup',
  label: 'World Cup 2026',
  sectionLabel: 'World Cup 2026',
  emptyLabel: 'All phases',
  statusLabel: 'On-chain',
  icon: '🏆',
};

export const TOURNAMENTS_BY_KEY: Record<TournamentKey, TournamentDefinition> = {
  leagues: LEAGUES_TOURNAMENT,
  worldcup: WORLD_CUP_2026_TOURNAMENT,
};

export const TOURNAMENT_TAB_ORDER = [
  LEAGUES_TOURNAMENT,
  WORLD_CUP_2026_TOURNAMENT,
] as const;

export const ACTIVE_TOURNAMENTS = [
  WORLD_CUP_2026_TOURNAMENT,
] as const;

export const WC_PHASES = new Set([
  'GROUP_STAGE',
  'ROUND_OF_32',
  'LAST_32',
  'ROUND_OF_16',
  'LAST_16',
  'QUARTER_FINALS',
  'QUARTER_FINAL',
  'SEMI_FINALS',
  'SEMI_FINAL',
  'THIRD_PLACE',
  'FINAL',
  'WORLD_CUP',
  'KNOCKOUT',
]);

function normalizePhase(phase: string): string {
  return (phase ?? '').trim().toUpperCase().replace(/[-\s]+/g, '_');
}

export function isWorldCupPhase(phase: string): boolean {
  const normalized = normalizePhase(phase);
  return WC_PHASES.has(normalized)
    || normalized.includes('GROUP')
    || normalized.includes('ROUND')
    || normalized.includes('QUARTER')
    || normalized.includes('SEMI')
    || normalized.includes('FINAL')
    || normalized.includes('KNOCKOUT');
}

export function getTournamentForPhase(phase: string): TournamentDefinition {
  return isWorldCupPhase(phase) ? WORLD_CUP_2026_TOURNAMENT : LEAGUES_TOURNAMENT;
}

export function getTournamentByKey(key: TournamentKey): TournamentDefinition {
  return TOURNAMENTS_BY_KEY[key] ?? LEAGUES_TOURNAMENT;
}
