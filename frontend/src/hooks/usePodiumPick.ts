import { useCallback, useEffect, useState } from 'react';
import { useAccount, useApi } from '@gear-js/react-hooks';
import { Program, Service } from '@/hocs/lib';

const PROGRAM_ID = import.meta.env.VITE_BOLAOCOREPROGRAM as `0x${string}`;

export type ChampionshipPicks = {
  champion: string;
  runnerUp: string;
  thirdPlace: string;
};

type ChainPodiumPick = {
  champion?: string;
  runner_up?: string;
  runnerUp?: string;
  third_place?: string;
  thirdPlace?: string;
};

export function podiumSubmittedStorageKey(wallet?: string) {
  return wallet ? `smartcup:podium-pick-submitted:${wallet}` : '';
}

export function podiumPicksStorageKey(wallet?: string) {
  return wallet ? `smartcup:podium-pick-values:${wallet}` : '';
}

function normalizePick(raw: ChainPodiumPick | null | undefined): ChampionshipPicks | null {
  if (!raw) return null;
  const champion = typeof raw.champion === 'string' ? raw.champion : '';
  const runnerUp = typeof raw.runner_up === 'string' ? raw.runner_up : typeof raw.runnerUp === 'string' ? raw.runnerUp : '';
  const thirdPlace = typeof raw.third_place === 'string' ? raw.third_place : typeof raw.thirdPlace === 'string' ? raw.thirdPlace : '';
  if (!champion || !runnerUp || !thirdPlace) return null;
  return { champion, runnerUp, thirdPlace };
}

function readCachedPick(wallet?: string): ChampionshipPicks | null {
  const picksKey = podiumPicksStorageKey(wallet);
  if (!picksKey) return null;

  try {
    return normalizePick(JSON.parse(window.localStorage.getItem(picksKey) ?? 'null'));
  } catch {
    return null;
  }
}

function cachePick(wallet: string, pick: ChampionshipPicks) {
  const submittedKey = podiumSubmittedStorageKey(wallet);
  const picksKey = podiumPicksStorageKey(wallet);

  try {
    if (submittedKey) window.localStorage.setItem(submittedKey, 'true');
    if (picksKey) window.localStorage.setItem(picksKey, JSON.stringify(pick));
  } catch {
    // Local cache is best-effort; chain state remains authoritative.
  }
}

function clearCachedPick(wallet: string) {
  const submittedKey = podiumSubmittedStorageKey(wallet);
  const picksKey = podiumPicksStorageKey(wallet);

  try {
    if (submittedKey) window.localStorage.removeItem(submittedKey);
    if (picksKey) window.localStorage.removeItem(picksKey);
  } catch {
    // Local cache is best-effort; chain state remains authoritative.
  }
}

export function usePodiumPick() {
  const { api, isApiReady } = useApi();
  const { account } = useAccount();
  const wallet = account?.decodedAddress;

  const [pick, setPick] = useState<ChampionshipPicks | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const refresh = useCallback(async () => {
    if (!wallet) {
      setPick(null);
      setError(null);
      return null;
    }

    const cached = readCachedPick(wallet);
    if (cached) setPick(cached);

    if (!api || !isApiReady || !PROGRAM_ID) {
      setPick(cached);
      return cached;
    }

    setIsLoading(true);
    try {
      const svc = new Service(new Program(api, PROGRAM_ID));
      const chainPick = normalizePick(await svc.queryPodiumPick(wallet));
      setPick(chainPick);
      setError(null);
      if (chainPick) {
        cachePick(wallet, chainPick);
      } else {
        clearCachedPick(wallet);
      }
      return chainPick;
    } catch (err) {
      setPick(cached);
      setError(err);
      return cached;
    } finally {
      setIsLoading(false);
    }
  }, [api, isApiReady, wallet]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    pick,
    submitted: !!pick,
    isLoading,
    error,
    refresh,
    cachePick: (nextPick: ChampionshipPicks) => {
      if (wallet) cachePick(wallet, nextPick);
      setPick(nextPick);
    },
  };
}
