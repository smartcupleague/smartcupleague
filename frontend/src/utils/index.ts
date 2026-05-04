const copyToClipboard = (value: string) => navigator.clipboard.writeText(value).then(() => console.log('Copied!'));

const WC_PHASES = new Set([
  'GROUP_STAGE', 'LAST_16', 'QUARTER_FINALS', 'SEMI_FINALS',
  'THIRD_PLACE', 'FINAL', 'WORLD_CUP',
]);

function isWCPhase(phase: string): boolean {
  return WC_PHASES.has((phase ?? '').toUpperCase().replace(/\s+/g, '_'));
}

function matchPath(phase: string, matchId: string | number): string {
  return isWCPhase(phase)
    ? `/2026worldcup/match/${matchId}`
    : `/leagues/match/${matchId}`;
}

export { copyToClipboard, WC_PHASES, isWCPhase, matchPath };
