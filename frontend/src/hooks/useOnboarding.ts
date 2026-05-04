import { useState, useCallback } from 'react';

const STORAGE_KEY = 'scl_onboarding_v1';

type OnboardingData = {
  accepted: boolean;
  nickname: string;
  email: string;
};

const defaultData: OnboardingData = { accepted: false, nickname: '', email: '' };

function readStorage(): OnboardingData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultData;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.accepted === 'boolean') return parsed as OnboardingData;
    return defaultData;
  } catch {
    return defaultData;
  }
}

export function useOnboarding() {
  const [data, setData] = useState<OnboardingData>(readStorage);

  const accept = useCallback((nickname: string, email: string) => {
    const next: OnboardingData = { accepted: true, nickname: nickname.trim(), email: email.trim() };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {}
    setData(next);
  }, []);

  const reset = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
    setData(defaultData);
  }, []);

  return { accepted: data.accepted, nickname: data.nickname, email: data.email, accept, reset };
}
