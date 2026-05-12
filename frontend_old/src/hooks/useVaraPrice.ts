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

const API_BASE  = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000';
const ENDPOINT  = `${API_BASE}/api/v1/prices/vara`;
const REFRESH_MS = 5 * 60 * 1000;

// CoinGecko public free-tier — used only when the backend is unreachable
const CG_URL =
  'https://api.coingecko.com/api/v3/simple/price?ids=vara-network&vs_currencies=usd';

interface VaraPriceAPIResponse {
  token: string;
  usd: number;
  source: string;
  fetched_at: string;
  cache_ttl_seconds: number;
}

export function useVaraPrice() {
  const [rate, setRate]       = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchPrice = async () => {
    // ── 1. Try SmartCup backend ──────────────────────────────────────────
    try {
      const res = await fetch(ENDPOINT, { signal: AbortSignal.timeout(4000) });
      if (res.ok) {
        const data: VaraPriceAPIResponse = await res.json();
        if (typeof data.usd === 'number' && data.usd > 0) {
          setRate(data.usd);
          setLoading(false);
          return;
        }
      }
    } catch { /* backend unavailable — fall through */ }

    // ── 2. Fallback: CoinGecko direct ────────────────────────────────────
    try {
      const res = await fetch(CG_URL, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const data = await res.json();
        const usd = data?.['vara-network']?.usd;
        if (typeof usd === 'number' && usd > 0) {
          setRate(usd);
        }
      }
    } catch { /* silently keep last known rate */ }

    setLoading(false);
  };

  useEffect(() => {
    void fetchPrice();
    timerRef.current = setInterval(() => void fetchPrice(), REFRESH_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  return {
    rate,
    loading,
    varaToUsd:  (vara: number)                      => varaToUsdString(vara, rate),
    planckToUsd: (planck: bigint | string | number)  => planckToUsdString(planck, rate),
  };
}
