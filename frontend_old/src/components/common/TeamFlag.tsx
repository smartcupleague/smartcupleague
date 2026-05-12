import React, { useEffect, useState } from 'react';
import { useTeamCrests } from '@/hooks/useTeamCrests';
import { TEAM_FLAGS } from '@/utils/teams';

function localFlag(name: string): string | null {
  const key = (name || '').trim().toUpperCase().replace(/\s+/g, ' ');
  return TEAM_FLAGS[key] ?? null;
}

function teamInitials(name: string): string {
  return (name || '?')
    .split(/\s+/)
    .map((w) => w[0] ?? '')
    .join('')
    .slice(0, 3)
    .toUpperCase();
}

interface TeamFlagProps {
  team: string;
  className?: string;
  alt?: string;
}

export function TeamFlag({ team, className, alt }: TeamFlagProps) {
  const getCrest = useTeamCrests();
  const crest = getCrest(team);
  const local = localFlag(team);

  const [failedCrest, setFailedCrest] = useState(false);
  const [failedLocal, setFailedLocal] = useState(false);

  // When crest becomes available (async load), give it another chance
  useEffect(() => {
    if (crest) setFailedCrest(false);
  }, [crest]);

  if (crest && !failedCrest) {
    return (
      <img
        className={className}
        src={crest}
        alt={alt ?? team}
        onError={() => setFailedCrest(true)}
        loading="lazy"
      />
    );
  }

  if (local && !failedLocal) {
    return (
      <img
        className={className}
        src={local}
        alt={alt ?? team}
        onError={() => setFailedLocal(true)}
        loading="lazy"
      />
    );
  }

  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#1e2740',
        color: '#7b8ab8',
        fontSize: '0.55em',
        fontWeight: 700,
        letterSpacing: '0.04em',
        borderRadius: 3,
      }}
    >
      {teamInitials(team)}
    </span>
  );
}
