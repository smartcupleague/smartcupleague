import { isWorldCupPhase } from './tournaments';
export { addressKey, getAddressMapValue, setAddressMapValue, toHexAddress } from './address';

const copyToClipboard = (value: string) => navigator.clipboard.writeText(value).then(() => console.log('Copied!'));

const isWCPhase = isWorldCupPhase;

function matchPath(phase: string, matchId: string | number): string {
  return isWCPhase(phase)
    ? `/2026worldcup/match/${matchId}`
    : `/leagues/match/${matchId}`;
}

export { copyToClipboard, isWCPhase, matchPath };
export {
  LEAGUES_TOURNAMENT,
  TOURNAMENT_TAB_ORDER,
  TOURNAMENTS_BY_KEY,
  WC_PHASES,
  WORLD_CUP_2026_TOURNAMENT,
  getTournamentByKey,
  getTournamentForPhase,
  isWorldCupPhase,
} from './tournaments';
export type { TournamentDefinition, TournamentKey } from './tournaments';
