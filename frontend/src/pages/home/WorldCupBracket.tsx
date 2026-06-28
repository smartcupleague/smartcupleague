import { TeamFlag } from '@/components/common/TeamFlag';
import { WORLD_CUP_TEAM_LABELS } from '@/utils/teams';
import { useEffect, useMemo, useState } from 'react';

type BracketMatch = {
  match_id: string | number;
  phase: string;
  home: string;
  away: string;
  kick_off: number;
  result: any;
  bracket_stage?: string;
  bracket_side?: string;
  bracket_slot?: number | string;
  bracketStage?: string;
  bracketSide?: string;
  bracketSlot?: number | string;
};

type BracketStageId = 'r32' | 'r16' | 'qf' | 'sf' | 'final' | 'third';
type BracketSide = 'left' | 'right' | 'center';
type BracketFeederRule = 'winner' | 'loser';

type BracketSchedule = {
  kickoffMs: number;
  timeZone: string;
  zoneLabel: string;
  venue: string;
};

type BracketStage = {
  id: BracketStageId;
  label: string;
  shortLabel: string;
};

type BracketSlot = {
  key: string;
  index: number;
  stageId: BracketStageId;
  side: BracketSide;
  matchId?: number;
  feederMatchIds?: number[];
  feederRule?: BracketFeederRule;
  schedule?: BracketSchedule;
  match: BracketMatch | null;
};

type BracketTemplateSlot = Omit<BracketSlot, 'match'>;

type Props = {
  matches: BracketMatch[];
  predictedMatchIds: Set<string>;
  onMatchClick: (match: BracketMatch) => void;
};

const BRACKET_STAGES: BracketStage[] = [
  { id: 'r32', label: 'Round of 32', shortLabel: 'R32' },
  { id: 'r16', label: 'Round of 16', shortLabel: 'R16' },
  { id: 'qf', label: 'Quarter Finals', shortLabel: 'QF' },
  { id: 'sf', label: 'Semi Finals', shortLabel: 'SM' },
  { id: 'final', label: 'Final', shortLabel: 'F' },
  { id: 'third', label: 'Third Place', shortLabel: '3rd' },
];

const SIDE_STAGE_IDS: BracketStageId[] = ['r32', 'r16', 'qf', 'sf'];
const BRACKET_STAGE_BY_ID = new Map(BRACKET_STAGES.map((stage) => [stage.id, stage]));

function range(start: number, end: number) {
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function kickoffAt(isoWithOffset: string) {
  return new Date(isoWithOffset).getTime();
}

function bracketSchedule(isoWithOffset: string, timeZone: string, zoneLabel: string, venue: string): BracketSchedule {
  return {
    kickoffMs: kickoffAt(isoWithOffset),
    timeZone,
    zoneLabel,
    venue,
  };
}

const BRACKET_SCHEDULE: Record<number, BracketSchedule> = {
  73: bracketSchedule('2026-06-28T21:00:00-07:00', 'America/Los_Angeles', 'PDT', 'Los Angeles'),
  74: bracketSchedule('2026-06-29T19:00:00-05:00', 'America/Chicago', 'CDT', 'Houston'),
  75: bracketSchedule('2026-06-29T22:30:00-04:00', 'America/New_York', 'EDT', 'Boston'),
  76: bracketSchedule('2026-06-30T03:00:00-06:00', 'America/Monterrey', 'CST', 'Monterrey'),
  77: bracketSchedule('2026-06-30T19:00:00-05:00', 'America/Chicago', 'CDT', 'Dallas'),
  78: bracketSchedule('2026-06-30T23:00:00-04:00', 'America/New_York', 'EDT', 'New York/New Jersey'),
  79: bracketSchedule('2026-07-01T03:00:00-06:00', 'America/Mexico_City', 'CST', 'Mexico City'),
  80: bracketSchedule('2026-07-01T18:00:00-04:00', 'America/New_York', 'EDT', 'Atlanta'),
  81: bracketSchedule('2026-07-01T22:00:00-07:00', 'America/Los_Angeles', 'PDT', 'Seattle'),
  82: bracketSchedule('2026-07-02T02:00:00-07:00', 'America/Los_Angeles', 'PDT', 'San Francisco Bay Area'),
  83: bracketSchedule('2026-07-02T21:00:00-07:00', 'America/Los_Angeles', 'PDT', 'Los Angeles'),
  84: bracketSchedule('2026-07-03T01:00:00-04:00', 'America/Toronto', 'EDT', 'Toronto'),
  85: bracketSchedule('2026-07-03T05:00:00-07:00', 'America/Vancouver', 'PDT', 'Vancouver'),
  86: bracketSchedule('2026-07-03T20:00:00-05:00', 'America/Chicago', 'CDT', 'Dallas'),
  87: bracketSchedule('2026-07-04T00:00:00-04:00', 'America/New_York', 'EDT', 'Miami'),
  88: bracketSchedule('2026-07-04T03:30:00-05:00', 'America/Chicago', 'CDT', 'Kansas City'),
  89: bracketSchedule('2026-07-04T19:00:00-05:00', 'America/Chicago', 'CDT', 'Houston'),
  90: bracketSchedule('2026-07-04T23:00:00-04:00', 'America/New_York', 'EDT', 'Philadelphia'),
  91: bracketSchedule('2026-07-05T22:00:00-04:00', 'America/New_York', 'EDT', 'New York/New Jersey'),
  92: bracketSchedule('2026-07-06T02:00:00-06:00', 'America/Mexico_City', 'CST', 'Mexico City'),
  93: bracketSchedule('2026-07-06T21:00:00-05:00', 'America/Chicago', 'CDT', 'Dallas'),
  94: bracketSchedule('2026-07-07T02:00:00-07:00', 'America/Los_Angeles', 'PDT', 'Seattle'),
  95: bracketSchedule('2026-07-07T18:00:00-04:00', 'America/New_York', 'EDT', 'Atlanta'),
  96: bracketSchedule('2026-07-07T22:00:00-07:00', 'America/Vancouver', 'PDT', 'Vancouver'),
  97: bracketSchedule('2026-07-09T22:00:00-04:00', 'America/New_York', 'EDT', 'Boston'),
  98: bracketSchedule('2026-07-10T21:00:00-07:00', 'America/Los_Angeles', 'PDT', 'Los Angeles'),
  99: bracketSchedule('2026-07-11T23:00:00-04:00', 'America/New_York', 'EDT', 'Miami'),
  100: bracketSchedule('2026-07-12T03:00:00-05:00', 'America/Chicago', 'CDT', 'Kansas City'),
  101: bracketSchedule('2026-07-14T21:00:00-05:00', 'America/Chicago', 'CDT', 'Dallas'),
  102: bracketSchedule('2026-07-15T21:00:00-04:00', 'America/New_York', 'EDT', 'Atlanta'),
  103: bracketSchedule('2026-07-18T23:00:00-04:00', 'America/New_York', 'EDT', 'Miami'),
  104: bracketSchedule('2026-07-19T21:00:00-04:00', 'America/New_York', 'EDT', 'New York/New Jersey'),
};

function makeTemplateSlots(
  stageId: BracketStageId,
  side: BracketSide,
  matchIds: number[],
  feederPairs: number[][] = []
): BracketTemplateSlot[] {
  return matchIds.map((matchId, index) => ({
    key: `${stageId}-${side}-${index + 1}`,
    index,
    stageId,
    side,
    matchId,
    feederMatchIds: feederPairs[index],
    feederRule: stageId === 'third' ? 'loser' : 'winner',
    schedule: BRACKET_SCHEDULE[matchId],
  }));
}

export const BRACKET_TEMPLATE: BracketTemplateSlot[] = [
  ...makeTemplateSlots('r32', 'left', [75, 78, 73, 76, 84, 83, 82, 81]),
  ...makeTemplateSlots('r16', 'left', range(89, 92), [
    [75, 78],
    [73, 76],
    [84, 83],
    [82, 81],
  ]),
  ...makeTemplateSlots('qf', 'left', range(97, 98), [
    [89, 90],
    [91, 92],
  ]),
  ...makeTemplateSlots('sf', 'left', [101], [[97, 98]]),
  ...makeTemplateSlots('final', 'center', [104], [[101, 102]]),
  ...makeTemplateSlots('third', 'center', [103], [[101, 102]]),
  ...makeTemplateSlots('sf', 'right', [102], [[99, 100]]),
  ...makeTemplateSlots('qf', 'right', range(99, 100), [
    [93, 94],
    [95, 96],
  ]),
  ...makeTemplateSlots('r16', 'right', range(93, 96), [
    [74, 77],
    [79, 80],
    [87, 86],
    [85, 88],
  ]),
  ...makeTemplateSlots('r32', 'right', [74, 77, 79, 80, 87, 86, 85, 88]),
];

function normalizePhase(phase: string) {
  return String(phase ?? '')
    .trim()
    .toUpperCase()
    .replace(/[-\s]+/g, '_');
}

function getStageId(phase: string): BracketStageId | null {
  const normalized = normalizePhase(phase);
  if (normalized.includes('THIRD')) return 'third';
  if (normalized === 'FINAL') return 'final';
  if (normalized.includes('SEMI')) return 'sf';
  if (normalized.includes('QUARTER')) return 'qf';
  if (normalized.includes('16')) return 'r16';
  if (normalized.includes('32')) return 'r32';
  return null;
}

function normalizeBracketSide(side: string | undefined): BracketSide | null {
  const normalized = String(side ?? '').trim().toLowerCase();
  if (normalized === 'left' || normalized === 'right' || normalized === 'center') return normalized;
  return null;
}

function normalizeBracketStage(stage: string | undefined): BracketStageId | null {
  const normalized = String(stage ?? '').trim().toLowerCase();
  if (normalized === 'round_of_32' || normalized === 'r32') return 'r32';
  if (normalized === 'round_of_16' || normalized === 'r16') return 'r16';
  if (normalized === 'quarter_finals' || normalized === 'quarter_final' || normalized === 'qf') return 'qf';
  if (normalized === 'semi_finals' || normalized === 'semi_final' || normalized === 'sf' || normalized === 'sm') return 'sf';
  if (normalized === 'final') return 'final';
  if (normalized === 'third_place' || normalized === 'third' || normalized === '3rd') return 'third';
  return null;
}

function getMatchStageId(match: BracketMatch): BracketStageId | null {
  return normalizeBracketStage(match.bracket_stage ?? match.bracketStage) ?? getStageId(match.phase);
}

function displayTeamName(team: string) {
  return WORLD_CUP_TEAM_LABELS[team] ?? team;
}

function kickOffToMs(input: number) {
  if (!input || !Number.isFinite(input)) return 0;
  return input < 10_000_000_000 ? input * 1000 : input;
}

function formatBracketTime(input: number) {
  const ms = kickOffToMs(input);
  if (!ms) return 'Kick-off TBD';
  const date = new Date(ms);
  const day = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const time = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return `${day} · ${time}`;
}

function formatPlaceholderTime(schedule: BracketSchedule) {
  return formatBracketTime(schedule.kickoffMs);
}

function formatCountdown(targetMs: number, nowMs: number) {
  const diff = targetMs - nowMs;
  if (diff <= 0) return 'Scheduled';

  const totalMinutes = Math.ceil(diff / 60_000);
  const days = Math.floor(totalMinutes / 1_440);
  const hours = Math.floor((totalMinutes % 1_440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `Starts in ${days}d ${hours}h`;
  if (hours > 0) return `Starts in ${hours}h ${minutes}m`;
  return `Starts in ${minutes}m`;
}

function getPlaceholderLabel(slot: BracketSlot) {
  if (!slot.feederMatchIds?.length) return slot.matchId ? `Match #${slot.matchId}` : 'TBD';
  const prefix = slot.feederRule === 'loser' ? 'RU' : 'W';
  return slot.feederMatchIds.map((matchId) => `${prefix}${matchId}`).join(' vs ');
}

function getFinalizedResult(result: unknown): { score?: { home: number; away: number }; penaltyWinner: 'Home' | 'Away' | null } {
  const finalized = (result as any)?.Finalized ?? (result as any)?.finalized;
  const score = finalized?.score;
  const rawPenaltyWinner = finalized?.penalty_winner ?? null;
  const penaltyWinner =
    rawPenaltyWinner === 'Home' || (typeof rawPenaltyWinner === 'object' && rawPenaltyWinner && 'Home' in rawPenaltyWinner)
      ? 'Home'
      : rawPenaltyWinner === 'Away' || (typeof rawPenaltyWinner === 'object' && rawPenaltyWinner && 'Away' in rawPenaltyWinner)
        ? 'Away'
        : null;

  if (!score) return { penaltyWinner };
  return {
    score: {
      home: Number(score.home ?? 0) || 0,
      away: Number(score.away ?? 0) || 0,
    },
    penaltyWinner,
  };
}

function getWinner(match: BracketMatch): 'home' | 'away' | null {
  const { score, penaltyWinner } = getFinalizedResult(match.result);
  if (!score) return null;
  if (score.home > score.away) return 'home';
  if (score.away > score.home) return 'away';
  if (penaltyWinner === 'Home') return 'home';
  if (penaltyWinner === 'Away') return 'away';
  return null;
}

function getMatchStatus(match: BracketMatch) {
  const { score } = getFinalizedResult(match.result);
  if (score) return 'Final';
  const kickoff = kickOffToMs(Number(match.kick_off));
  if (kickoff && kickoff <= Date.now()) return 'Pending';
  return 'Open';
}

function getTemplateStageSlots(stageId: BracketStageId) {
  const sideOrder: Record<BracketSide, number> = { left: 0, center: 1, right: 2 };
  return BRACKET_TEMPLATE.filter((slot) => slot.stageId === stageId).sort((a, b) => {
    const sideDiff = sideOrder[a.side] - sideOrder[b.side];
    return sideDiff || a.index - b.index;
  });
}

function getSlotIndexFromMatch(match: BracketMatch, maxSlots: number) {
  const slot = Number(match.bracket_slot ?? match.bracketSlot);
  if (!Number.isInteger(slot)) return null;
  if (slot === 0) return 0;
  if (slot >= 1 && slot <= maxSlots) return slot - 1;
  return null;
}

function getHydratedStageSlots(stageId: BracketStageId, matches: BracketMatch[]): BracketSlot[] {
  const templateSlots = getTemplateStageSlots(stageId);
  const hydratedSlots: BracketSlot[] = templateSlots.map((slot) => ({ ...slot, match: null }));
  const stageMatches = matches
    .filter((match) => getMatchStageId(match) === stageId)
    .sort((a, b) => {
      const aId = Number(a.match_id);
      const bId = Number(b.match_id);
      if (Number.isFinite(aId) && Number.isFinite(bId) && aId !== bId) return aId - bId;
      return kickOffToMs(Number(a.kick_off)) - kickOffToMs(Number(b.kick_off));
    });

  const placed = new Set<BracketMatch>();

  for (const match of stageMatches) {
    const explicitSide = normalizeBracketSide(match.bracket_side ?? match.bracketSide);
    const explicitIndex = getSlotIndexFromMatch(match, hydratedSlots.length);
    const explicitSlot = hydratedSlots.find((slot) => slot.side === explicitSide && slot.index === explicitIndex);
    if (!explicitSlot || explicitSlot.match) continue;
    explicitSlot.match = match;
    placed.add(match);
  }

  for (const slot of hydratedSlots) {
    if (slot.match || !slot.matchId) continue;
    const match = stageMatches.find((candidate) => !placed.has(candidate) && Number(candidate.match_id) === slot.matchId);
    if (!match) continue;
    slot.match = match;
    placed.add(match);
  }

  for (const match of stageMatches) {
    if (placed.has(match)) continue;
    const openSlot = hydratedSlots.find((slot) => !slot.match);
    if (!openSlot) {
      const overflowSide: BracketSide = stageId === 'final' || stageId === 'third' ? 'center' : 'right';
      hydratedSlots.push({
        key: `${stageId}-${overflowSide}-overflow-${String(match.match_id)}`,
        index: hydratedSlots.filter((slot) => slot.side === overflowSide).length,
        stageId,
        side: overflowSide,
        match,
      });
      placed.add(match);
      continue;
    }
    openSlot.match = match;
    placed.add(match);
  }

  return hydratedSlots;
}

function getHydratedSlots(stageId: BracketStageId, side: BracketSide, matches: BracketMatch[]): BracketSlot[] {
  return getHydratedStageSlots(stageId, matches)
    .filter((slot) => slot.side === side)
    .sort((a, b) => a.index - b.index);
}

function getStage(stageId: BracketStageId) {
  const stage = BRACKET_STAGE_BY_ID.get(stageId);
  if (!stage) throw new Error(`Missing bracket stage: ${stageId}`);
  return stage;
}

function getSideSlots(stage: BracketStage, side: 'left' | 'right', matches: BracketMatch[]) {
  return getHydratedSlots(stage.id, side, matches);
}

function getBracketGridRow(stageId: BracketStageId, slotIndex: number) {
  if (stageId === 'r32') return `${slotIndex * 2 + 1} / span 2`;
  if (stageId === 'r16') return `${slotIndex * 4 + 2} / span 2`;
  if (stageId === 'qf') return `${slotIndex * 8 + 4} / span 2`;
  if (stageId === 'sf') return '8 / span 2';
  return undefined;
}

function TeamRow({ team, side, match }: { team: string; side: 'home' | 'away'; match: BracketMatch }) {
  const { score } = getFinalizedResult(match.result);
  const winner = getWinner(match);
  const scoreValue = score ? score[side] : null;

  return (
    <span className={'h-bracketTeam' + (winner === side ? ' h-bracketTeam--winner' : '')}>
      <TeamFlag team={team} className="h-flag h-bracketTeam__flag" />
      <span className="h-bracketTeam__name">{displayTeamName(team)}</span>
      {scoreValue !== null ? <span className="h-bracketTeam__score">{scoreValue}</span> : null}
    </span>
  );
}

function MatchNode({
  slot,
  predicted,
  nowMs,
  onMatchClick,
}: {
  slot: BracketSlot;
  predicted: boolean;
  nowMs: number;
  onMatchClick: (match: BracketMatch) => void;
}) {
  if (!slot.match) {
    const placeholderLabel = getPlaceholderLabel(slot);
    return (
      <div className="h-bracketNode h-bracketNode--tbd" aria-label={`${placeholderLabel} fixture placeholder`}>
        <span className="h-bracketNode__placeholder">{placeholderLabel}</span>
        <span className="h-bracketNode__meta">{slot.schedule?.venue ?? 'Awaiting fixture'}</span>
        {slot.schedule ? (
          <span className="h-bracketNode__foot">
            <span className="h-bracketNode__time">{formatPlaceholderTime(slot.schedule)}</span>
            <span className="h-bracketNode__status h-bracketNode__status--scheduled">
              {formatCountdown(slot.schedule.kickoffMs, nowMs)}
            </span>
          </span>
        ) : null}
      </div>
    );
  }

  const status = getMatchStatus(slot.match);
  const isFinal = status === 'Final';

  return (
    <button
      className={
        'h-bracketNode h-bracketNode--match' +
        (predicted ? ' h-bracketNode--predicted' : '') +
        (isFinal ? ' h-bracketNode--final' : '')
      }
      type="button"
      onClick={() => onMatchClick(slot.match!)}
      aria-label={`${displayTeamName(slot.match.home)} versus ${displayTeamName(slot.match.away)}, ${status}`}>
      <span className="h-bracketNode__teams">
        <TeamRow team={slot.match.home} side="home" match={slot.match} />
        <TeamRow team={slot.match.away} side="away" match={slot.match} />
      </span>
      <span className="h-bracketNode__foot">
        <span className="h-bracketNode__time">{formatBracketTime(Number(slot.match.kick_off))}</span>
        <span className={`h-bracketNode__status h-bracketNode__status--${status.toLowerCase()}`}>{status}</span>
        {predicted ? <span className="h-bracketNode__predicted">Predicted</span> : null}
      </span>
    </button>
  );
}

function StageColumn({
  stage,
  side,
  matches,
  predictedMatchIds,
  nowMs,
  onMatchClick,
}: {
  stage: BracketStage;
  side: 'left' | 'right';
  matches: BracketMatch[];
  predictedMatchIds: Set<string>;
  nowMs: number;
  onMatchClick: (match: BracketMatch) => void;
}) {
  const slots = getSideSlots(stage, side, matches);
  const filled = slots.filter((slot) => !!slot.match).length;

  return (
    <section className={`h-bracketStage h-bracketStage--${stage.id} h-bracketStage--${side}`} aria-label={`${stage.label} ${side} side`}>
      <div className="h-bracketStage__head">
        <span>{stage.shortLabel}</span>
        <b>{filled}/{slots.length}</b>
      </div>
      <div className="h-bracketStage__slots">
        {slots.map((slot, index) => (
          <div className="h-bracketSlot" key={`${side}-${slot.key}`} style={{ gridRow: getBracketGridRow(stage.id, index) }}>
            <MatchNode
              slot={slot}
              predicted={!!slot.match && predictedMatchIds.has(String(slot.match.match_id))}
              nowMs={nowMs}
              onMatchClick={onMatchClick}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

function CenterColumn({
  matches,
  predictedMatchIds,
  nowMs,
  onMatchClick,
}: {
  matches: BracketMatch[];
  predictedMatchIds: Set<string>;
  nowMs: number;
  onMatchClick: (match: BracketMatch) => void;
}) {
  const finalStage = getStage('final');
  const thirdStage = getStage('third');
  const finalSlots = getHydratedSlots(finalStage.id, 'center', matches);
  const thirdSlots = getHydratedSlots(thirdStage.id, 'center', matches);
  const filled = [...finalSlots, ...thirdSlots].filter((slot) => !!slot.match).length;

  return (
    <section className="h-bracketStage h-bracketStage--center" aria-label="Final and third place">
      <div className="h-bracketStage__head h-bracketStage__head--center">
        <span>Final / 3rd</span>
        <b>{filled}/2</b>
      </div>
      <div className="h-bracketStage__slots h-bracketStage__slots--center">
        <div className="h-bracketFinalCluster">
          <div className="h-bracketFinalGroup h-bracketFinalGroup--final">
            <span className="h-bracketFinalGroup__label">Final</span>
            {finalSlots.map((slot) => (
              <MatchNode
                key={`center-final-${slot.key}`}
                slot={slot}
                predicted={!!slot.match && predictedMatchIds.has(String(slot.match.match_id))}
                nowMs={nowMs}
                onMatchClick={onMatchClick}
              />
            ))}
          </div>
          <div className="h-bracketFinalGroup h-bracketFinalGroup--third">
            <span className="h-bracketFinalGroup__label">3rd Place</span>
            {thirdSlots.map((slot) => (
              <MatchNode
                key={`center-third-${slot.key}`}
                slot={slot}
                predicted={!!slot.match && predictedMatchIds.has(String(slot.match.match_id))}
                nowMs={nowMs}
                onMatchClick={onMatchClick}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function WorldCupBracket({ matches, predictedMatchIds, onMatchClick }: Props) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const knockoutMatches = matches.filter((match) => getMatchStageId(match));
  const registeredCount = knockoutMatches.length;
  const totalSlots = BRACKET_TEMPLATE.length;
  const scheduledSlotCount = useMemo(() => BRACKET_TEMPLATE.filter((slot) => slot.schedule).length, []);

  useEffect(() => {
    const interval = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <>
      <div className="h-card__head h-bracketHead">
        <div>
          <h3>Road to the Final</h3>
          <p>Follow the knockout path from Round of 32 to the World Cup Final.</p>
        </div>
        <span className="h-bracketHead__badge">{registeredCount}/{totalSlots} registered · {scheduledSlotCount} scheduled</span>
      </div>

      <div className="h-bracket" role="region" tabIndex={0} aria-label="World Cup knockout bracket">
        {registeredCount === 0 ? (
          <div className="h-bracket__notice">
            Scheduled placeholders use your local time until fixtures are registered.
          </div>
        ) : null}

        <div className="h-bracket__stages">
          {SIDE_STAGE_IDS.map((stageId) => (
            <StageColumn
              key={`left-${stageId}`}
              stage={getStage(stageId)}
              side="left"
              matches={matches}
              predictedMatchIds={predictedMatchIds}
              nowMs={nowMs}
              onMatchClick={onMatchClick}
            />
          ))}
          <CenterColumn matches={matches} predictedMatchIds={predictedMatchIds} nowMs={nowMs} onMatchClick={onMatchClick} />
          {[...SIDE_STAGE_IDS].reverse().map((stageId) => (
            <StageColumn
              key={`right-${stageId}`}
              stage={getStage(stageId)}
              side="right"
              matches={matches}
              predictedMatchIds={predictedMatchIds}
              nowMs={nowMs}
              onMatchClick={onMatchClick}
            />
          ))}
        </div>
      </div>
    </>
  );
}
