import { useCallback, useEffect, useMemo, useState } from 'react';
import { WORLD_CUP_2026_TOURNAMENT, type TournamentKey } from '@/utils';

const STORAGE_KEY = 'scl_active_tournament';
const CHANGE_EVENT = 'scl:tournament-change';

function readStoredTournament(): TournamentKey {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'leagues' || value === 'worldcup'
      ? value
      : WORLD_CUP_2026_TOURNAMENT.key;
  } catch {
    return WORLD_CUP_2026_TOURNAMENT.key;
  }
}

function persistTournament(key: TournamentKey) {
  try {
    localStorage.setItem(STORAGE_KEY, key);
    window.dispatchEvent(new CustomEvent<TournamentKey>(CHANGE_EVENT, { detail: key }));
  } catch {}
}

export function useTournamentSelection(availableKeys: readonly TournamentKey[] = []) {
  const normalizedAvailableKeys = useMemo(
    () => availableKeys.filter((key, index, list) => list.indexOf(key) === index),
    [availableKeys]
  );

  const [selectedTournamentKey, setSelectedTournamentKeyState] = useState<TournamentKey>(() => {
    const stored = readStoredTournament();
    return normalizedAvailableKeys.length && !normalizedAvailableKeys.includes(stored)
      ? normalizedAvailableKeys[0]
      : stored;
  });

  const setSelectedTournamentKey = useCallback((key: TournamentKey) => {
    setSelectedTournamentKeyState(key);
    persistTournament(key);
  }, []);

  useEffect(() => {
    if (!normalizedAvailableKeys.length) return;
    if (!normalizedAvailableKeys.includes(selectedTournamentKey)) {
      setSelectedTournamentKey(normalizedAvailableKeys[0]);
    }
  }, [normalizedAvailableKeys, selectedTournamentKey, setSelectedTournamentKey]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      const next = readStoredTournament();
      setSelectedTournamentKeyState(next);
    };

    const handleChange = (event: Event) => {
      const next = (event as CustomEvent<TournamentKey>).detail;
      if (next === 'leagues' || next === 'worldcup') {
        setSelectedTournamentKeyState(next);
      }
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener(CHANGE_EVENT, handleChange);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(CHANGE_EVENT, handleChange);
    };
  }, []);

  return [selectedTournamentKey, setSelectedTournamentKey] as const;
}
