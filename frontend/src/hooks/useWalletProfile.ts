import { useCallback, useEffect, useState } from 'react';
import { useAccount } from '@gear-js/react-hooks';
import { decodeAddress } from '@polkadot/util-crypto';
import { u8aToHex } from '@polkadot/util';

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000';

function toHex(addr?: string | null): string | null {
  if (!addr) return null;
  const t = addr.trim();
  if (!t) return null;
  if (t.startsWith('0x')) return t.toLowerCase();
  try {
    return u8aToHex(decodeAddress(t)).toLowerCase();
  } catch {
    return null;
  }
}

export function useWalletProfile() {
  const { account } = useAccount();
  const walletHex = toHex(account?.decodedAddress ?? (account as any)?.address ?? null);

  const [displayName, setDisplayName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!walletHex) { setDisplayName(null); return; }
    setIsLoading(true);
    fetch(`${API_BASE}/api/v1/profiles/${walletHex}`)
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
