/**
 * useVaraPrice — fetches live VARA/USD rate.
 *
 * Priority:
 *  1. SmartCup backend  (VITE_API_URL/api/v1/prices/vara)
 *  2. CoinGecko direct  (fallback when backend is unavailable)
 *
 * Refreshes every 5 minutes. Returns empty strings while loading so the
 * UI stays clean with no flash of "$0.00".
 */
import { useEffect, useRef, useState } from 'react';
import { planckToUsdString, varaToUsdString } from '@/utils/formatters';
import { API_BASE_URL } from '@/utils/api';

const ENDPOINT  = `${API_BASE_URL}/api/v1/prices/vara`;
const REFRESH_MS = 5 * 60 * 1000;
const EMPTY_RETRY_MS = 15 * 1000;
const STORAGE_KEY = 'smartcup:vara-usd-rate';

// CoinGecko public free-tier — used only when the backend is unreachable
const CG_URL =
  'https://api.coingecko.com/api/v3/simple/price?ids=vara-network&vs_currencies=usd&include_last_updated_at=true';

interface VaraPriceAPIResponse {
  token: string;
  usd: number;
  source: string;
  fetched_at: string;
  cache_ttl_seconds: number;
}

function readCachedRate(): { rate: number; source: string; updatedAt: Date } | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { rate?: unknown; source?: unknown; updatedAt?: unknown };
    const rate = typeof parsed.rate === 'number' ? parsed.rate : Number(parsed.rate);
    const updatedAt = new Date(String(parsed.updatedAt ?? ''));
    if (!Number.isFinite(rate) || rate <= 0 || !Number.isFinite(updatedAt.getTime())) return null;
    return {
      rate,
      source: typeof parsed.source === 'string' ? parsed.source : 'Cached price',
      updatedAt,
    };
  } catch {
    return null;
  }
}

function writeCachedRate(rate: number, source: string, updatedAt: Date) {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ rate, source, updatedAt: updatedAt.toISOString() }),
    );
  } catch { /* localStorage unavailable */ }
}

export function useVaraPrice() {
  const cached = readCachedRate();
  const [rate, setRate]       = useState<number>(cached?.rate ?? 0);
  const [loading, setLoading] = useState(!cached);
  const [source, setSource] = useState<string>(cached?.source ?? '');
  const [updatedAt, setUpdatedAt] = useState<Date | null>(cached?.updatedAt ?? null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emptyRetryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyRate = (nextRate: number, nextSource: string, nextUpdatedAt: Date) => {
    setRate(nextRate);
    setSource(nextSource);
    setUpdatedAt(nextUpdatedAt);
    setLoading(false);
    writeCachedRate(nextRate, nextSource, nextUpdatedAt);
  };

  const fetchPrice = async () => {
    // ── 1. Try SmartCup backend ──────────────────────────────────────────
    try {
      const res = await fetch(ENDPOINT, { signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        const data: VaraPriceAPIResponse = await res.json();
        if (typeof data.usd === 'number' && data.usd > 0) {
          const fetchedAt = new Date(data.fetched_at);
          const ttlMs = Math.max(0, Number(data.cache_ttl_seconds ?? 0)) * 1000;
          const isFresh = Number.isFinite(fetchedAt.getTime()) && Date.now() - fetchedAt.getTime() <= ttlMs;

          if (data.source !== 'database' || isFresh) {
            applyRate(data.usd, `SmartCup API (${data.source})`, fetchedAt);
            return;
          }
        }
      }
    } catch { /* backend unavailable — fall through */ }

    // ── 2. Fallback: CoinGecko direct ────────────────────────────────────
    try {
      const res = await fetch(CG_URL, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const data = await res.json();
        const usd = data?.['vara-network']?.usd;
        const lastUpdatedAt = data?.['vara-network']?.last_updated_at;
        if (typeof usd === 'number' && usd > 0) {
          applyRate(
            usd,
            'CoinGecko',
            typeof lastUpdatedAt === 'number'
              ? new Date(lastUpdatedAt * 1000)
              : new Date(),
          );
          return;
        }
      }
    } catch { /* silently keep last known rate */ }

    setLoading(false);
  };

  useEffect(() => {
    void fetchPrice();
    timerRef.current = setInterval(() => void fetchPrice(), REFRESH_MS);
    emptyRetryRef.current = setInterval(() => {
      setRate((currentRate) => {
        if (currentRate <= 0) void fetchPrice();
        return currentRate;
      });
    }, EMPTY_RETRY_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (emptyRetryRef.current) clearInterval(emptyRetryRef.current);
    };
  }, []);

  return {
    rate,
    loading,
    source,
    updatedAt,
    varaToUsd:  (vara: number)                      => varaToUsdString(vara, rate),
    planckToUsd: (planck: bigint | string | number)  => planckToUsdString(planck, rate),
  };
}
