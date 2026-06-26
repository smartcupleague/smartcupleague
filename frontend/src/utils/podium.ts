export type PodiumStanding = {
  champion: string;
  runnerUp: string;
  thirdPlace: string;
};

export type PodiumSlotKey = keyof PodiumStanding;

export type PodiumResultRow = {
  key: PodiumSlotKey;
  medal: string;
  label: string;
  pick: string;
  result: string;
  points: number;
  hit: boolean;
};

type ChampionshipLockMatch = {
  phase?: unknown;
  kick_off?: unknown;
  kickOff?: unknown;
};

const PODIUM_SLOTS: Array<{
  key: PodiumSlotKey;
  medal: string;
  label: string;
  points: number;
}> = [
  { key: 'champion', medal: '🥇', label: 'Champion', points: 20 },
  { key: 'runnerUp', medal: '🥈', label: 'Runner-Up', points: 10 },
  { key: 'thirdPlace', medal: '🥉', label: '3rd Place', points: 5 },
];

export function normalizePodiumStanding(raw: unknown): PodiumStanding | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  const champion = typeof value.champion === 'string' ? value.champion : '';
  const runnerUp = typeof value.runner_up === 'string'
    ? value.runner_up
    : typeof value.runnerUp === 'string'
      ? value.runnerUp
      : '';
  const thirdPlace = typeof value.third_place === 'string'
    ? value.third_place
    : typeof value.thirdPlace === 'string'
      ? value.thirdPlace
      : '';

  if (!champion || !runnerUp || !thirdPlace) return null;
  return { champion, runnerUp, thirdPlace };
}

export function getPreviewPodiumPick(): PodiumStanding | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  if (params.get('previewChampionshipPick') !== '1') return null;

  return normalizePodiumStanding({
    champion: params.get('champion') || 'Argentina',
    runnerUp: params.get('runnerUp') || 'France',
    thirdPlace: params.get('thirdPlace') || 'Brazil',
  });
}

export function getPreviewPodiumResult(): PodiumStanding | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  if (params.get('previewChampionshipResult') !== '1') return null;

  return normalizePodiumStanding({
    champion: params.get('resultChampion') || params.get('champion') || 'Argentina',
    runnerUp: params.get('resultRunnerUp') || params.get('runnerUp') || 'France',
    thirdPlace: params.get('resultThirdPlace') || params.get('thirdPlace') || 'Brazil',
  });
}

export function getPodiumResultRows(
  pick: PodiumStanding,
  result: PodiumStanding
): PodiumResultRow[] {
  return PODIUM_SLOTS.map((slot) => {
    const pickedTeam = pick[slot.key];
    const resultTeam = result[slot.key];
    return {
      ...slot,
      pick: pickedTeam,
      result: resultTeam,
      hit: pickedTeam === resultTeam,
    };
  });
}

export function getPodiumEarnedPoints(rows: PodiumResultRow[]) {
  return rows.reduce((total, row) => total + (row.hit ? row.points : 0), 0);
}

export function getPodiumCorrectCount(rows: PodiumResultRow[]) {
  return rows.filter((row) => row.hit).length;
}

export function podiumTimestampToMs(value?: string | number | bigint | null) {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n < 10_000_000_000 ? n * 1000 : n;
}

export function isRoundOf32Phase(phase: unknown) {
  const normalized = String(phase ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');

  return normalized === 'round of 32' || normalized === 'last 32';
}

export function getChampionshipPickLockMs(
  explicitLock: string | number | bigint | null | undefined,
  matches?: ChampionshipLockMatch[] | null
) {
  const explicitLockMs = podiumTimestampToMs(explicitLock);
  if (explicitLockMs) return explicitLockMs;

  const r32Kickoffs = (matches ?? [])
    .filter((match) => isRoundOf32Phase(match?.phase))
    .map((match) => podiumTimestampToMs((match?.kick_off ?? match?.kickOff) as string | number | bigint | null | undefined))
    .filter((ms): ms is number => typeof ms === 'number')
    .sort((a, b) => a - b);

  return r32Kickoffs[0] ?? null;
}
