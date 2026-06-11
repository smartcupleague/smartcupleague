import { useCallback, useEffect, useState } from 'react';
import { useAccount } from '@gear-js/react-hooks';
import { toHexAddress } from '@/utils/address';

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || 'https://smartcupleague-api.onrender.com';

export function useWalletProfile() {
  const { account } = useAccount();
  const walletHex = toHexAddress(account?.decodedAddress ?? (account as any)?.address ?? null);

  const [displayName, setDisplayName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!walletHex) { setDisplayName(null); return; }
    setIsLoading(true);
    fetch(`${API_BASE}/api/v1/profiles/${walletHex}`, { signal: AbortSignal.timeout(4000) })
      .then((r) => r.json())
      .then((d) => setDisplayName(d.display_name ?? null))
      .catch(() => setDisplayName(null))
      .finally(() => setIsLoading(false));
  }, [walletHex]);

  const save = useCallback(async (name: string): Promise<boolean> => {
    if (!walletHex) return false;
    setIsSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/profiles/${walletHex}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_name: name.trim() }),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok && res.status !== 409) return false;
      if (res.status === 409) return true;
      const data = await res.json();
      setDisplayName(data.display_name ?? null);
      return true;
    } catch {
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [walletHex]);

  return { displayName, isLoading, isSaving, save, walletHex };
}
