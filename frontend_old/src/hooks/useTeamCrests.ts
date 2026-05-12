import { useState, useEffect, useCallback } from 'react';

const ORACLE_BASE = (import.meta.env.VITE_ORACLE_URL as string | undefined) ?? 'http://localhost:3001';

let cachedCrests: Record<string, string> | null = null;
let pending: Promise<Record<string, string>> | null = null;

async function loadCrests(): Promise<Record<string, string>> {
  if (cachedCrests) return cachedCrests;
  if (pending) return pending;

  pending = (async () => {
    const merged: Record<string, string> = {};

    const [crestsRes, matchCrestsRes] = await Promise.allSettled([
      fetch(`${ORACLE_BASE}/sports/crests`).then((r) => r.json()),
      fetch(`${ORACLE_BASE}/sports/match-crests`).then((r) => r.json()),
    ]);

    if (crestsRes.status === 'fulfilled') {
      const data = crestsRes.value as any;
      Object.assign(merged, data.crests ?? {});
    }

    if (matchCrestsRes.status === 'fulfilled') {
      const data = matchCrestsRes.value as any;
      type TeamInfo = { name: string; shortName: string; crest: string };
      const matches = (data.matches ?? {}) as Record<string, { home: TeamInfo; away: TeamInfo }>;
      for (const entry of Object.values(matches)) {
        if (entry.home?.crest) {
          if (entry.home.name) merged[entry.home.name] = entry.home.crest;
          if (entry.home.shortName) merged[entry.home.shortName] = entry.home.crest;
        }
        if (entry.away?.crest) {
          if (entry.away.name) merged[entry.away.name] = entry.away.crest;
          if (entry.away.shortName) merged[entry.away.shortName] = entry.away.crest;
        }
      }
    }

    cachedCrests = merged;
    pending = null;
    return merged;
  })();

  return pending;
}

export function useTeamCrests(): (name: string) => string | null {
  const [crests, setCrests] = useState<Record<string, string>>(cachedCrests ?? {});

  useEffect(() => {
    if (cachedCrests) {
      setCrests(cachedCrests);
      return;
    }
    loadCrests().then(setCrests);
  }, []);

  return useCallback((name: string) => crests[name] ?? null, [crests]);
}

/** Exposed for components that need the full match-crests map by bolaoMatchId */
export async function fetchMatchCrests(): Promise<Record<string, { home: { name: string; shortName: string; crest: string }; away: { name: string; shortName: string; crest: string } }>> {
  try {
    const r = await fetch(`${ORACLE_BASE}/sports/match-crests`);
    const data = await r.json() as any;
    return data.matches ?? {};
  } catch {
    return {};
  }
}
