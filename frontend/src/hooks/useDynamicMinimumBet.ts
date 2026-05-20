import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApi } from '@gear-js/react-hooks';
import { Program, Service } from '@/hocs/lib';

const PROGRAM_ID = import.meta.env.VITE_BOLAOCOREPROGRAM as `0x${string}`;
const VARA_DECIMALS = 12n;
const PLANCK_PER_VARA = 10n ** VARA_DECIMALS;
const USD_TARGET_MICRO = 3_000_000n;

type MinimumState = {
  vara_price_usd_micro?: string | number | bigint | null;
  price_cached_at?: string | number | bigint | null;
  price_staleness_limit_ms?: string | number | bigint | null;
};

function toBigIntSafe(value: unknown): bigint {
  try {
    if (typeof value === 'bigint') return value;
    if (typeof value === 'number') return Number.isFinite(value) ? BigInt(Math.trunc(value)) : 0n;
    if (typeof value === 'string' && value.trim()) return BigInt(value);
  } catch {
    return 0n;
  }
  return 0n;
}

function ceilDiv(a: bigint, b: bigint): bigint {
  if (b <= 0n) return 0n;
  return (a + b - 1n) / b;
}

function planckToVaraNumber(planck: bigint): number {
  return Number(planck) / Number(PLANCK_PER_VARA);
}

function formatVara(planck: bigint): string {
  const value = planckToVaraNumber(planck);
  if (!Number.isFinite(value)) return '3';
  if (value >= 100) return value.toFixed(2);
  if (value >= 10) return value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
  return value.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
}

function computeMinimum(state?: MinimumState | null) {
  const price = toBigIntSafe(state?.vara_price_usd_micro);
  const cachedAt = toBigIntSafe(state?.price_cached_at);
  const stalenessLimit = toBigIntSafe(state?.price_staleness_limit_ms);
  const now = BigInt(Date.now());
  const fresh =
    price > 0n &&
    cachedAt > 0n &&
    stalenessLimit > 0n &&
    now - cachedAt <= stalenessLimit;
  const minPlanck = fresh ? ceilDiv(USD_TARGET_MICRO * PLANCK_PER_VARA, price) : 0n;

  return {
    minPlanck,
    minVara: planckToVaraNumber(minPlanck),
    minVaraText: formatVara(minPlanck + PLANCK_PER_VARA),
    isPriceFresh: fresh,
    isBettingAvailable: fresh,
    priceUsd: price > 0n ? Number(price) / 1_000_000 : 0,
  };
}

export function useDynamicMinimumBet(state?: MinimumState | null) {
  const { api, isApiReady } = useApi();
  const [remoteState, setRemoteState] = useState<MinimumState | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (state || !api || !isApiReady || !PROGRAM_ID) return;

    setIsLoading(true);
    try {
      const svc = new Service(new Program(api, PROGRAM_ID));
      const next = (await (svc as any).queryState()) as MinimumState;
      setRemoteState(next);
    } catch {
      setRemoteState(null);
    } finally {
      setIsLoading(false);
    }
  }, [api, isApiReady, state]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const minimum = useMemo(() => computeMinimum(state ?? remoteState), [remoteState, state]);

  return {
    ...minimum,
    isLoading,
    refresh,
    targetUsdText: '$3.00 USD',
    label: minimum.isBettingAvailable
      ? `${minimum.minVaraText} VARA`
      : 'Minimum unavailable until the VARA/USD price feed reconnects',
    shortLabel: minimum.isPriceFresh
      ? `Min $3 USD ≈ ${minimum.minVaraText} VARA`
      : 'Price feed reconnecting — predictions paused',
  };
}
