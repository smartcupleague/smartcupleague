import { useState, useCallback, useEffect } from 'react';

const TERMS_VERSION = 'v1';
export const ONBOARDING_CONNECT_EVENT = 'smartcup:onboarding-connect-intent';

function storageKey(walletAddress?: string): string | null {
  return walletAddress ? `scl_terms_${TERMS_VERSION}:${walletAddress}` : null;
}

type OnboardingData = {
  accepted: boolean;
  nickname: string;
};

const defaultData: OnboardingData = { accepted: false, nickname: '' };

function readStorage(walletAddress?: string): OnboardingData {
  const key = storageKey(walletAddress);
  if (!key) return defaultData;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return defaultData;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.accepted === 'boolean') return parsed as OnboardingData;
    return defaultData;
  } catch {
    return defaultData;
  }
}

export function useOnboarding(walletAddress?: string) {
  const [data, setData] = useState<OnboardingData>(() => readStorage(walletAddress));

  useEffect(() => {
    setData(readStorage(walletAddress));
  }, [walletAddress]);

  const accept = useCallback((nickname: string) => {
    const next: OnboardingData = { accepted: true, nickname: nickname.trim() };
    const key = storageKey(walletAddress);
    if (key) {
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {}
    }
    setData(next);
  }, [walletAddress]);

  const reset = useCallback(() => {
    const key = storageKey(walletAddress);
    if (key) {
      try {
        localStorage.removeItem(key);
      } catch {}
    }
    setData(defaultData);
  }, [walletAddress]);

  return { accepted: data.accepted, nickname: data.nickname, accept, reset };
}
