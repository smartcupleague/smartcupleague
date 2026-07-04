type PreviewBracketMatch = {
  match_id: string | number;
  phase: string;
  home: string;
  away: string;
  kick_off: number;
  result: unknown;
};

export type PreviewBracketMode = 'full' | 'r32' | 'r16-partial' | 'r32-final';

function previewKickoff(offsetDays: number) {
  return Date.now() + offsetDays * 24 * 60 * 60 * 1000;
}

function finalized(home: number, away: number, penaltyWinner: 'Home' | 'Away' | null = null) {
  return { Finalized: { score: { home, away }, penalty_winner: penaltyWinner } };
}

function winnerFromResult(teams: [string, string], result: unknown): string {
  const finalized = (result as any)?.Finalized ?? (result as any)?.finalized;
  const score = finalized?.score;
  if (!score) return teams[0];

  const home = Number(score.home ?? 0);
  const away = Number(score.away ?? 0);
  if (home > away) return teams[0];
  if (away > home) return teams[1];

  const penaltyWinner = finalized?.penalty_winner ?? null;
  return penaltyWinner === 'Away' ? teams[1] : teams[0];
}

export function normalizePreviewBracketMode(value: string | null): PreviewBracketMode | null {
  if (!value) return null;
  if (value === '1' || value === 'full') return 'full';
  if (value === 'r32' || value === 'r16-partial' || value === 'r32-final') return value;
  return null;
}

function fallbackR32Result(index: number) {
  return [
    finalized(2, 0),
    finalized(1, 2),
    finalized(1, 1, 'Home'),
    finalized(0, 2),
    finalized(3, 1),
    finalized(2, 1),
    finalized(1, 0),
    finalized(1, 2),
    finalized(2, 1),
    finalized(1, 0),
    finalized(3, 2),
    finalized(0, 1),
    finalized(2, 0),
    finalized(1, 3),
    finalized(0, 2),
    finalized(2, 1),
  ][index];
}

function buildFullPreviewWorldCupBracketMatches(): PreviewBracketMatch[] {
  const r32Teams: Array<[string, string]> = [
    ['South Africa', 'Canada'],
    ['Brazil', 'Japan'],
    ['Germany', 'Paraguay'],
    ['Netherlands', 'Morocco'],
    ['Ivory Coast', 'Norway'],
    ['France', 'Sweden'],
    ['Mexico', 'Ecuador'],
    ['England', 'Congo DR'],
    ['Belgium', 'Senegal'],
    ['United States', 'Bosnia-Herzegovina'],
    ['Spain', 'Austria'],
    ['Portugal', 'Croatia'],
    ['Switzerland', 'Algeria'],
    ['Australia', 'Egypt'],
    ['Argentina', 'Cape Verde Islands'],
    ['Colombia', 'Ghana'],
  ];

  const r32Results = r32Teams.map((_, index) => fallbackR32Result(index));
  const r32WinnerByMatchId = new Map(
    r32Teams.map((teams, index) => [73 + index, winnerFromResult(teams, r32Results[index])])
  );
  const fromFeeders = (homeFeederId: number, awayFeederId: number): [string, string] => [
    r32WinnerByMatchId.get(homeFeederId) ?? `W${homeFeederId}`,
    r32WinnerByMatchId.get(awayFeederId) ?? `W${awayFeederId}`,
  ];

  const r16Teams: Array<[string, string]> = [
    fromFeeders(75, 78),
    fromFeeders(73, 76),
    fromFeeders(84, 83),
    fromFeeders(82, 81),
    fromFeeders(74, 77),
    fromFeeders(79, 80),
    fromFeeders(87, 86),
    fromFeeders(85, 88),
  ];

  const qfTeams: Array<[string, string]> = [
    ['France', 'Netherlands'],
    ['Spain', 'United States'],
    ['Brazil', 'Argentina'],
    ['Argentina', 'Colombia'],
  ];

  const sfTeams: Array<[string, string]> = [
    ['France', 'Spain'],
    ['Brazil', 'Argentina'],
  ];

  const makeMatch = (
    matchId: number,
    phase: string,
    teams: [string, string],
    offsetDays: number,
    result: unknown = null
  ): PreviewBracketMatch => ({
    match_id: matchId,
    phase,
    home: teams[0],
    away: teams[1],
    kick_off: previewKickoff(offsetDays),
    result,
  });

  return [
    ...r32Teams.map((teams, index) =>
      makeMatch(
        73 + index,
        'ROUND_OF_32',
        teams,
        index < 8 ? -6 + index : 2 + index,
        index < 8 ? r32Results[index] : null
      )
    ),
    ...r16Teams.map((teams, index) =>
      makeMatch(
        89 + index,
        'ROUND_OF_16',
        teams,
        index < 4 ? -1 + index : 10 + index,
        index < 2 ? [finalized(2, 1), finalized(1, 3)][index] : null
      )
    ),
    ...qfTeams.map((teams, index) => makeMatch(97 + index, 'QUARTER_FINALS', teams, 18 + index)),
    ...sfTeams.map((teams, index) => makeMatch(101 + index, 'SEMI_FINALS', teams, 24 + index)),
    makeMatch(103, 'THIRD_PLACE', ['Spain', 'Brazil'], 31),
    makeMatch(104, 'FINAL', ['France', 'Argentina'], 32),
  ];
}

export function buildPreviewWorldCupBracketMatches(mode: PreviewBracketMode = 'full'): PreviewBracketMatch[] {
  const full = buildFullPreviewWorldCupBracketMatches();

  if (mode === 'r32') {
    return full.filter((match) => match.phase === 'ROUND_OF_32');
  }

  if (mode === 'r16-partial') {
    return full.filter((match) => {
      if (match.phase === 'ROUND_OF_32') return true;
      if (match.phase === 'ROUND_OF_16') return Number(match.match_id) <= 92;
      return false;
    });
  }

  if (mode === 'r32-final') {
    return full
      .filter((match) => match.phase === 'ROUND_OF_32')
      .map((match, index) => ({
        ...match,
        result: match.result ?? fallbackR32Result(index),
      }));
  }

  return full;
}
