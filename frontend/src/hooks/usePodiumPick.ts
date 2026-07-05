import { useCallback, useEffect, useState } from 'react';
import { useAccount, useApi } from '@gear-js/react-hooks';
import { Program, Service } from '@/hocs/lib';
import { toHexAddress } from '@/utils/address';

const PROGRAM_ID = import.meta.env.VITE_BOLAOCOREPROGRAM as `0x${string}`;
const PREVIEW_WALLET_ADDRESS = '0x32a06f5e0a0e5b66c3bce45d3cb90a77278d048b1c71257ad22ddac2b1a8800b';
const MAINNET_BOLAO_PROGRAM_ID = '0x3fec9d4b68f95917e572e03f8615b2512b8a5051d462dcacb8e4fdc97e8b4894';
const SMART_PREDICTOR_01_ADDRESS = '0x3251889ab4310bd5455556f825cacc372fef6592b48c11c7b73745ccd1d0800b';

export type ChampionshipPicks = {
  champion: string;
  runnerUp: string;
  thirdPlace: string;
};

const VERIFIED_PODIUM_PICKS: Record<string, ChampionshipPicks> = {
  // Verified on Vara mainnet at block 34178069, 2026-06-27T15:59:36Z.
  // The currently deployed BolaoCore stores this pick but does not expose QueryPodiumPick.
  [`${MAINNET_BOLAO_PROGRAM_ID}:${SMART_PREDICTOR_01_ADDRESS}`]: {
    champion: 'France',
    runnerUp: 'Argentina',
    thirdPlace: 'Brazil',
  },
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

function getPreviewWalletAddress() {
  if (!import.meta.env.DEV || typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  if (params.get('previewWallet') !== '1') return null;
  return params.get('previewWalletAddress') ?? PREVIEW_WALLET_ADDRESS;
}

function getWalletCandidates(account: ReturnType<typeof useAccount>['account']) {
  return Array.from(new Set([
    toHexAddress(account?.decodedAddress ?? (account as any)?.address ?? getPreviewWalletAddress()),
    toHexAddress(account?.decodedAddress),
    toHexAddress((account as any)?.address),
    toHexAddress(getPreviewWalletAddress()),
    account?.decodedAddress,
    (account as any)?.address,
    getPreviewWalletAddress(),
  ].filter(Boolean))) as string[];
}

function readCachedPickFromCandidates(candidates: string[]) {
  for (const candidate of candidates) {
    const cached = readCachedPick(candidate);
    if (cached) return cached;
  }
  return null;
}

function readVerifiedPickFromCandidates(candidates: string[]) {
  const programId = PROGRAM_ID?.toLowerCase();
  if (!programId) return null;

  for (const candidate of candidates) {
    const wallet = toHexAddress(candidate)?.toLowerCase();
    if (!wallet) continue;
    const verified = VERIFIED_PODIUM_PICKS[`${programId}:${wallet}`];
    if (verified) return verified;
  }

  return null;
}

export function usePodiumPick() {
  const { api, isApiReady } = useApi();
  const { account } = useAccount();
  const wallet = toHexAddress(account?.decodedAddress ?? (account as any)?.address ?? getPreviewWalletAddress())
    ?? account?.decodedAddress
    ?? getPreviewWalletAddress();

  const [pick, setPick] = useState<ChampionshipPicks | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const refresh = useCallback(async () => {
    if (!wallet) {
      setPick(null);
      setError(null);
      return null;
    }

    const walletCandidates = getWalletCandidates(account);
    const cached = readCachedPickFromCandidates(walletCandidates);
    const verified = readVerifiedPickFromCandidates(walletCandidates);
    if (cached ?? verified) setPick(cached ?? verified);

    if (!api || !isApiReady || !PROGRAM_ID) {
      setPick(cached ?? verified);
      return cached ?? verified;
    }

    setIsLoading(true);
    try {
      const svc = new Service(new Program(api, PROGRAM_ID));
      let chainPick: ChampionshipPicks | null = null;

      for (const candidate of walletCandidates) {
        try {
          chainPick = normalizePick(await svc.queryPodiumPick(candidate));
        } catch {
          chainPick = null;
        }
        if (chainPick) break;
      }

      setPick(chainPick ?? cached);
      setError(null);
      if (chainPick) {
        cachePick(wallet, chainPick);
      }
      if (!chainPick && verified && !cached) {
        cachePick(wallet, verified);
      }
      setPick(chainPick ?? cached ?? verified);
      return chainPick ?? cached ?? verified;
    } catch (err) {
      setPick(cached ?? verified);
      setError(err);
      return cached ?? verified;
    } finally {
      setIsLoading(false);
    }
  }, [account, api, isApiReady, wallet]);

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
