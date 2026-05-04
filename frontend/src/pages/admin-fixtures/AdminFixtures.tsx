import React, { useCallback, useEffect, useState } from 'react';
import styled, { keyframes } from 'styled-components';
import { useApi } from '@gear-js/react-hooks';
import { HexString } from '@gear-js/api';
import { Program, Service } from '@/hocs/lib';

/* ─── Config ─────────────────────────────────────────────── */
const ORACLE_BASE =
  (import.meta.env.VITE_ORACLE_URL as string | undefined) ?? 'http://localhost:3001';
const BOLAO_PROGRAM_ID = import.meta.env.VITE_BOLAOCOREPROGRAM as string | undefined;

/* ─── League config ──────────────────────────────────────── */
const LEAGUE_TABS = ['SERIE_A', 'LA_LIGA', 'PORTUGUESA', 'BUNDESLIGA', 'LIGUE_1'] as const;
type LeagueTabKey = typeof LEAGUE_TABS[number];

const LEAGUE_CONFIG: Record<LeagueTabKey, { label: string; code: string; color: string }> = {
  SERIE_A:    { label: 'Serie A',       code: 'SA',  color: '#00b4d8' },
  LA_LIGA:    { label: 'La Liga',       code: 'PD',  color: '#ee1620' },
  PORTUGUESA: { label: 'Liga Portugal', code: 'PPL', color: '#00a86b' },
  BUNDESLIGA: { label: 'Bundesliga',    code: 'BL1', color: '#e8002d' },
  LIGUE_1:    { label: 'Ligue 1',       code: 'FL1', color: '#0055a4' },
};

function isLeagueTab(t: TabStatus): t is LeagueTabKey {
  return (LEAGUE_TABS as readonly string[]).includes(t);
}

/* ─── Types ──────────────────────────────────────────────── */
type TabStatus = 'SCHEDULED' | 'IN_PLAY' | 'FINISHED' | 'BOLAO_CORE' | 'ORACLE' | 'FRIENDLIES' | LeagueTabKey;

/* ─── Module-level cache (persists across navigation) ────── */
const fixturesCache: Partial<Record<TabStatus, WCFixture[]>> = {};
const countsCache: Partial<Record<TabStatus, number>> = {};
let friendliesCache: WCFixture[] | null = null;
const leagueCache: Partial<Record<LeagueTabKey, WCFixture[]>> = {};
type RegState = 'idle' | 'confirming' | 'loading' | 'success' | 'error';

interface Score {
  home: number | null;
  away: number | null;
}

interface WCTeam {
  id: number;
  name: string;
  shortName: string;
  tla: string;
  crest: string;
}

interface WCFixture {
  id: number;
  matchday: number | null;
  stage: string;
  group: string | null;
  status: string;
  utcDate: string;
  homeTeam: WCTeam;
  awayTeam: WCTeam;
  score: {
    winner: string | null;
    fullTime: Score;
    halfTime: Score;
    penalties: Score;
  };
  competition?: { id: number; name: string; code: string };
}

interface FixturesResponse {
  ok: boolean;
  count: number;
  matches: WCFixture[];
  error?: string;
}

/* ─── Helpers ────────────────────────────────────────────── */
const TAB_LABEL: Record<TabStatus, string> = {
  SCHEDULED: 'Scheduled',
  IN_PLAY: 'Live',
  FINISHED: 'Finished',
  BOLAO_CORE: 'BolaoCore',
  ORACLE: 'Oracle',
  FRIENDLIES: 'Today',
  SERIE_A:    LEAGUE_CONFIG.SERIE_A.label,
  LA_LIGA:    LEAGUE_CONFIG.LA_LIGA.label,
  PORTUGUESA: LEAGUE_CONFIG.PORTUGUESA.label,
  BUNDESLIGA: LEAGUE_CONFIG.BUNDESLIGA.label,
  LIGUE_1:    LEAGUE_CONFIG.LIGUE_1.label,
};

const TAB_COLOR: Record<TabStatus, string> = {
  SCHEDULED: '#60a5fa',
  IN_PLAY: '#34d399',
  FINISHED: 'rgba(255, 175, 210, 0.75)',
  BOLAO_CORE: '#a78bfa',
  ORACLE: '#f97316',
  FRIENDLIES: '#2dd4bf',
  SERIE_A:    LEAGUE_CONFIG.SERIE_A.color,
  LA_LIGA:    LEAGUE_CONFIG.LA_LIGA.color,
  PORTUGUESA: LEAGUE_CONFIG.PORTUGUESA.color,
  BUNDESLIGA: LEAGUE_CONFIG.BUNDESLIGA.color,
  LIGUE_1:    LEAGUE_CONFIG.LIGUE_1.color,
};

function fmtDate(utcDate: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    }).format(new Date(utcDate));
  } catch {
    return utcDate;
  }
}

function fmtStage(stage: string): string {
  return stage.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmtKickOff(ms: string | number | bigint): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
      timeZoneName: 'short',
    }).format(new Date(Number(ms)));
  } catch { return String(ms); }
}

type RawResult = 'Unresolved' | { Proposed: { score: { home: number; away: number }; oracle: string } } | { Finalized: { score: { home: number; away: number } } };

interface OracleFinalResult {
  score: { home: number; away: number };
  penalty_winner: 'Home' | 'Away' | null;
  finalized_at: number | string | bigint;
}

interface OracleMatchResult {
  match_id: number | string | bigint;
  phase: string;
  home: string;
  away: string;
  kick_off: number | string | bigint;
  status: 'Pending' | 'Finalized';
  final_result: OracleFinalResult | null;
  submissions: number;
}

function resultLabel(result: RawResult): { text: string; color: string } {
  if (result === 'Unresolved') return { text: 'Unresolved', color: 'rgba(255,255,255,0.28)' };
  if (typeof result === 'object' && 'Proposed' in result) {
    const s = result.Proposed.score;
    return { text: `Proposed ${s.home}–${s.away}`, color: '#fbbf24' };
  }
  if (typeof result === 'object' && 'Finalized' in result) {
    const s = result.Finalized.score;
    return { text: `Finalized ${s.home}–${s.away}`, color: '#34d399' };
  }
  return { text: '?', color: 'rgba(255,255,255,0.28)' };
}

function groupByStage(fixtures: WCFixture[]): { stage: string; items: WCFixture[] }[] {
  const map = new Map<string, WCFixture[]>();
  for (const f of fixtures) {
    const arr = map.get(f.stage) ?? [];
    arr.push(f);
    map.set(f.stage, arr);
  }
  return [...map.entries()].map(([stage, items]) => ({ stage, items }));
}

function groupByCompetition(fixtures: WCFixture[]): { label: string; items: WCFixture[] }[] {
  const map = new Map<string, WCFixture[]>();
  for (const f of fixtures) {
    const key = f.competition?.name ?? 'Unknown Competition';
    const arr = map.get(key) ?? [];
    arr.push(f);
    map.set(key, arr);
  }
  return [...map.entries()]
    .map(([label, items]) => ({ label, items: items.sort((a, b) => new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime()) }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/* ─── Animations ─────────────────────────────────────────── */
const pulseDot = keyframes`
  0%, 100% { opacity: 1;   transform: scale(1);    }
  50%       { opacity: 0.4; transform: scale(0.72); }
`;
const spin = keyframes`
  to { transform: rotate(360deg); }
`;
const fadeUp = keyframes`
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: translateY(0);    }
`;
const slideDown = keyframes`
  from { opacity: 0; max-height: 0;  transform: translateY(-4px); }
  to   { opacity: 1; max-height: 80px; transform: translateY(0);  }
`;

/* ─── Layout ─────────────────────────────────────────────── */
const Page = styled.div`
  width: 100%;
  padding: 20px 0 56px;
`;

const ContentRow = styled.div`
  display: grid;
  grid-template-columns: 310px 1fr;
  gap: 16px;
  align-items: flex-start;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`;

const Panel = styled.section`
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.09);
  background:
    radial-gradient(860px 340px at 15% 0%, rgba(122, 19, 73, 0.22), transparent 58%),
    radial-gradient(500px 200px at 90% 100%, rgba(255, 0, 110, 0.06), transparent 55%),
    rgba(9, 0, 6, 0.88);
  backdrop-filter: blur(16px);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255, 46, 118, 0.06) inset;
  overflow: hidden;
`;

/* ─── Header ─────────────────────────────────────────────── */
const PanelHead = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 24px 28px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);

  @media (max-width: 580px) {
    flex-direction: column;
    padding: 18px 18px 16px;
  }
`;

const TitleGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 5px;
`;

const Title = styled.h1`
  margin: 0;
  font-size: 21px;
  font-weight: 800;
  color: #fff;
  letter-spacing: -0.5px;
  line-height: 1.1;

  em {
    font-style: normal;
    background: linear-gradient(90deg, #ff2e76, #ff6ba4);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }
`;

const Sub = styled.p`
  margin: 0;
  font-size: 11px;
  color: rgba(255, 235, 246, 0.35);
  letter-spacing: 0.1px;
`;

const HeadActions = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
`;

const TimeStamp = styled.span`
  font-size: 11px;
  color: rgba(255, 255, 255, 0.22);
`;

const RefreshBtn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 15px;
  border-radius: 10px;
  border: 1px solid rgba(255, 46, 118, 0.25);
  background: rgba(255, 46, 118, 0.07);
  color: rgba(255, 175, 210, 0.85);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 130ms;
  letter-spacing: 0.1px;

  &:hover:not(:disabled) {
    border-color: rgba(255, 46, 118, 0.5);
    background: rgba(255, 46, 118, 0.14);
    color: #fff;
    box-shadow: 0 0 16px rgba(255, 46, 118, 0.15);
  }
  &:disabled {
    opacity: 0.38;
    cursor: default;
  }

  svg {
    width: 13px;
    height: 13px;
    flex-shrink: 0;
  }
`;

/* ─── Tabs ───────────────────────────────────────────────── */
const TabRow = styled.div`
  display: flex;
  gap: 8px;
  padding: 14px 28px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  overflow-x: auto;

  &::-webkit-scrollbar { display: none; }

  @media (max-width: 580px) {
    padding: 12px 16px;
  }
`;

const TabBtn = styled.button<{ $active: boolean; $s: TabStatus }>`
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 8px 16px;
  border-radius: 10px;
  font-size: 12.5px;
  font-weight: 700;
  white-space: nowrap;
  cursor: pointer;
  letter-spacing: 0.1px;
  transition: all 140ms ease;
  border: 1px solid
    ${({ $active, $s }) => ($active ? `${TAB_COLOR[$s]}66` : 'rgba(255,255,255,0.07)')};
  background: ${({ $active, $s }) =>
    $active
      ? `radial-gradient(380px 90px at 0% 0%, ${TAB_COLOR[$s]}22, transparent 65%), rgba(0,0,0,0.18)`
      : 'rgba(0,0,0,0.12)'};
  color: ${({ $active, $s }) => ($active ? TAB_COLOR[$s] : 'rgba(255,255,255,0.35)')};
  box-shadow: ${({ $active, $s }) =>
    $active ? `0 0 14px ${TAB_COLOR[$s]}18` : 'none'};

  &:hover {
    border-color: ${({ $s }) => `${TAB_COLOR[$s]}44`};
    color: ${({ $s }) => TAB_COLOR[$s]};
  }
`;

const CountChip = styled.span<{ $active: boolean; $s: TabStatus }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 16px;
  padding: 0 5px;
  border-radius: 5px;
  font-size: 10px;
  font-weight: 800;
  background: ${({ $active, $s }) =>
    $active ? `${TAB_COLOR[$s]}28` : 'rgba(255,255,255,0.06)'};
  color: ${({ $active, $s }) => ($active ? TAB_COLOR[$s] : 'rgba(255,255,255,0.22)')};
`;

const LiveDot = styled.span`
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #34d399;
  display: inline-block;
  flex-shrink: 0;
  animation: ${pulseDot} 1.4s ease-in-out infinite;
`;

/* ─── Stage header ───────────────────────────────────────── */
const StageHeader = styled.div`
  padding: 9px 28px 8px;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 1.1px;
  text-transform: uppercase;
  color: rgba(255, 175, 210, 0.4);
  background: rgba(122, 19, 73, 0.08);
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);

  @media (max-width: 580px) {
    padding: 8px 16px 7px;
  }
`;

/* ─── Friendly match row ─────────────────────────────────── */
const FriendlyRow = styled.div`
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 12px;
  padding: 14px 28px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.042);
  transition: background 130ms;
  &:last-child { border-bottom: none; }
  &:hover { background: rgba(45, 212, 191, 0.04); }

  @media (max-width: 580px) { padding: 12px 16px; gap: 8px; }
`;

const FriendlyTeam = styled.div<{ $right?: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.85);
  ${({ $right }) => $right ? 'justify-content: flex-end; flex-direction: row-reverse;' : ''}
  @media (max-width: 580px) { font-size: 11px; gap: 5px; }
`;

const FriendlyCrest = styled.img`
  width: 22px;
  height: 22px;
  object-fit: contain;
  flex-shrink: 0;
`;

const FriendlyCenter = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  min-width: 80px;
`;

const FriendlyScore = styled.span`
  font-size: 14px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.9);
  letter-spacing: 0.5px;
  white-space: nowrap;
`;

const FriendlyStatusBadge = styled.span<{ $status: string }>`
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.8px;
  text-transform: uppercase;
  padding: 2px 6px;
  border-radius: 4px;
  background: ${({ $status }) =>
    $status === 'FINISHED' ? 'rgba(255,175,210,0.12)' :
    $status === 'IN_PLAY'  ? 'rgba(52,211,153,0.15)'  :
    'rgba(45,212,191,0.12)'};
  color: ${({ $status }) =>
    $status === 'FINISHED' ? 'rgba(255,175,210,0.75)' :
    $status === 'IN_PLAY'  ? '#34d399'                :
    '#2dd4bf'};
`;

/* ─── Match row (full-width) ─────────────────────────────── */
const MatchList = styled.div`
  animation: ${fadeUp} 200ms ease;
`;

const MatchCard = styled.article`
  border-bottom: 1px solid rgba(255, 255, 255, 0.042);
  transition: background 130ms;

  &:last-child { border-bottom: none; }
  &:hover { background: rgba(255, 46, 118, 0.035); }
`;

const MatchRow = styled.div`
  display: grid;
  grid-template-columns: 1fr 110px 1fr auto;
  align-items: center;
  gap: 12px;
  padding: 16px 20px 16px 28px;
  width: 100%;

  @media (max-width: 640px) {
    padding: 14px 14px 14px 16px;
    gap: 8px;
    grid-template-columns: 1fr 90px 1fr auto;
  }
  @media (max-width: 420px) {
    grid-template-columns: 1fr 80px 1fr 38px;
    gap: 4px;
  }
`;

const TeamCol = styled.div<{ $align: 'left' | 'right' }>`
  display: flex;
  align-items: center;
  gap: 10px;
  flex-direction: ${({ $align }) => ($align === 'right' ? 'row-reverse' : 'row')};
  min-width: 0;
`;

const CrestImg = styled.img`
  width: 36px;
  height: 36px;
  object-fit: contain;
  flex-shrink: 0;
  filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.6));

  @media (max-width: 440px) {
    width: 26px;
    height: 26px;
  }
`;

const TlaFallback = styled.div`
  width: 36px;
  height: 36px;
  border-radius: 9px;
  background: rgba(255, 46, 118, 0.1);
  border: 1px solid rgba(255, 46, 118, 0.18);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 800;
  color: rgba(255, 175, 210, 0.6);
  letter-spacing: 0.3px;
  flex-shrink: 0;

  @media (max-width: 440px) {
    width: 26px;
    height: 26px;
    font-size: 8px;
  }
`;

const TeamName = styled.span<{ $align: 'left' | 'right' }>`
  font-size: 14px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.88);
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 150px;
  text-align: ${({ $align }) => $align};

  @media (max-width: 440px) {
    font-size: 11px;
    max-width: 76px;
  }
`;

/* ─── Score / Center ─────────────────────────────────────── */
const ScoreCol = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  min-width: 88px;

  @media (max-width: 440px) {
    min-width: 60px;
  }
`;

const ScoreNum = styled.div`
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 26px;
  font-weight: 900;
  color: #fff;
  letter-spacing: 0.5px;
  font-variant-numeric: tabular-nums;

  @media (max-width: 440px) {
    font-size: 18px;
    gap: 4px;
  }
`;

const ScoreSep = styled.span`
  font-size: 17px;
  font-weight: 300;
  color: rgba(255, 255, 255, 0.2);
`;

const KickoffBox = styled.div`
  font-size: 11px;
  font-weight: 600;
  color: #60a5fa;
  text-align: center;
  line-height: 1.45;
`;

const LiveTag = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.7px;
  text-transform: uppercase;
  color: #34d399;
`;

const MatchNote = styled.span`
  font-size: 10px;
  color: rgba(255, 235, 246, 0.28);
  font-style: italic;
  text-align: center;
`;

/* ─── Meta pills ─────────────────────────────────────────── */
const MetaRow = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 28px 10px;
  flex-wrap: wrap;

  @media (max-width: 640px) {
    padding: 0 16px 10px;
  }
`;

const Pill = styled.span<{ $c?: string }>`
  font-size: 9.5px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 6px;
  letter-spacing: 0.2px;
  border: 1px solid ${({ $c }) => ($c ? `${$c}40` : 'rgba(255,255,255,0.09)')};
  color: ${({ $c }) => $c ?? 'rgba(255,255,255,0.32)'};
  background: ${({ $c }) => ($c ? `${$c}0f` : 'rgba(255,255,255,0.03)')};
  text-transform: uppercase;
`;

/* ─── Action icon buttons ────────────────────────────────── */
const ActionsGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
`;

const ActionIconBtn = styled.button<{
  $color: string;
  $state?: 'idle' | 'active' | 'loading' | 'success' | 'error';
}>`
  width: 38px;
  height: 38px;
  border-radius: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  cursor: pointer;
  transition: all 150ms ease;
  border: 1px solid
    ${({ $color, $state }) =>
      $state === 'success'
        ? 'rgba(52,211,153,0.38)'
        : $state === 'error'
        ? 'rgba(248,113,113,0.38)'
        : $state === 'active'
        ? `${$color}55`
        : `${$color}22`};
  background: ${({ $color, $state }) =>
    $state === 'success'
      ? 'rgba(52,211,153,0.10)'
      : $state === 'error'
      ? 'rgba(248,113,113,0.10)'
      : $state === 'active'
      ? `${$color}18`
      : `${$color}08`};
  color: ${({ $color, $state }) =>
    $state === 'success'
      ? '#34d399'
      : $state === 'error'
      ? '#f87171'
      : $state === 'active'
      ? $color
      : `${$color}88`};
  box-shadow: ${({ $color, $state }) =>
    $state === 'active'
      ? `0 0 0 1px ${$color}20, 0 4px 14px ${$color}14`
      : $state === 'success'
      ? '0 0 0 1px rgba(52,211,153,0.18)'
      : 'none'};

  &:hover:not(:disabled) {
    border-color: ${({ $color }) => `${$color}50`};
    background: ${({ $color }) => `${$color}16`};
    color: ${({ $color }) => $color};
    transform: translateY(-1px);
    box-shadow: 0 4px 18px ${({ $color }) => `${$color}1e`};
  }
  &:active:not(:disabled) { transform: translateY(0); }
  &:disabled { opacity: 0.4; cursor: default; transform: none; }

  svg { width: 17px; height: 17px; flex-shrink: 0; }
`;

const ActionSpinner = styled.div<{ $color: string }>`
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid ${({ $color }) => `${$color}22`};
  border-top-color: ${({ $color }) => $color};
  animation: ${spin} 600ms linear infinite;
`;

/* ─── Expand panel (register / oracle confirm) ───────────── */
const ExpandPanel = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 28px 12px;
  flex-wrap: wrap;
  animation: ${slideDown} 180ms ease;
  border-top: 1px solid rgba(255, 255, 255, 0.05);

  @media (max-width: 640px) {
    padding: 8px 16px 10px;
  }
`;

const PhaseLabel = styled.span`
  font-size: 11px;
  color: rgba(255, 235, 246, 0.45);
  font-weight: 600;
  white-space: nowrap;
`;

const PhaseInput = styled.input`
  padding: 5px 10px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(0, 0, 0, 0.35);
  color: rgba(255, 255, 255, 0.88);
  font-size: 11.5px;
  font-weight: 500;
  min-width: 0;
  width: 160px;
  outline: none;
  transition: border-color 130ms;

  &:focus {
    border-color: rgba(255, 46, 118, 0.5);
    box-shadow: 0 0 0 2px rgba(255, 46, 118, 0.08);
  }

  &::placeholder {
    color: rgba(255, 255, 255, 0.22);
  }
`;

const ConfirmBtn = styled.button`
  padding: 5px 14px;
  border-radius: 8px;
  border: 1px solid rgba(255, 46, 118, 0.45);
  background: linear-gradient(135deg, rgba(255, 46, 118, 0.22), rgba(255, 46, 118, 0.1));
  color: #fff;
  font-size: 11.5px;
  font-weight: 700;
  cursor: pointer;
  transition: all 130ms;

  &:hover:not(:disabled) {
    background: linear-gradient(135deg, rgba(255, 46, 118, 0.38), rgba(255, 46, 118, 0.2));
    box-shadow: 0 0 14px rgba(255, 46, 118, 0.22);
  }
  &:disabled {
    opacity: 0.45;
    cursor: default;
  }
`;

const CancelBtn = styled.button`
  padding: 5px 12px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: transparent;
  color: rgba(255, 255, 255, 0.35);
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
  transition: all 130ms;

  &:hover {
    border-color: rgba(255, 255, 255, 0.16);
    color: rgba(255, 255, 255, 0.6);
  }
`;

const SpinXS = styled.div`
  width: 11px;
  height: 11px;
  border-radius: 50%;
  border: 1.8px solid rgba(255, 255, 255, 0.15);
  border-top-color: #ff2e76;
  animation: ${spin} 600ms linear infinite;
  flex-shrink: 0;
`;

const StatusChip = styled.span<{ $variant: 'loading' | 'success' | 'error' }>`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 11px;
  border-radius: 7px;
  font-size: 11px;
  font-weight: 700;
  border: 1px solid
    ${({ $variant }) =>
      $variant === 'success'
        ? 'rgba(52, 211, 153, 0.35)'
        : $variant === 'error'
        ? 'rgba(248, 113, 113, 0.35)'
        : 'rgba(255,255,255,0.1)'};
  background: ${({ $variant }) =>
    $variant === 'success'
      ? 'rgba(52, 211, 153, 0.1)'
      : $variant === 'error'
      ? 'rgba(248, 113, 113, 0.1)'
      : 'rgba(255,255,255,0.05)'};
  color: ${({ $variant }) =>
    $variant === 'success'
      ? '#34d399'
      : $variant === 'error'
      ? '#f87171'
      : 'rgba(255,255,255,0.5)'};
`;

const RetryLink = styled.button`
  font-size: 11px;
  font-weight: 600;
  color: rgba(255, 175, 210, 0.6);
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  text-decoration: underline;
  text-underline-offset: 2px;
  transition: color 120ms;

  &:hover { color: rgba(255, 175, 210, 0.9); }
`;

/* ─── Loading / Empty / Error (page-level) ───────────────── */
const CenterBox = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 72px 24px;
  color: rgba(255, 235, 246, 0.32);
  font-size: 13px;
  text-align: center;
`;

const SpinRing = styled.div`
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 2.5px solid rgba(255, 46, 118, 0.12);
  border-top-color: #ff2e76;
  animation: ${spin} 650ms linear infinite;
`;

const ErrMsg = styled.p`
  margin: 0;
  font-size: 13px;
  color: rgba(248, 113, 113, 0.8);
`;

const PageRetryBtn = styled.button`
  padding: 8px 18px;
  border-radius: 9px;
  border: 1px solid rgba(248, 113, 113, 0.25);
  background: rgba(248, 113, 113, 0.07);
  color: rgba(255, 160, 160, 0.9);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 130ms;

  &:hover { background: rgba(248, 113, 113, 0.14); }
`;


/* ─── Tournament Setup — phase config ───────────────────── */
interface WCPhaseSetup {
  id: string;
  name: string;
  stage: string;
  icon: string;
  color: string;
  pointsWeight: number;
  expectedMatches: number;
  defaultNextId: number;
  startTime: number;
  endTime: number;
  dateLabel: string;
}

const WC2026_PHASES: WCPhaseSetup[] = [
  { id: 'groups', name: 'Group Stage',   stage: 'GROUP_STAGE',    icon: '⚽', color: '#60a5fa', pointsWeight: 1, expectedMatches: 72, defaultNextId: 1,  startTime: 1781136000000, endTime: 1783036800000, dateLabel: 'Jun 11 – Jul 2' },
  { id: 'r32',    name: 'Round of 32',   stage: 'ROUND_OF_32',    icon: '🏟️', color: '#a78bfa', pointsWeight: 2, expectedMatches: 16, defaultNextId: 49, startTime: 1783123200000, endTime: 1783641600000, dateLabel: 'Jul 4 – 9' },
  { id: 'r16',    name: 'Round of 16',   stage: 'ROUND_OF_16',    icon: '🎯', color: '#34d399', pointsWeight: 3, expectedMatches: 8,  defaultNextId: 65, startTime: 1783728000000, endTime: 1784073600000, dateLabel: 'Jul 11 – 14' },
  { id: 'qf',     name: 'Quarter Finals',stage: 'QUARTER_FINALS', icon: '🔥', color: '#f97316', pointsWeight: 4, expectedMatches: 4,  defaultNextId: 73, startTime: 1784332800000, endTime: 1784505600000, dateLabel: 'Jul 18 – 19' },
  { id: 'sf',     name: 'Semi Finals',   stage: 'SEMI_FINALS',    icon: '⚡', color: '#fbbf24', pointsWeight: 5, expectedMatches: 2,  defaultNextId: 77, startTime: 1784678400000, endTime: 1784851200000, dateLabel: 'Jul 22 – 23' },
  { id: '3rd',    name: 'Third Place',   stage: 'THIRD_PLACE',    icon: '🥉', color: '#94a3b8', pointsWeight: 5, expectedMatches: 1,  defaultNextId: 79, startTime: 1785024000000, endTime: 1785110400000, dateLabel: 'Jul 26' },
  { id: 'final',  name: 'Final',         stage: 'FINAL',          icon: '🏆', color: '#ffd700', pointsWeight: 6, expectedMatches: 1,  defaultNextId: 80, startTime: 1785110400000, endTime: 1785196800000, dateLabel: 'Jul 27' },
];

/* ─── Setup Panel styled components ─────────────────────── */
const SetupPanelWrap = styled.section`
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.09);
  background:
    radial-gradient(560px 280px at 15% 0%, rgba(122, 19, 73, 0.22), transparent 58%),
    radial-gradient(300px 180px at 90% 100%, rgba(255, 0, 110, 0.06), transparent 55%),
    rgba(9, 0, 6, 0.88);
  backdrop-filter: blur(16px);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255, 46, 118, 0.06) inset;
  overflow: hidden;
`;

const SetupPanelHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 20px 20px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
  flex-wrap: wrap;
`;

const SetupTitle = styled.h2`
  margin: 0;
  font-size: 21px;
  font-weight: 800;
  color: #fff;
  letter-spacing: -0.5px;
  line-height: 1.1;

  em {
    font-style: normal;
    background: linear-gradient(90deg, #ff2e76, #ff6ba4);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }
`;

const SetupSub = styled.p`
  margin: 4px 0 0;
  font-size: 11px;
  color: rgba(255, 235, 246, 0.35);
  letter-spacing: 0.1px;
`;

const SetupBadge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.2px;
  background: rgba(255, 46, 118, 0.08);
  border: 1px solid rgba(255, 46, 118, 0.22);
  color: rgba(255, 175, 210, 0.85);
  white-space: nowrap;
  flex-shrink: 0;
`;

const PhaseGrid = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1px;
  background: rgba(255, 255, 255, 0.05);
`;

const PhaseCardWrap = styled.div<{ $color: string }>`
  position: relative;
  background: rgba(6, 4, 14, 0.90);
  padding: 20px 22px 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  transition: background 140ms;

  &:hover { background: rgba(12, 8, 24, 0.95); }

  &::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 3px;
    background: ${({ $color }) => `linear-gradient(90deg, ${$color}cc, ${$color}44)`};
  }
`;

const PhaseCardTop = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
`;

const PhaseIconName = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`;

const PhaseEmoji = styled.span`
  font-size: 22px;
  line-height: 1;
  flex-shrink: 0;
`;

const PhaseName = styled.span`
  font-size: 15px;
  font-weight: 800;
  color: rgba(255, 255, 255, 0.92);
  letter-spacing: -0.3px;
  line-height: 1.2;
`;

const PhaseDateBadge = styled.span<{ $color: string }>`
  font-size: 10px;
  font-weight: 700;
  padding: 3px 9px;
  border-radius: 20px;
  color: ${({ $color }) => $color};
  background: ${({ $color }) => `${$color}14`};
  border: 1px solid ${({ $color }) => `${$color}28`};
  white-space: nowrap;
  flex-shrink: 0;
`;

const PhaseMeta = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
`;

const MetaBadge = styled.span<{ $c?: string }>`
  font-size: 10px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 6px;
  letter-spacing: 0.2px;
  border: 1px solid ${({ $c }) => $c ? `${$c}30` : 'rgba(255,255,255,0.09)'};
  color: ${({ $c }) => $c ?? 'rgba(255,255,255,0.40)'};
  background: ${({ $c }) => $c ? `${$c}0f` : 'rgba(255,255,255,0.04)'};
`;

const PhaseIdRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const IdLabel = styled.label`
  font-size: 10.5px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.30);
  letter-spacing: 0.2px;
  white-space: nowrap;
`;

const IdInput = styled.input`
  width: 72px;
  padding: 5px 8px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.10);
  background: rgba(0, 0, 0, 0.35);
  color: rgba(255, 255, 255, 0.88);
  font-size: 12px;
  font-weight: 700;
  outline: none;
  text-align: center;
  transition: border-color 130ms;
  font-variant-numeric: tabular-nums;

  &:focus {
    border-color: rgba(96, 165, 250, 0.45);
    box-shadow: 0 0 0 2px rgba(96, 165, 250, 0.08);
  }
`;

const IdHint = styled.span`
  font-size: 10px;
  color: rgba(255, 255, 255, 0.20);
`;

const PhaseActions = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const DryBtn = styled.button<{ $color: string }>`
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 9px 14px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all 140ms;
  border: 1px solid ${({ $color }) => `${$color}30`};
  background: ${({ $color }) => `${$color}0a`};
  color: ${({ $color }) => `${$color}cc`};
  letter-spacing: 0.1px;

  &:hover:not(:disabled) {
    border-color: ${({ $color }) => `${$color}55`};
    background: ${({ $color }) => `${$color}16`};
    color: ${({ $color }) => $color};
  }
  &:disabled { opacity: 0.38; cursor: default; }
  svg { width: 13px; height: 13px; flex-shrink: 0; }
`;

const RegisterBtn = styled.button<{ $color: string; $confirming?: boolean }>`
  flex: 1.4;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 9px 16px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
  transition: all 140ms;
  letter-spacing: 0.15px;
  border: 1px solid ${({ $color, $confirming }) => $confirming ? `${$color}70` : `${$color}40`};
  background: ${({ $color, $confirming }) =>
    $confirming
      ? `linear-gradient(135deg, ${$color}30, ${$color}18)`
      : `linear-gradient(135deg, ${$color}18, ${$color}0a)`};
  color: ${({ $color }) => $color};
  box-shadow: ${({ $color, $confirming }) => $confirming ? `0 0 20px ${$color}22` : 'none'};

  &:hover:not(:disabled) {
    border-color: ${({ $color }) => `${$color}65`};
    background: ${({ $color }) => `linear-gradient(135deg, ${$color}28, ${$color}14)`};
    box-shadow: ${({ $color }) => `0 4px 18px ${$color}22`};
    transform: translateY(-1px);
  }
  &:active:not(:disabled) { transform: translateY(0); }
  &:disabled { opacity: 0.4; cursor: default; transform: none; }
  svg { width: 13px; height: 13px; flex-shrink: 0; }
`;

const PhaseStatusArea = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  animation: ${fadeUp} 180ms ease;
`;

const PhaseStatusChip = styled.div<{ $variant: 'loading' | 'success' | 'error' | 'preview' }>`
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 8px 12px;
  border-radius: 9px;
  font-size: 11.5px;
  font-weight: 600;
  border: 1px solid ${({ $variant }) => (
    $variant === 'success' ? 'rgba(52,211,153,0.30)' :
    $variant === 'error'   ? 'rgba(248,113,113,0.30)' :
    $variant === 'preview' ? 'rgba(96,165,250,0.28)' :
    'rgba(255,255,255,0.09)'
  )};
  background: ${({ $variant }) => (
    $variant === 'success' ? 'rgba(52,211,153,0.08)' :
    $variant === 'error'   ? 'rgba(248,113,113,0.08)' :
    $variant === 'preview' ? 'rgba(96,165,250,0.08)' :
    'rgba(255,255,255,0.04)'
  )};
  color: ${({ $variant }) => (
    $variant === 'success' ? '#34d399' :
    $variant === 'error'   ? '#f87171' :
    $variant === 'preview' ? '#93c5fd' :
    'rgba(255,255,255,0.55)'
  )};
`;

const PreviewList = styled.div`
  max-height: 160px;
  overflow-y: auto;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.07);
  background: rgba(0, 0, 0, 0.30);

  &::-webkit-scrollbar { width: 4px; }
  &::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 2px; }
`;

const PreviewRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 10px;
  border-bottom: 1px solid rgba(255,255,255,0.04);
  font-size: 11px;

  &:last-child { border-bottom: none; }
`;

const PreviewId = styled.span`
  font-size: 10px;
  font-weight: 800;
  color: rgba(96, 165, 250, 0.7);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
  min-width: 22px;
`;

const PreviewTeams = styled.span`
  flex: 1;
  color: rgba(255, 255, 255, 0.65);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const PreviewDate = styled.span`
  color: rgba(255, 255, 255, 0.25);
  font-size: 10px;
  white-space: nowrap;
  flex-shrink: 0;
`;

const SetupNote = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 14px 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
  font-size: 11px;
  color: rgba(255, 235, 246, 0.25);
  line-height: 1.6;
  background: rgba(255, 46, 118, 0.025);

  strong { color: rgba(255, 175, 210, 0.45); font-weight: 700; }

  @media (max-width: 580px) { padding: 12px 16px; }
`;

const SpinRingSmall = styled.div`
  width: 11px;
  height: 11px;
  border-radius: 50%;
  border: 1.8px solid rgba(255, 255, 255, 0.12);
  border-top-color: currentColor;
  animation: ${spin} 550ms linear infinite;
  flex-shrink: 0;
`;

/* ─── Sub-components ─────────────────────────────────────── */
function TeamCrest({ crest, tla }: { crest: string; tla: string }) {
  const [failed, setFailed] = React.useState(false);
  if (!crest || failed) return <TlaFallback>{tla || '?'}</TlaFallback>;
  return <CrestImg src={crest} alt={tla} onError={() => setFailed(true)} />;
}

function MatchItem({ fixture: f, tab }: { fixture: WCFixture; tab: TabStatus }) {
  // ── Register in BolaoCore only (SCHEDULED / non-league) ──────────────
  const [regState, setRegState] = useState<RegState>('idle');
  const [phase, setPhase] = useState(() => fmtStage(f.stage));
  const [regError, setRegError] = useState<string | null>(null);

  // ── Register match in Oracle only (SCHEDULED / non-league) ───────────
  const [oracleRegState, setOracleRegState] = useState<RegState>('idle');
  const [oracleRegId, setOracleRegId] = useState(String(f.id));
  const [oracleRegError, setOracleRegError] = useState<string | null>(null);

  // ── Feed result to Oracle (FINISHED) ──────────────────
  const [oracleState, setOracleState] = useState<RegState>('idle');
  const [oracleMatchId, setOracleMatchId] = useState(String(f.id));
  const [oracleError, setOracleError] = useState<string | null>(null);

  // ── Register Both: BolaoCore + Oracle + mapping (league tabs) ─────────
  const [bothState, setBothState] = useState<RegState>('idle');
  const [bothPhase, setBothPhase] = useState(() => isLeagueTab(tab) ? 'Regular Season' : fmtStage(f.stage) || 'Regular Season');
  const [bothNextId, setBothNextId] = useState('');
  const [bothError, setBothError] = useState<string | null>(null);

  const ht = f.score?.fullTime?.home ?? null;
  const at = f.score?.fullTime?.away ?? null;
  const hasScore = ht !== null && at !== null;
  const hasPen =
    (f.score?.penalties?.home ?? null) !== null &&
    (f.score?.penalties?.away ?? null) !== null;

  const handleCancelReg = () => { setPhase(fmtStage(f.stage)); setRegState('idle'); };
  const handleCancelOracleReg = () => { setOracleRegId(String(f.id)); setOracleRegState('idle'); };
  const handleCancelOracle = () => { setOracleMatchId(String(f.id)); setOracleState('idle'); };
  const handleCancelBoth = () => { setBothPhase(isLeagueTab(tab) ? 'Regular Season' : fmtStage(f.stage) || 'Regular Season'); setBothNextId(''); setBothState('idle'); };

  const handleRegister = async () => {
    setRegState('loading');
    setRegError(null);
    try {
      const kickOff = new Date(f.utcDate).getTime();
      const res = await fetch(`${ORACLE_BASE}/bolao/register-match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          home_team: f.homeTeam.name,
          away_team: f.awayTeam.name,
          kick_off: kickOff,
          phase: phase.trim(),
        }),
        signal: AbortSignal.timeout(20000),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? 'Registration failed');
      setRegState('success');
      setTimeout(() => setRegState('idle'), 4000);
    } catch (e: any) {
      setRegError(e?.message ?? 'Failed');
      setRegState('error');
    }
  };

  const handleOracleRegisterMatch = async () => {
    const id = oracleRegId.trim();
    if (!id || isNaN(Number(id))) return;
    setOracleRegState('loading');
    setOracleRegError(null);
    try {
      const res = await fetch(`${ORACLE_BASE}/oracle/register-match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ match_id: Number(id) }),
        signal: AbortSignal.timeout(20000),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? 'Registration failed');
      setOracleRegState('success');
      setTimeout(() => setOracleRegState('idle'), 4000);
    } catch (e: any) {
      setOracleRegError(e?.message ?? 'Failed');
      setOracleRegState('error');
    }
  };

  const handleSendToOracle = async () => {
    const id = oracleMatchId.trim();
    if (!id || isNaN(Number(id))) return;
    setOracleState('loading');
    setOracleError(null);
    try {
      const res = await fetch(`${ORACLE_BASE}/oracle/feed-match/${encodeURIComponent(id)}`, {
        method: 'POST',
        signal: AbortSignal.timeout(30000),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? 'Failed to send to Oracle');
      setOracleState('success');
      setTimeout(() => setOracleState('idle'), 5000);
    } catch (e: any) {
      setOracleError(e?.message ?? 'Failed');
      setOracleState('error');
    }
  };

  const handleRegisterBoth = async () => {
    setBothState('loading');
    setBothError(null);
    try {
      const kickOff = new Date(f.utcDate).getTime();
      const res = await fetch(`${ORACLE_BASE}/match/register-both`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phase: bothPhase.trim(),
          home_team: f.homeTeam.name,
          away_team: f.awayTeam.name,
          kick_off: kickOff,
          sports_api_id: f.id,
          next_bolao_id: Number(bothNextId),
        }),
        signal: AbortSignal.timeout(20000),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? 'Registration failed');
      setBothState('success');
      setTimeout(() => { setBothState('idle'); setBothNextId(''); }, 5000);
    } catch (e: any) {
      setBothError(e?.message ?? 'Failed');
      setBothState('error');
    }
  };

  const showRegPanel = regState === 'confirming' || regState === 'error';
  const showOracleRegPanel = tab === 'SCHEDULED' && (oracleRegState === 'confirming' || oracleRegState === 'error');
  const showOraclePanel = tab === 'FINISHED' && (oracleState === 'confirming' || oracleState === 'error');
  const showBothPanel = (isLeagueTab(tab) || tab === 'FRIENDLIES') && (bothState === 'confirming' || bothState === 'error');

  return (
    <MatchCard>
      <MatchRow>
        {/* Home team */}
        <TeamCol $align="left">
          <TeamCrest crest={f.homeTeam.crest} tla={f.homeTeam.tla} />
          <TeamName $align="left">{f.homeTeam.name}</TeamName>
        </TeamCol>

        {/* Score / time */}
        <ScoreCol>
          {(tab === 'SCHEDULED' || ((isLeagueTab(tab) || tab === 'FRIENDLIES') && !hasScore)) ? (
            <KickoffBox>{fmtDate(f.utcDate)}</KickoffBox>
          ) : hasScore ? (
            <ScoreNum>
              <span>{ht}</span>
              <ScoreSep>–</ScoreSep>
              <span>{at}</span>
            </ScoreNum>
          ) : (
            <ScoreNum>
              <span style={{ color: 'rgba(255,255,255,0.25)' }}>–</span>
              <ScoreSep>:</ScoreSep>
              <span style={{ color: 'rgba(255,255,255,0.25)' }}>–</span>
            </ScoreNum>
          )}
          {tab === 'IN_PLAY' && (
            <LiveTag><LiveDot />Live</LiveTag>
          )}
          {tab === 'FINISHED' && hasPen && (
            <MatchNote>Pen {f.score?.penalties?.home}–{f.score?.penalties?.away}</MatchNote>
          )}
          {tab === 'FINISHED' && <MatchNote>{fmtDate(f.utcDate)}</MatchNote>}
          {(isLeagueTab(tab) || tab === 'FRIENDLIES') && hasScore && <MatchNote>{fmtDate(f.utcDate)}</MatchNote>}
        </ScoreCol>

        {/* Away team */}
        <TeamCol $align="right">
          <TeamCrest crest={f.awayTeam.crest} tla={f.awayTeam.tla} />
          <TeamName $align="right">{f.awayTeam.name}</TeamName>
        </TeamCol>

        {/* Action icon buttons */}
        <ActionsGroup>
          {/* ── League tabs + Today: single unified button (BolaoCore + Oracle + mapping) ── */}
          {(isLeagueTab(tab) || tab === 'FRIENDLIES') ? (
            <ActionIconBtn
              $color="#22c55e"
              $state={
                bothState === 'confirming' ? 'active' :
                bothState === 'loading'    ? 'loading' :
                bothState === 'success'    ? 'success' :
                bothState === 'error'      ? 'error' : 'idle'
              }
              title={
                bothState === 'success'    ? '✓ Registered in BolaoCore + Oracle' :
                bothState === 'error'      ? 'Error — click to retry' :
                bothState === 'confirming' ? 'Cancel' :
                'Register in BolaoCore + Oracle (with mapping)'
              }
              disabled={bothState === 'loading'}
              onClick={() => {
                if (bothState === 'idle' || bothState === 'success') setBothState('confirming');
                else if (bothState === 'confirming' || bothState === 'error') handleCancelBoth();
              }}
            >
              {bothState === 'loading' ? (
                <ActionSpinner $color="#22c55e" />
              ) : bothState === 'success' ? (
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="2 8 6.5 12.5 14 4" />
                </svg>
              ) : (
                /* Chain + Globe combined: two-layer icon */
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="10" cy="10" r="5" />
                  <path d="M5.5 10h9M10 5c-1 1.4-1.5 3-1.5 5s.5 3.6 1.5 5" />
                  <path d="M3.5 5.5a3 3 0 0 1 4.2-4.2M1.5 8.5A3 3 0 0 0 5 12" strokeWidth="1.6" />
                </svg>
              )}
            </ActionIconBtn>
          ) : (
            /* ── Non-league tabs: original BolaoCore-only button ── */
            <ActionIconBtn
              $color="#ff2e76"
              $state={
                regState === 'confirming' ? 'active' :
                regState === 'loading'    ? 'loading' :
                regState === 'success'    ? 'success' :
                regState === 'error'      ? 'error' : 'idle'
              }
              title={
                regState === 'success' ? '✓ Registered in BolaoCore' :
                regState === 'error'   ? `Error — click to retry` :
                regState === 'confirming' ? 'Cancel' :
                'Register in BolaoCore'
              }
              disabled={regState === 'loading'}
              onClick={() => {
                if (regState === 'idle' || regState === 'success') setRegState('confirming');
                else if (regState === 'confirming' || regState === 'error') handleCancelReg();
              }}
            >
              {regState === 'loading' ? (
                <ActionSpinner $color="#ff2e76" />
              ) : regState === 'success' ? (
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="2 8 6.5 12.5 14 4" />
                </svg>
              ) : (
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6.5 9.5a3.5 3.5 0 0 0 5 0l2-2a3.5 3.5 0 0 0-5-5L7 4" />
                  <path d="M9.5 6.5a3.5 3.5 0 0 0-5 0l-2 2a3.5 3.5 0 0 0 5 5L9 12" />
                </svg>
              )}
            </ActionIconBtn>
          )}

          {/* Register in Oracle — only on SCHEDULED (non-league) */}
          {tab === 'SCHEDULED' && (
            <ActionIconBtn
              $color="#f97316"
              $state={
                oracleRegState === 'confirming' ? 'active' :
                oracleRegState === 'loading'    ? 'loading' :
                oracleRegState === 'success'    ? 'success' :
                oracleRegState === 'error'      ? 'error' : 'idle'
              }
              title={
                oracleRegState === 'success'    ? '✓ Registered in Oracle' :
                oracleRegState === 'error'      ? 'Error — click to retry' :
                oracleRegState === 'confirming' ? 'Cancel' :
                'Register match in Oracle'
              }
              disabled={oracleRegState === 'loading'}
              onClick={() => {
                if (oracleRegState === 'idle' || oracleRegState === 'success') setOracleRegState('confirming');
                else if (oracleRegState === 'confirming' || oracleRegState === 'error') handleCancelOracleReg();
              }}
            >
              {oracleRegState === 'loading' ? (
                <ActionSpinner $color="#f97316" />
              ) : oracleRegState === 'success' ? (
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="2 8 6.5 12.5 14 4" />
                </svg>
              ) : (
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="8" cy="8" r="6.5" />
                  <path d="M1.5 8h13M8 1.5C6.5 3.5 5.5 5.6 5.5 8s1 4.5 2.5 6.5M8 1.5C9.5 3.5 10.5 5.6 10.5 8s-1 4.5-2.5 6.5" />
                </svg>
              )}
            </ActionIconBtn>
          )}

          {/* Feed result to Oracle — only on FINISHED */}
          {tab === 'FINISHED' && (
            <ActionIconBtn
              $color="#f97316"
              $state={
                oracleState === 'confirming' ? 'active' :
                oracleState === 'loading'    ? 'loading' :
                oracleState === 'success'    ? 'success' :
                oracleState === 'error'      ? 'error' : 'idle'
              }
              title={
                oracleState === 'success'    ? '✓ Sent to Oracle' :
                oracleState === 'error'      ? 'Error — click to retry' :
                oracleState === 'confirming' ? 'Cancel' :
                'Send result to Oracle'
              }
              disabled={oracleState === 'loading'}
              onClick={() => {
                if (oracleState === 'idle' || oracleState === 'success') setOracleState('confirming');
                else if (oracleState === 'confirming' || oracleState === 'error') handleCancelOracle();
              }}
            >
              {oracleState === 'loading' ? (
                <ActionSpinner $color="#f97316" />
              ) : oracleState === 'success' ? (
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="2 8 6.5 12.5 14 4" />
                </svg>
              ) : (
                /* Lightning bolt */
                <svg viewBox="0 0 16 16" fill="currentColor">
                  <path d="M9.5 1.5 3.5 9h5L6 14.5l7-8H8.5z" />
                </svg>
              )}
            </ActionIconBtn>
          )}
        </ActionsGroup>
      </MatchRow>

      {/* Meta pills */}
      <MetaRow>
        <Pill $c="#c084fc">{fmtStage(f.stage)}</Pill>
        {f.group && <Pill>{f.group}</Pill>}
        {f.matchday !== null && <Pill>MD {f.matchday}</Pill>}
        <Pill $c="rgba(255,175,210,0.5)">ID {f.id}</Pill>
      </MetaRow>

      {/* Register expand panel */}
      {showRegPanel && (
        <ExpandPanel>
          <PhaseLabel>Phase:</PhaseLabel>
          <PhaseInput
            value={phase}
            onChange={(e) => setPhase(e.target.value)}
            placeholder="e.g. Group Stage"
          />
          <ConfirmBtn onClick={handleRegister} disabled={!phase.trim()}>
            Confirm
          </ConfirmBtn>
          <CancelBtn onClick={handleCancelReg}>Cancel</CancelBtn>
          {regState === 'error' && (
            <StatusChip $variant="error">⚠ {regError}</StatusChip>
          )}
        </ExpandPanel>
      )}

      {/* Oracle register expand panel — SCHEDULED */}
      {showOracleRegPanel && (
        <ExpandPanel>
          <PhaseLabel style={{ color: 'rgba(253,186,116,0.55)' }}>Oracle match ID:</PhaseLabel>
          <PhaseInput
            type="number"
            value={oracleRegId}
            onChange={(e) => setOracleRegId(e.target.value)}
            placeholder={String(f.id)}
            min={1}
            style={{ width: 90, borderColor: 'rgba(249,115,22,0.25)' }}
          />
          <ConfirmBtn
            onClick={handleOracleRegisterMatch}
            disabled={!oracleRegId.trim() || isNaN(Number(oracleRegId))}
            style={{
              borderColor: 'rgba(249,115,22,0.45)',
              background: 'linear-gradient(135deg, rgba(249,115,22,0.22), rgba(249,115,22,0.10))',
            }}
          >
            Confirm
          </ConfirmBtn>
          <CancelBtn onClick={handleCancelOracleReg}>Cancel</CancelBtn>
          {oracleRegState === 'error' && (
            <StatusChip
              $variant="error"
              style={{ borderColor: 'rgba(249,115,22,0.30)', background: 'rgba(249,115,22,0.09)', color: '#f97316' }}
            >
              ⚠ {oracleRegError}
            </StatusChip>
          )}
        </ExpandPanel>
      )}

      {/* Register Both expand panel — league tabs */}
      {showBothPanel && (
        <ExpandPanel style={{ borderColor: 'rgba(34,197,94,0.25)', background: 'rgba(34,197,94,0.05)' }}>
          <PhaseLabel style={{ color: 'rgba(134,239,172,0.7)' }}>Phase:</PhaseLabel>
          <PhaseInput
            value={bothPhase}
            onChange={(e) => setBothPhase(e.target.value)}
            placeholder="e.g. Group Stage"
            style={{ borderColor: 'rgba(34,197,94,0.25)' }}
          />
          <PhaseLabel style={{ color: 'rgba(134,239,172,0.7)', marginLeft: 8 }}>Next Bolao ID:</PhaseLabel>
          <PhaseInput
            type="number"
            value={bothNextId}
            onChange={(e) => setBothNextId(e.target.value)}
            placeholder="e.g. 5"
            min={1}
            style={{ width: 80, borderColor: 'rgba(34,197,94,0.25)' }}
          />
          <ConfirmBtn
            onClick={handleRegisterBoth}
            disabled={!bothPhase.trim() || !bothNextId || isNaN(Number(bothNextId)) || Number(bothNextId) < 1}
            style={{
              borderColor: 'rgba(34,197,94,0.45)',
              background: 'linear-gradient(135deg, rgba(34,197,94,0.22), rgba(34,197,94,0.10))',
            }}
          >
            Confirm
          </ConfirmBtn>
          <CancelBtn onClick={handleCancelBoth}>Cancel</CancelBtn>
          {bothState === 'error' && (
            <StatusChip
              $variant="error"
              style={{ borderColor: 'rgba(34,197,94,0.30)', background: 'rgba(34,197,94,0.09)', color: '#22c55e' }}
            >
              ⚠ {bothError}
            </StatusChip>
          )}
        </ExpandPanel>
      )}

      {/* Oracle feed expand panel — FINISHED */}
      {showOraclePanel && (
        <ExpandPanel>
          <PhaseLabel style={{ color: 'rgba(253,186,116,0.55)' }}>Oracle match ID:</PhaseLabel>
          <PhaseInput
            type="number"
            value={oracleMatchId}
            onChange={(e) => setOracleMatchId(e.target.value)}
            placeholder={String(f.id)}
            min={1}
            style={{ width: 90, borderColor: 'rgba(249,115,22,0.25)' }}
          />
          <ConfirmBtn
            onClick={handleSendToOracle}
            disabled={!oracleMatchId.trim() || isNaN(Number(oracleMatchId))}
            style={{
              borderColor: 'rgba(249,115,22,0.45)',
              background: 'linear-gradient(135deg, rgba(249,115,22,0.22), rgba(249,115,22,0.10))',
            }}
          >
            Confirm
          </ConfirmBtn>
          <CancelBtn onClick={handleCancelOracle}>Cancel</CancelBtn>
          {oracleState === 'error' && (
            <StatusChip
              $variant="error"
              style={{ borderColor: 'rgba(249,115,22,0.30)', background: 'rgba(249,115,22,0.09)', color: '#f97316' }}
            >
              ⚠ {oracleError}
            </StatusChip>
          )}
        </ExpandPanel>
      )}
    </MatchCard>
  );
}

/* ─── Idle / not-loaded state ───────────────────────────── */
const IdleBox = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 56px 24px;
  color: rgba(255, 255, 255, 0.3);
  font-size: 13px;
  text-align: center;
`;

const IdleIcon = styled.span`
  font-size: 28px;
  opacity: 0.5;
`;

/* ─── BolaoCore table ────────────────────────────────────── */
const PHASE_PALETTE = ['#60a5fa','#a78bfa','#34d399','#f97316','#fbbf24','#ec4899','#06b6d4'];
function phaseColor(phase: string): string {
  let h = 0;
  for (let i = 0; i < phase.length; i++) h = (h * 31 + phase.charCodeAt(i)) >>> 0;
  return PHASE_PALETTE[h % PHASE_PALETTE.length];
}

const BolaoTableWrap = styled.div`
  animation: ${fadeUp} 200ms ease;
  width: 100%;
  overflow-x: auto;
`;

const BolaoContractBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 28px 12px;
  background: linear-gradient(90deg, rgba(167,139,250,0.08) 0%, transparent 100%);
  border-bottom: 1px solid rgba(167,139,250,0.12);

  @media (max-width: 580px) { padding: 12px 16px 10px; flex-wrap: wrap; }
`;

const ContractLabel = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`;

const ContractDot = styled.span`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #a78bfa;
  box-shadow: 0 0 8px #a78bfa88;
  flex-shrink: 0;
`;

const ContractName = styled.span`
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.8px;
  text-transform: uppercase;
  color: #a78bfa;
`;

const ContractAddr = styled.span`
  font-size: 11px;
  font-weight: 500;
  color: rgba(255,255,255,0.28);
  font-family: monospace;
`;

const ContractCountBadge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 700;
  background: rgba(167,139,250,0.10);
  border: 1px solid rgba(167,139,250,0.22);
  color: #a78bfa;
  white-space: nowrap;
`;

const BolaoTHead = styled.div`
  display: grid;
  grid-template-columns: 56px 180px 1fr 170px 160px;
  width: 100%;
  padding: 10px 28px;
  background: rgba(167,139,250,0.05);
  border-bottom: 1px solid rgba(255,255,255,0.06);

  @media (max-width: 860px) { grid-template-columns: 48px 140px 1fr 150px; }
  @media (max-width: 580px) { grid-template-columns: 40px 1fr 130px; padding: 8px 16px; }
`;

const BolaoTH = styled.span<{ $hide860?: boolean; $hide580?: boolean }>`
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: rgba(167,139,250,0.45);

  @media (max-width: 860px) { display: ${({ $hide860 }) => ($hide860 ? 'none' : 'block')}; }
  @media (max-width: 580px) { display: ${({ $hide580 }) => ($hide580 ? 'none' : 'block')}; }
`;

const BolaoRow = styled.div`
  display: grid;
  grid-template-columns: 56px 180px 1fr 170px 160px;
  width: 100%;
  padding: 0 28px;
  border-bottom: 1px solid rgba(255,255,255,0.038);
  align-items: stretch;
  cursor: default;
  transition: background 120ms;
  position: relative;

  &::before {
    content: '';
    position: absolute;
    left: 0; top: 0; bottom: 0;
    width: 3px;
    background: transparent;
    transition: background 120ms;
  }

  &:last-child { border-bottom: none; }
  &:hover { background: rgba(167,139,250,0.045); }
  &:hover::before { background: rgba(167,139,250,0.5); }

  @media (max-width: 860px) { grid-template-columns: 48px 140px 1fr 150px; }
  @media (max-width: 580px) { grid-template-columns: 40px 1fr 130px; padding: 0 16px; }
`;

const BolaoCell = styled.div<{ $hide860?: boolean; $hide580?: boolean }>`
  display: flex;
  align-items: center;
  padding: 13px 0;
  min-width: 0;

  @media (max-width: 860px) { display: ${({ $hide860 }) => ($hide860 ? 'none' : 'flex')}; }
  @media (max-width: 580px) { display: ${({ $hide580 }) => ($hide580 ? 'none' : 'flex')}; }
`;

const MatchIdBadge = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  height: 32px;
  padding: 0 6px;
  border-radius: 9px;
  background: rgba(167,139,250,0.10);
  border: 1px solid rgba(167,139,250,0.20);
  font-size: 12px;
  font-weight: 800;
  color: #a78bfa;
  letter-spacing: 0.2px;
`;

const PhasePill = styled.span<{ $color: string }>`
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 160px;
  color: ${({ $color }) => $color};
  background: ${({ $color }) => `${$color}15`};
  border: 1px solid ${({ $color }) => `${$color}28`};
`;

const MatchupWrap = styled.div`
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-width: 0;
`;

const MatchupTeam = styled.span<{ $align: 'left' | 'right' }>`
  font-size: 14px;
  font-weight: 700;
  color: rgba(255,255,255,0.9);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: ${({ $align }) => $align};
`;

const MatchupVs = styled.span`
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 1px;
  color: rgba(255,255,255,0.15);
  text-transform: uppercase;
  flex-shrink: 0;
  padding: 3px 8px;
  border-radius: 4px;
  background: rgba(255,255,255,0.04);
`;

const KickOffText = styled.span`
  font-size: 12px;
  color: rgba(255,255,255,0.45);
  white-space: nowrap;
`;

const ResultBadge = styled.span<{ $color: string }>`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 700;
  color: ${({ $color }) => $color};
  background: ${({ $color }) => `${$color}15`};
  border: 1px solid ${({ $color }) => `${$color}28`};
  box-shadow: 0 0 10px ${({ $color }) => `${$color}18`};
  white-space: nowrap;

  &::before {
    content: '';
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: ${({ $color }) => $color};
    flex-shrink: 0;
  }
`;

const PoolText = styled.span`
  font-size: 12px;
  font-weight: 700;
  color: rgba(255,255,255,0.5);
  white-space: nowrap;
`;

const PoolTextActive = styled(PoolText)`
  background: linear-gradient(90deg, #a78bfa, #60a5fa);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
`;

/* ─── Oracle table (reuses generic chain styles) ────────── */
const ChainTable = styled.div`
  animation: ${fadeUp} 200ms ease;
  width: 100%;
  overflow-x: auto;
`;

const ChainTHead = styled.div`
  display: grid;
  grid-template-columns: 56px 140px 100px 100px 100px 1fr;
  padding: 10px 28px;
  background: rgba(249,115,22,0.05);
  border-bottom: 1px solid rgba(255,255,255,0.06);
  @media (max-width: 700px) { grid-template-columns: 48px 110px 1fr 110px; padding: 8px 16px; }
`;

const ChainTH = styled.span<{ $hide?: boolean }>`
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: rgba(249,115,22,0.40);
  @media (max-width: 700px) { display: ${({ $hide }) => ($hide ? 'none' : 'block')}; }
`;

const ChainRow = styled.div`
  display: grid;
  grid-template-columns: 56px 140px 100px 100px 100px 1fr;
  padding: 0 28px;
  border-bottom: 1px solid rgba(255,255,255,0.038);
  align-items: stretch;
  transition: background 120ms;
  position: relative;
  &::before {
    content: '';
    position: absolute;
    left: 0; top: 0; bottom: 0;
    width: 3px;
    background: transparent;
    transition: background 120ms;
  }
  &:last-child { border-bottom: none; }
  &:hover { background: rgba(249,115,22,0.04); }
  &:hover::before { background: rgba(249,115,22,0.5); }
  @media (max-width: 700px) { grid-template-columns: 48px 110px 1fr 110px; padding: 0 16px; }
`;

const ChainCell = styled.div<{ $hide?: boolean }>`
  display: flex;
  align-items: center;
  padding: 13px 0;
  font-size: 13px;
  color: rgba(255,255,255,0.75);
  min-width: 0;
  @media (max-width: 700px) { display: ${({ $hide }) => ($hide ? 'none' : 'flex')}; }
`;

const ChainIdBadge = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  height: 32px;
  padding: 0 6px;
  border-radius: 9px;
  background: rgba(249,115,22,0.10);
  border: 1px solid rgba(249,115,22,0.20);
  font-size: 12px;
  font-weight: 800;
  color: #f97316;
`;

/* Oracle table: 9 columns — #, Match, Phase, Kick-off, Status, Score, Penalty, Subs, Finalized */
const ORACLE_COLS = '52px 1fr 110px 130px 100px 80px 80px 52px 130px';
const ORACLE_COLS_MOBILE = '44px 1fr 90px 80px';

const OracleTHead = styled.div`
  display: grid;
  grid-template-columns: ${ORACLE_COLS};
  padding: 10px 20px;
  background: rgba(249,115,22,0.05);
  border-bottom: 1px solid rgba(255,255,255,0.06);
  gap: 4px;
  @media (max-width: 800px) { grid-template-columns: ${ORACLE_COLS_MOBILE}; padding: 8px 14px; }
`;

const OracleRow = styled.div`
  display: grid;
  grid-template-columns: ${ORACLE_COLS};
  padding: 0 20px;
  gap: 4px;
  border-bottom: 1px solid rgba(255,255,255,0.038);
  align-items: stretch;
  transition: background 120ms;
  position: relative;
  &::before {
    content: '';
    position: absolute;
    left: 0; top: 0; bottom: 0;
    width: 3px;
    background: transparent;
    transition: background 120ms;
  }
  &:last-child { border-bottom: none; }
  &:hover { background: rgba(249,115,22,0.04); }
  &:hover::before { background: rgba(249,115,22,0.5); }
  @media (max-width: 800px) { grid-template-columns: ${ORACLE_COLS_MOBILE}; padding: 0 14px; }
`;

const OracleTH = styled.span<{ $hide?: boolean }>`
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: rgba(249,115,22,0.40);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  @media (max-width: 800px) { display: ${({ $hide }) => ($hide ? 'none' : 'block')}; }
`;

const OracleCell = styled.div<{ $hide?: boolean }>`
  display: flex;
  align-items: center;
  padding: 12px 0;
  font-size: 13px;
  color: rgba(255,255,255,0.75);
  min-width: 0;
  overflow: hidden;
  @media (max-width: 800px) { display: ${({ $hide }) => ($hide ? 'none' : 'flex')}; }
`;

/* ─── Tournament setup sub-types ────────────────────────── */
interface SyncMatch {
  bolao_match_id: number;
  sports_api_id:  number;
  home_team:      string;
  away_team:      string;
  kick_off:       number;
}

interface SyncResult {
  ok:          boolean;
  dry_run:     boolean;
  phase:       string;
  stage:       string;
  matches:     SyncMatch[];
  registered?: number;
  error?:      string;
}

/* ─── PhaseCard sub-component ───────────────────────────── */
function PhaseCard({ phase }: { phase: WCPhaseSetup }) {
  const [bolaoNextId, setBolaoNextId] = useState(phase.defaultNextId);
  const [dryBusy,    setDryBusy]    = useState(false);
  const [runBusy,    setRunBusy]    = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [preview,    setPreview]    = useState<SyncMatch[] | null>(null);
  const [result,     setResult]     = useState<SyncResult | null>(null);
  const [err,        setErr]        = useState<string | null>(null);

  const callSync = async (dry: boolean) => {
    const res = await fetch(`${ORACLE_BASE}/setup/sync-tournament`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stage:         phase.stage,
        stage_filter:  phase.stage,
        phase_name:    phase.name,
        points_weight: phase.pointsWeight,
        start_time:    phase.startTime,
        end_time:      phase.endTime,
        bolao_next_id: bolaoNextId,
        dry_run:       dry,
      }),
      signal: AbortSignal.timeout(90_000),
    });
    const data: SyncResult = await res.json();
    if (!data.ok) throw new Error(data.error ?? 'Server error');
    return data;
  };

  const handleDryRun = async () => {
    setDryBusy(true);
    setErr(null);
    setResult(null);
    setConfirming(false);
    try {
      const data = await callSync(true);
      setPreview(data.matches ?? []);
    } catch (e: any) {
      setErr(e?.message ?? 'Dry run failed');
      setPreview(null);
    } finally {
      setDryBusy(false);
    }
  };

  const handleRegisterConfirm = async () => {
    setRunBusy(true);
    setErr(null);
    setConfirming(false);
    try {
      const data = await callSync(false);
      setResult(data);
      setPreview(null);
    } catch (e: any) {
      setErr(e?.message ?? 'Registration failed');
    } finally {
      setRunBusy(false);
    }
  };

  const handleRegisterClick = () => {
    if (!confirming) { setConfirming(true); return; }
    void handleRegisterConfirm();
  };

  const busy = dryBusy || runBusy;
  const lastId = bolaoNextId + phase.expectedMatches - 1;

  return (
    <PhaseCardWrap $color={phase.color}>
      <PhaseCardTop>
        <PhaseIconName>
          <PhaseEmoji>{phase.icon}</PhaseEmoji>
          <PhaseName>{phase.name}</PhaseName>
        </PhaseIconName>
        <PhaseDateBadge $color={phase.color}>{phase.dateLabel}</PhaseDateBadge>
      </PhaseCardTop>

      <PhaseMeta>
        <MetaBadge $c={phase.color}>{phase.expectedMatches} matches</MetaBadge>
        <MetaBadge $c='#fbbf24'>&times;{phase.pointsWeight} pts</MetaBadge>
        <MetaBadge>{phase.stage}</MetaBadge>
      </PhaseMeta>

      <PhaseIdRow>
        <IdLabel htmlFor={`nid-${phase.id}`}>BolaoCore next ID</IdLabel>
        <IdInput
          id={`nid-${phase.id}`}
          type='number'
          min={1}
          value={bolaoNextId}
          onChange={e => setBolaoNextId(Number(e.target.value))}
          disabled={busy}
        />
        <IdHint>→ {bolaoNextId}–{lastId}</IdHint>
      </PhaseIdRow>

      <PhaseActions>
        <DryBtn
          $color={phase.color}
          onClick={() => void handleDryRun()}
          disabled={busy}
          title='Preview fixtures without writing to chain'
        >
          {dryBusy
            ? <><SpinRingSmall />Fetching…</>
            : <>
                <svg viewBox='0 0 16 16' fill='none' stroke='currentColor' strokeWidth='1.8'>
                  <circle cx='8' cy='8' r='6.5' />
                  <path d='M8 5v3.5l2.2 2.2' strokeLinecap='round' />
                </svg>
                Dry Run
              </>
          }
        </DryBtn>

        <RegisterBtn
          $color={phase.color}
          $confirming={confirming}
          onClick={handleRegisterClick}
          disabled={busy}
          title={confirming ? 'Click again to confirm on-chain registration' : 'Register phase + all matches on-chain'}
        >
          {runBusy
            ? <><SpinRingSmall />Registering…</>
            : confirming
              ? <>&#9889; Confirm Register</>
              : <>
                  <svg viewBox='0 0 16 16' fill='none' stroke='currentColor' strokeWidth='1.8'>
                    <path d='M3 8.5L6.5 12 13 5' strokeLinecap='round' strokeLinejoin='round' />
                  </svg>
                  Register Phase
                </>
          }
        </RegisterBtn>
      </PhaseActions>

      {(preview || result || err) && (
        <PhaseStatusArea>
          {err && (
            <PhaseStatusChip $variant='error'>&#9888; {err}</PhaseStatusChip>
          )}
          {result && (
            <PhaseStatusChip $variant='success'>
              &#10003; Registered {result.registered ?? result.matches?.length ?? 0} matches
              {' '}for &ldquo;{result.phase}&rdquo;
            </PhaseStatusChip>
          )}
          {preview && preview.length > 0 && !result && (
            <>
              <PhaseStatusChip $variant='preview'>
                Preview &middot; {preview.length} matches &middot; IDs&nbsp;
                {preview[0]?.bolao_match_id}–{preview[preview.length - 1]?.bolao_match_id}
              </PhaseStatusChip>
              <PreviewList>
                {preview.map(m => (
                  <PreviewRow key={m.bolao_match_id}>
                    <PreviewId>#{m.bolao_match_id}</PreviewId>
                    <PreviewTeams>{m.home_team} vs {m.away_team}</PreviewTeams>
                    <PreviewDate>{fmtKickOff(m.kick_off)}</PreviewDate>
                  </PreviewRow>
                ))}
              </PreviewList>
            </>
          )}
        </PhaseStatusArea>
      )}
    </PhaseCardWrap>
  );
}

/* ─── Main Component ─────────────────────────────────────── */
export function AdminFixtures() {
  const { api, isApiReady } = useApi();
  const [tab, setTab] = useState<TabStatus>('SCHEDULED');
  const [matches, setMatches] = useState<WCFixture[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [counts, setCounts] = useState<Record<TabStatus, number>>({
    SCHEDULED: 0,
    IN_PLAY: 0,
    FINISHED: 0,
    BOLAO_CORE: 0,
    ORACLE: 0,
    FRIENDLIES: 0,
    SERIE_A: 0,
    LA_LIGA: 0,
    PORTUGUESA: 0,
    BUNDESLIGA: 0,
    LIGUE_1: 0,
  });

  // ── On-chain state ──────────────────────────────────────
  const [chainMatches, setChainMatches] = useState<any[]>([]);
  const [chainLoading, setChainLoading] = useState(false);
  const [chainError, setChainError] = useState<string | null>(null);

  // ── Oracle state ────────────────────────────────────────
  const [oracleMatches, setOracleMatches] = useState<OracleMatchResult[]>([]);
  const [oracleLoading, setOracleLoading] = useState(false);
  const [oracleError, setOracleError] = useState<string | null>(null);

  // ── Friendlies state ────────────────────────────────────
  const [friendlies, setFriendlies] = useState<WCFixture[]>([]);
  const [friendliesLoading, setFriendliesLoading] = useState(false);
  const [friendliesError, setFriendliesError] = useState<string | null>(null);

  // ── League tabs shared state ─────────────────────────────
  const [leagueMatches, setLeagueMatches] = useState<WCFixture[]>([]);
  const [leagueLoading, setLeagueLoading] = useState(false);
  const [leagueError, setLeagueError] = useState<string | null>(null);

  // ── Tracks which tabs have been loaded at least once ────
  const [loadedTabs, setLoadedTabs] = useState<Set<TabStatus>>(() => new Set());
  const markLoaded = (t: TabStatus) => setLoadedTabs((prev) => new Set([...prev, t]));

  const fetchTab = useCallback(async (status: TabStatus, bust = false) => {
    if (!bust && fixturesCache[status]) {
      setMatches(fixturesCache[status]!);
      setError(null);
      markLoaded(status);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${ORACLE_BASE}/wc/fixtures?status=${status}`, {
        signal: AbortSignal.timeout(8000),
      });
      const data: FixturesResponse = await res.json();
      if (!data.ok) throw new Error(data.error ?? 'Server error');
      fixturesCache[status] = data.matches ?? [];
      setMatches(fixturesCache[status]!);
      setLastUpdated(new Date());
      markLoaded(status);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to fetch');
      setMatches([]);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchAllCounts = useCallback(async (bust = false) => {
    const statuses: TabStatus[] = ['SCHEDULED', 'IN_PLAY', 'FINISHED'];
    if (!bust && statuses.every((s) => countsCache[s] !== undefined)) {
      setCounts((prev) => ({
        ...prev,
        SCHEDULED: countsCache.SCHEDULED ?? 0,
        IN_PLAY: countsCache.IN_PLAY ?? 0,
        FINISHED: countsCache.FINISHED ?? 0,
      }));
      return;
    }
    const settled = await Promise.allSettled(
      statuses.map((s) =>
        fetch(`${ORACLE_BASE}/wc/fixtures?status=${s}`, {
          signal: AbortSignal.timeout(6000),
        }).then((r) => r.json() as Promise<FixturesResponse>),
      ),
    );
    setCounts((prev) => {
      const next = { ...prev };
      settled.forEach((r, i) => {
        if (r.status === 'fulfilled' && r.value.ok) {
          countsCache[statuses[i]] = r.value.count;
          next[statuses[i]] = r.value.count;
        }
      });
      return next;
    });
  }, []);

  const fetchOnChain = useCallback(async () => {
    if (!api || !isApiReady || !BOLAO_PROGRAM_ID) return;
    setChainLoading(true);
    setChainError(null);
    try {
      const svc = new Service(new Program(api, BOLAO_PROGRAM_ID as HexString));
      const state = await (svc as any).queryState();
      const list: any[] = Array.isArray((state as any)?.matches) ? (state as any).matches : [];
      list.sort((a, b) => Number(a.match_id) - Number(b.match_id));
      setChainMatches(list);
      setCounts((prev) => ({ ...prev, ON_CHAIN: list.length }));
      markLoaded('BOLAO_CORE');
    } catch (e: any) {
      setChainError(e?.message ?? 'Failed to read contract state');
      setChainMatches([]);
    } finally {
      setChainLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, isApiReady]);

  const fetchOracle = useCallback(async () => {
    setOracleLoading(true);
    setOracleError(null);
    try {
      const res = await fetch(`${ORACLE_BASE}/oracle/state`, { signal: AbortSignal.timeout(8000) });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? 'Server error');
      const list: OracleMatchResult[] = Array.isArray(data.state?.match_results)
        ? data.state.match_results
        : [];
      list.sort((a, b) => Number(a.match_id) - Number(b.match_id));
      setOracleMatches(list);
      setCounts((prev) => ({ ...prev, ORACLE: list.length }));
      markLoaded('ORACLE');
    } catch (e: any) {
      setOracleError(e?.message ?? 'Failed to fetch oracle state');
      setOracleMatches([]);
    } finally {
      setOracleLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const fetchFriendlies = useCallback(async (bust = false) => {
    if (!bust && friendliesCache) {
      setFriendlies(friendliesCache);
      setCounts((prev) => ({ ...prev, FRIENDLIES: friendliesCache!.length }));
      markLoaded('FRIENDLIES');
      return;
    }
    setFriendliesLoading(true);
    setFriendliesError(null);
    try {
      const res = await fetch(`${ORACLE_BASE}/sports/matches`, {
        signal: AbortSignal.timeout(8000),
      });
      const data: FixturesResponse = await res.json();
      if (!data.ok) throw new Error(data.error ?? 'Server error');
      friendliesCache = data.matches ?? [];
      setFriendlies(friendliesCache);
      setCounts((prev) => ({ ...prev, FRIENDLIES: friendliesCache!.length }));
      setLastUpdated(new Date());
      markLoaded('FRIENDLIES');
    } catch (e: any) {
      setFriendliesError(e?.message ?? 'Failed to fetch friendlies');
      setFriendlies([]);
    } finally {
      setFriendliesLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchLeague = useCallback(async (leagueTab: LeagueTabKey, bust = false) => {
    if (!bust && leagueCache[leagueTab]) {
      setLeagueMatches(leagueCache[leagueTab]!);
      setCounts((prev) => ({ ...prev, [leagueTab]: leagueCache[leagueTab]!.length }));
      markLoaded(leagueTab);
      return;
    }
    setLeagueLoading(true);
    setLeagueError(null);
    try {
      const code = LEAGUE_CONFIG[leagueTab].code;
      const res = await fetch(`${ORACLE_BASE}/sports/competition/${code}/matches`, {
        signal: AbortSignal.timeout(8000),
      });
      const data: FixturesResponse = await res.json();
      if (!data.ok) throw new Error(data.error ?? 'Server error');
      leagueCache[leagueTab] = data.matches ?? [];
      setLeagueMatches(leagueCache[leagueTab]!);
      setCounts((prev) => ({ ...prev, [leagueTab]: leagueCache[leagueTab]!.length }));
      setLastUpdated(new Date());
      markLoaded(leagueTab);
    } catch (e: any) {
      setLeagueError(e?.message ?? 'Failed to fetch league matches');
      setLeagueMatches([]);
    } finally {
      setLeagueLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = () => {
    if (tab === 'BOLAO_CORE') { void fetchOnChain(); return; }
    if (tab === 'ORACLE') { void fetchOracle(); return; }
    if (tab === 'FRIENDLIES') { friendliesCache = null; void fetchFriendlies(true); return; }
    if (isLeagueTab(tab)) { delete leagueCache[tab]; void fetchLeague(tab, true); return; }
    (Object.keys(fixturesCache) as TabStatus[]).forEach((k) => delete fixturesCache[k]);
    (Object.keys(countsCache) as TabStatus[]).forEach((k) => delete countsCache[k]);
    void fetchTab(tab, true);
    void fetchAllCounts(true);
  };

  useEffect(() => {
    if (tab === 'ORACLE' && !loadedTabs.has('ORACLE')) {
      void fetchOracle();
    } else if (tab === 'BOLAO_CORE' && !loadedTabs.has('BOLAO_CORE')) {
      void fetchOnChain();
    } else if (tab === 'FRIENDLIES' && !loadedTabs.has('FRIENDLIES')) {
      void fetchFriendlies();
    } else if (isLeagueTab(tab) && !loadedTabs.has(tab)) {
      void fetchLeague(tab);
    } else if (!isLeagueTab(tab) && tab !== 'BOLAO_CORE' && tab !== 'ORACLE' && tab !== 'FRIENDLIES' && !loadedTabs.has(tab)) {
      void fetchTab(tab);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const groups = groupByStage(matches);

  return (
    <Page>
      <ContentRow>
        {/* ── Tournament Setup Column ────────────────────── */}
        <SetupPanelWrap>
          <SetupPanelHead>
            <div>
              <SetupTitle>Tournament <em>Setup</em></SetupTitle>
              <SetupSub>Register WC 2026 phases &amp; matches on-chain</SetupSub>
            </div>
            <SetupBadge>7 phases · 80 matches</SetupBadge>
          </SetupPanelHead>

          <PhaseGrid>
            {WC2026_PHASES.map(ph => <PhaseCard key={ph.id} phase={ph} />)}
          </PhaseGrid>

          <SetupNote>
            <span style={{ fontSize: 15, flexShrink: 0 }}>&#8505;</span>
            <span>
              <strong>Dry Run</strong> previews fixtures without writing to chain.{' '}
              <strong>Register Phase</strong> requires two clicks to confirm.{' '}
              Adjust <strong>next ID</strong> to match existing contract state.
            </span>
          </SetupNote>
        </SetupPanelWrap>

        {/* ── Fixtures Panel ─────────────────────────────── */}
        <Panel>
          {/* Header */}
          <PanelHead>
          <TitleGroup>
            <Title>WC 2026 <em>Fixtures</em></Title>
            <Sub>Live data · football-data.org · {ORACLE_BASE}</Sub>
          </TitleGroup>
          <HeadActions>
            {lastUpdated && (
              <TimeStamp>
                Updated{' '}
                {lastUpdated.toLocaleTimeString('en-US', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </TimeStamp>
            )}
            <RefreshBtn onClick={refresh} disabled={loading}>
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path
                  d="M1.5 8a6.5 6.5 0 1 0 1.5-4M1.5 1v3h3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Refresh
            </RefreshBtn>
          </HeadActions>
        </PanelHead>

        {/* Tabs */}
        <TabRow>
          {(['SCHEDULED', 'IN_PLAY', 'FINISHED', 'BOLAO_CORE', 'ORACLE', 'FRIENDLIES', ...LEAGUE_TABS] as TabStatus[]).map((s) => (
            <TabBtn key={s} $active={tab === s} $s={s} onClick={() => setTab(s)}>
              {s === 'IN_PLAY' && <LiveDot />}
              {TAB_LABEL[s]}
              <CountChip $active={tab === s} $s={s}>
                {counts[s]}
              </CountChip>
            </TabBtn>
          ))}
        </TabRow>

        {/* Content — Oracle / BolaoCore / WC fixture tabs */}
        {tab !== 'FRIENDLIES' && !isLeagueTab(tab) && (tab === 'ORACLE' ? (
          oracleLoading || (!loadedTabs.has('ORACLE') && !oracleError) ? (
            <CenterBox>
              <SpinRing />
              <span>Reading oracle state…</span>
            </CenterBox>
          ) : oracleError ? (
            <CenterBox>
              <ErrMsg>⚠ {oracleError}</ErrMsg>
              <PageRetryBtn onClick={refresh}>Retry</PageRetryBtn>
            </CenterBox>
          ) : oracleMatches.length === 0 ? (
            <CenterBox>
              <span style={{ fontSize: 30 }}>🔮</span>
              <span>No matches registered in the Oracle yet</span>
            </CenterBox>
          ) : (
            <ChainTable>
              <OracleTHead>
                <OracleTH>#</OracleTH>
                <OracleTH>Match</OracleTH>
                <OracleTH $hide>Phase</OracleTH>
                <OracleTH $hide>Kick-off</OracleTH>
                <OracleTH>Status</OracleTH>
                <OracleTH>Score</OracleTH>
                <OracleTH $hide>Penalty</OracleTH>
                <OracleTH $hide>Subs</OracleTH>
                <OracleTH $hide>Finalized at</OracleTH>
              </OracleTHead>
              {oracleMatches.map((m) => {
                const isPending = m.status === 'Pending';
                const statusColor = isPending ? '#fbbf24' : '#34d399';
                const score = m.final_result?.score;
                const penalty = m.final_result?.penalty_winner ?? null;
                const finalizedAt = m.final_result?.finalized_at ?? null;
                return (
                  <OracleRow key={String(m.match_id)}>
                    <OracleCell>
                      <ChainIdBadge style={{ background: 'rgba(249,115,22,0.12)', border: '1px solid rgba(249,115,22,0.22)', color: '#f97316' }}>
                        {String(m.match_id)}
                      </ChainIdBadge>
                    </OracleCell>
                    <OracleCell style={{ fontWeight: 600, color: 'rgba(255,255,255,0.85)', gap: 4 }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {m.home && m.away ? `${m.home} vs ${m.away}` : '—'}
                      </span>
                    </OracleCell>
                    <OracleCell $hide style={{ color: '#a78bfa', fontSize: 12 }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {m.phase || '—'}
                      </span>
                    </OracleCell>
                    <OracleCell $hide style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>
                      {m.kick_off ? fmtKickOff(m.kick_off) : '—'}
                    </OracleCell>
                    <OracleCell>
                      <ResultBadge $color={statusColor}>{m.status}</ResultBadge>
                    </OracleCell>
                    <OracleCell style={{ fontWeight: 700, color: score ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.28)' }}>
                      {score ? `${score.home}–${score.away}` : '—'}
                    </OracleCell>
                    <OracleCell $hide style={{ color: penalty ? '#f97316' : 'rgba(255,255,255,0.28)', fontSize: 12 }}>
                      {penalty ?? '—'}
                    </OracleCell>
                    <OracleCell $hide style={{ color: '#a78bfa', justifyContent: 'center' }}>
                      {m.submissions}
                    </OracleCell>
                    <OracleCell $hide style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12 }}>
                      {finalizedAt != null ? fmtKickOff(finalizedAt) : '—'}
                    </OracleCell>
                  </OracleRow>
                );
              })}
            </ChainTable>
          )
        ) : tab === 'BOLAO_CORE' ? (
          chainLoading || (!loadedTabs.has('BOLAO_CORE') && !chainError) ? (
            <CenterBox>
              <SpinRing />
              <span>Reading BolaoCore state…</span>
            </CenterBox>
          ) : chainError ? (
            <CenterBox>
              <ErrMsg>⚠ {chainError}</ErrMsg>
              <PageRetryBtn onClick={refresh}>Retry</PageRetryBtn>
            </CenterBox>
          ) : !BOLAO_PROGRAM_ID ? (
            <CenterBox>
              <ErrMsg>⚠ VITE_BOLAOCOREPROGRAM is not set</ErrMsg>
            </CenterBox>
          ) : chainMatches.length === 0 ? (
            <CenterBox>
              <span style={{ fontSize: 30 }}>📋</span>
              <span>No matches registered in BolaoCore yet</span>
            </CenterBox>
          ) : (
            <BolaoTableWrap>
              {/* Contract info bar */}
              <BolaoContractBar>
                <ContractLabel>
                  <ContractDot />
                  <ContractName>BolaoCore</ContractName>
                  <ContractAddr>
                    {BOLAO_PROGRAM_ID
                      ? `${BOLAO_PROGRAM_ID.slice(0, 6)}…${BOLAO_PROGRAM_ID.slice(-6)}`
                      : ''}
                  </ContractAddr>
                </ContractLabel>
                <ContractCountBadge>
                  {chainMatches.length} match{chainMatches.length !== 1 ? 'es' : ''} registered
                </ContractCountBadge>
              </BolaoContractBar>

              {/* Column headers */}
              <BolaoTHead>
                <BolaoTH>#</BolaoTH>
                <BolaoTH $hide580>Phase</BolaoTH>
                <BolaoTH>Match</BolaoTH>
                <BolaoTH $hide860>Kick-off</BolaoTH>
                <BolaoTH>Status</BolaoTH>
              </BolaoTHead>

              {/* Rows */}
              {chainMatches.map((m: any) => {
                const res = resultLabel(m.result);
                const pool = BigInt(m.match_prize_pool ?? 0);
                const hasPool = pool > 0n;
                const poolVara = hasPool
                  ? `${(Number(pool) / 1e12).toFixed(2)} VARA`
                  : null;
                const pColor = phaseColor(String(m.phase));
                return (
                  <BolaoRow key={String(m.match_id)}>
                    {/* ID */}
                    <BolaoCell>
                      <MatchIdBadge>{String(m.match_id)}</MatchIdBadge>
                    </BolaoCell>

                    {/* Phase */}
                    <BolaoCell $hide580>
                      <PhasePill $color={pColor}>{String(m.phase)}</PhasePill>
                    </BolaoCell>

                    {/* Matchup */}
                    <BolaoCell>
                      <MatchupWrap>
                        <MatchupTeam $align="right">{String(m.home)}</MatchupTeam>
                        <MatchupVs>VS</MatchupVs>
                        <MatchupTeam $align="left">{String(m.away)}</MatchupTeam>
                      </MatchupWrap>
                    </BolaoCell>

                    {/* Kick-off */}
                    <BolaoCell $hide860>
                      <KickOffText>{fmtKickOff(m.kick_off)}</KickOffText>
                    </BolaoCell>

                    {/* Status + Pool */}
                    <BolaoCell style={{ gap: 8, flexWrap: 'wrap' }}>
                      <ResultBadge $color={res.color}>{res.text}</ResultBadge>
                      {hasPool && poolVara && (
                        <PoolTextActive>{poolVara}</PoolTextActive>
                      )}
                    </BolaoCell>
                  </BolaoRow>
                );
              })}
            </BolaoTableWrap>
          )
        ) : (
          /* Content — WC fixture tabs */
          !loadedTabs.has(tab) && !loading ? (
            <IdleBox>
              <IdleIcon>📅</IdleIcon>
              <span>Press <strong>Refresh</strong> to load {TAB_LABEL[tab].toLowerCase()} fixtures</span>
            </IdleBox>
          ) : loading ? (
            <CenterBox>
              <SpinRing />
              <span>Fetching fixtures…</span>
            </CenterBox>
          ) : error ? (
            <CenterBox>
              <ErrMsg>⚠ {error}</ErrMsg>
              <PageRetryBtn onClick={refresh}>Retry</PageRetryBtn>
            </CenterBox>
          ) : matches.length === 0 ? (
            <CenterBox>
              <span style={{ fontSize: 30 }}>
                {tab === 'IN_PLAY' ? '📺' : tab === 'SCHEDULED' ? '📅' : '✅'}
              </span>
              <span>No {TAB_LABEL[tab].toLowerCase()} matches right now</span>
            </CenterBox>
          ) : (
            <MatchList>
              {groups.map(({ stage, items }) => (
                <React.Fragment key={stage}>
                  <StageHeader>{fmtStage(stage)}</StageHeader>
                  {items.map((f) => (
                    <MatchItem key={f.id} fixture={f} tab={tab as any} />
                  ))}
                </React.Fragment>
              ))}
            </MatchList>
          )
        ))}

        {/* Content — Friendlies (Today) tab */}
        {tab === 'FRIENDLIES' && (
          !loadedTabs.has('FRIENDLIES') && !friendliesLoading ? (
            <IdleBox>
              <IdleIcon>📆</IdleIcon>
              <span>Press <strong>Refresh</strong> to load today's matches (next 14 days)</span>
            </IdleBox>
          ) : friendliesLoading ? (
            <CenterBox>
              <SpinRing />
              <span>Fetching today's matches…</span>
            </CenterBox>
          ) : friendliesError ? (
            <CenterBox>
              <ErrMsg>⚠ {friendliesError}</ErrMsg>
              <PageRetryBtn onClick={refresh}>Retry</PageRetryBtn>
            </CenterBox>
          ) : friendlies.length === 0 ? (
            <CenterBox>
              <span style={{ fontSize: 30 }}>📆</span>
              <span>No matches in the next 14 days</span>
            </CenterBox>
          ) : (
            <MatchList>
              {groupByCompetition(friendlies).map(({ label, items }) => (
                <React.Fragment key={label}>
                  <StageHeader>{label}</StageHeader>
                  {items.map((f) => (
                    <MatchItem key={f.id} fixture={f} tab="FRIENDLIES" />
                  ))}
                </React.Fragment>
              ))}
            </MatchList>
          )
        )}

        {/* Content — League tabs (Serie A, La Liga, Liga Portugal, Bundesliga, Ligue 1) */}
        {isLeagueTab(tab) && (
          !loadedTabs.has(tab) && !leagueLoading ? (
            <IdleBox>
              <IdleIcon>⚽</IdleIcon>
              <span>Press <strong>Refresh</strong> to load {TAB_LABEL[tab]} matches (next 15 days)</span>
            </IdleBox>
          ) : leagueLoading ? (
            <CenterBox>
              <SpinRing />
              <span>Fetching {TAB_LABEL[tab]} matches…</span>
            </CenterBox>
          ) : leagueError ? (
            <CenterBox>
              <ErrMsg>⚠ {leagueError}</ErrMsg>
              <PageRetryBtn onClick={refresh}>Retry</PageRetryBtn>
            </CenterBox>
          ) : leagueMatches.length === 0 ? (
            <CenterBox>
              <span style={{ fontSize: 30 }}>⚽</span>
              <span>No {TAB_LABEL[tab]} matches in the next 15 days</span>
            </CenterBox>
          ) : (
            <MatchList>
              {groupByCompetition(leagueMatches).map(({ label, items }) => (
                <React.Fragment key={label}>
                  <StageHeader>{label}</StageHeader>
                  {items.map((f) => (
                    <MatchItem key={f.id} fixture={f} tab={tab} />
                  ))}
                </React.Fragment>
              ))}
            </MatchList>
          )
        )}
        </Panel>
      </ContentRow>
    </Page>
  );
}
