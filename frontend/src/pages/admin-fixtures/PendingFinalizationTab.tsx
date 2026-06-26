import React, { useCallback, useEffect, useRef, useState } from 'react';
import styled, { keyframes } from 'styled-components';

/* ────────────────────────────────────────────────────────────────────
   Types — mirroring the server-side PendingMatchEntry shape
   ──────────────────────────────────────────────────────────────────── */

type CaseLabel = 'PROPOSED' | 'CASE_1' | 'CASE_2_OR_3B' | 'CASE_3A';
type ValidateState = 'idle' | 'checking' | 'landed' | 'not-landed' | 'too-early' | 'info';

interface PendingScore {
  home: number;
  away: number;
}

export interface PendingMatch {
  match_id: number;
  home: string;
  away: string;
  phase: string;
  is_knockout: boolean;
  kick_off: number;
  bolao_status: 'Unresolved' | 'Proposed';
  bolao_proposed_score: PendingScore | null;
  bolao_proposed_deadline: number | null;
  oracle_status: 'Pending' | 'Finalized' | null;
  oracle_score: PendingScore | null;
  oracle_penalty_winner: string | null;
  oracle_submissions: number;
  case_label: CaseLabel;
  available_actions: string[];
  null_join: boolean;
}

interface PendingFinalizationResponse {
  ok: boolean;
  generated_at: string;
  matches: PendingMatch[];
  error?: string;
}

interface MatchStatusResponse {
  ok: boolean;
  match_id: number;
  status: PendingMatch;
  raw_bolao_result: unknown;
  error?: string;
}

interface RowActionState {
  running: boolean;
  validateState: ValidateState;
  validateMsg: string;
}

/* ────────────────────────────────────────────────────────────────────
   Styled components (self-contained — not imported from AdminFixtures)
   ──────────────────────────────────────────────────────────────────── */

const spin = keyframes`
  to { transform: rotate(360deg); }
`;

const Spinner = styled.div`
  width: 32px;
  height: 32px;
  border: 3px solid rgba(255, 255, 255, 0.12);
  border-top-color: #a78bfa;
  border-radius: 50%;
  animation: ${spin} 0.8s linear infinite;
`;

const CenterBox = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 48px 16px;
  color: rgba(255, 255, 255, 0.55);
  font-size: 14px;
`;

const ErrMsg = styled.p`
  color: #f87171;
  font-size: 14px;
  margin: 0;
  text-align: center;
`;

const RetryBtn = styled.button`
  background: rgba(167, 139, 250, 0.12);
  border: 1px solid rgba(167, 139, 250, 0.3);
  color: #a78bfa;
  padding: 6px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  &:hover { background: rgba(167, 139, 250, 0.2); }
`;

const TableWrap = styled.div`
  width: 100%;
  overflow-x: auto;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.8);
`;

const THead = styled.thead`
  background: rgba(255, 255, 255, 0.04);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
`;

const TH = styled.th`
  padding: 8px 12px;
  text-align: left;
  color: rgba(255, 255, 255, 0.45);
  font-weight: 500;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  white-space: nowrap;
`;

const TR = styled.tr`
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  &:hover { background: rgba(255, 255, 255, 0.03); }
`;

const TD = styled.td`
  padding: 10px 12px;
  vertical-align: middle;
`;

const CaseChip = styled.span<{ $label: CaseLabel }>`
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  background: ${({ $label }) =>
    $label === 'PROPOSED' ? 'rgba(251,191,36,0.15)' :
    $label === 'CASE_1'   ? 'rgba(96,165,250,0.15)' :
    $label === 'CASE_2_OR_3B' ? 'rgba(167,139,250,0.15)' :
    'rgba(251,113,133,0.15)'};
  color: ${({ $label }) =>
    $label === 'PROPOSED' ? '#fbbf24' :
    $label === 'CASE_1'   ? '#60a5fa' :
    $label === 'CASE_2_OR_3B' ? '#a78bfa' :
    '#fb7185'};
  border: 1px solid ${({ $label }) =>
    $label === 'PROPOSED' ? 'rgba(251,191,36,0.25)' :
    $label === 'CASE_1'   ? 'rgba(96,165,250,0.25)' :
    $label === 'CASE_2_OR_3B' ? 'rgba(167,139,250,0.25)' :
    'rgba(251,113,133,0.25)'};
`;

const NullJoinBadge = styled.span`
  display: inline-block;
  margin-left: 4px;
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 10px;
  background: rgba(251, 146, 60, 0.15);
  color: #fb923c;
  border: 1px solid rgba(251, 146, 60, 0.25);
  vertical-align: middle;
`;

const ActionGroup = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
`;

const ActionBtn = styled.button<{ $variant?: 'primary' | 'danger' | 'ghost' }>`
  padding: 4px 10px;
  border-radius: 5px;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  border: 1px solid;
  transition: background 0.15s;
  &:disabled { opacity: 0.38; cursor: not-allowed; }
  ${({ $variant = 'ghost' }) =>
    $variant === 'primary' ? `
      background: rgba(167,139,250,0.18);
      border-color: rgba(167,139,250,0.35);
      color: #a78bfa;
      &:hover:not(:disabled) { background: rgba(167,139,250,0.28); }
    ` :
    $variant === 'danger' ? `
      background: rgba(248,113,113,0.12);
      border-color: rgba(248,113,113,0.3);
      color: #f87171;
      &:hover:not(:disabled) { background: rgba(248,113,113,0.2); }
    ` : `
      background: rgba(255,255,255,0.06);
      border-color: rgba(255,255,255,0.12);
      color: rgba(255,255,255,0.65);
      &:hover:not(:disabled) { background: rgba(255,255,255,0.1); }
    `
  }
`;

const ValidateIndicator = styled.span<{ $state: ValidateState }>`
  font-size: 11px;
  padding: 2px 7px;
  border-radius: 4px;
  white-space: nowrap;
  ${({ $state }) =>
    $state === 'landed' ? `
      background: rgba(52,211,153,0.12);
      color: #34d399;
      border: 1px solid rgba(52,211,153,0.25);
    ` :
    $state === 'not-landed' ? `
      background: rgba(248,113,113,0.12);
      color: #f87171;
      border: 1px solid rgba(248,113,113,0.25);
    ` :
    $state === 'checking' ? `
      background: rgba(251,191,36,0.1);
      color: #fbbf24;
      border: 1px solid rgba(251,191,36,0.2);
    ` :
    $state === 'too-early' ? `
      background: rgba(251,146,60,0.1);
      color: #fb923c;
      border: 1px solid rgba(251,146,60,0.2);
    ` :
    $state === 'info' ? `
      background: rgba(96,165,250,0.1);
      color: #60a5fa;
      border: 1px solid rgba(96,165,250,0.2);
    ` : `
      background: rgba(255,255,255,0.04);
      color: rgba(255,255,255,0.35);
      border: 1px solid rgba(255,255,255,0.08);
    `
  }
`;

const ScoreInput = styled.input`
  width: 48px;
  padding: 4px 6px;
  background: rgba(255, 255, 255, 0.07);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 4px;
  color: #fff;
  font-size: 13px;
  text-align: center;
  &:focus { outline: none; border-color: rgba(167, 139, 250, 0.5); }
`;

const ScoreInputGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
`;

const ScoreSep = styled.span`
  color: rgba(255, 255, 255, 0.35);
  font-weight: 700;
`;

const PenaltySelect = styled.select`
  padding: 3px 6px;
  background: rgba(255, 255, 255, 0.07);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 4px;
  color: #fff;
  font-size: 12px;
  &:focus { outline: none; border-color: rgba(167, 139, 250, 0.5); }
`;

const Countdown = styled.span`
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: #fbbf24;
`;

const ConfirmOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.65);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const ConfirmDialog = styled.div`
  background: #1e1b2e;
  border: 1px solid rgba(167, 139, 250, 0.3);
  border-radius: 10px;
  padding: 24px 28px;
  max-width: 420px;
  width: 90%;
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const ConfirmTitle = styled.h3`
  margin: 0;
  font-size: 15px;
  color: #fff;
`;

const ConfirmBody = styled.p`
  margin: 0;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.65);
  line-height: 1.5;
`;

const ConfirmActions = styled.div`
  display: flex;
  gap: 10px;
  justify-content: flex-end;
`;

const HeaderRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0 8px;
  gap: 8px;
  flex-wrap: wrap;
`;

const SectionTitle = styled.span`
  font-size: 13px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.75);
`;

const InfoNote = styled.span`
  font-size: 11px;
  color: rgba(255, 255, 255, 0.35);
`;

/* ────────────────────────────────────────────────────────────────────
   Confirm Dialog Component
   ──────────────────────────────────────────────────────────────────── */

interface ConfirmProps {
  matchId: number;
  score: PendingScore;
  onConfirm: () => void;
  onCancel: () => void;
}

function ProposeConfirmDialog({ matchId, score, onConfirm, onCancel }: ConfirmProps) {
  return (
    <ConfirmOverlay onClick={onCancel}>
      <ConfirmDialog onClick={(e) => e.stopPropagation()}>
        <ConfirmTitle>Confirm Direct Proposal</ConfirmTitle>
        <ConfirmBody>
          Write <strong>{score.home}–{score.away}</strong> to BolaoCore for match{' '}
          <strong>#{matchId}</strong>?
          <br /><br />
          This bypasses the Oracle-Program and starts a 2-minute challenge window.
          The gateway account must be in <code>authorized_oracles</code> or this write will silently fail.
        </ConfirmBody>
        <ConfirmActions>
          <ActionBtn $variant="ghost" onClick={onCancel}>Cancel</ActionBtn>
          <ActionBtn $variant="primary" onClick={onConfirm}>Confirm</ActionBtn>
        </ConfirmActions>
      </ConfirmDialog>
    </ConfirmOverlay>
  );
}

/* ────────────────────────────────────────────────────────────────────
   Countdown hook — returns remaining ms (negative when elapsed)
   ──────────────────────────────────────────────────────────────────── */

function useCountdown(deadlineMs: number | null): number | null {
  const [remaining, setRemaining] = useState<number | null>(
    deadlineMs !== null ? deadlineMs - Date.now() : null,
  );
  useEffect(() => {
    if (deadlineMs === null) { setRemaining(null); return; }
    const tick = () => setRemaining(deadlineMs - Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [deadlineMs]);
  return remaining;
}

function fmtCountdown(ms: number): string {
  if (ms <= 0) return 'ready';
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60).toString().padStart(2, '0');
  const s = (totalSec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

/* ────────────────────────────────────────────────────────────────────
   Row component
   ──────────────────────────────────────────────────────────────────── */

interface RowProps {
  row: PendingMatch;
  oracleBase: string;
  onRefetchAll: () => void;
}

function PendingRow({ row, oracleBase, onRefetchAll }: RowProps) {
  const FINALIZE_GRACE_MS = 3000; // extra grace on top of the challenge window

  const [actionState, setActionState] = useState<RowActionState>({
    running: false,
    validateState: 'idle',
    validateMsg: '',
  });

  // For CASE_2_OR_3B score input
  const [showScoreInput, setShowScoreInput] = useState(false);
  const [inputHome, setInputHome] = useState('');
  const [inputAway, setInputAway] = useState('');
  const [inputPenalty, setInputPenalty] = useState<string>('');

  // Confirmation dialog state
  const [pendingConfirm, setPendingConfirm] = useState<PendingScore | null>(null);

  // For CASE_1 / 3A score input (submit-result to Oracle as feeder)
  const [showOracleInput, setShowOracleInput] = useState(false);
  const [oracleInputHome, setOracleInputHome] = useState('');
  const [oracleInputAway, setOracleInputAway] = useState('');
  const [oracleInputPenalty, setOracleInputPenalty] = useState<string>('');

  // Countdown for PROPOSED state
  const remaining = useCountdown(row.bolao_proposed_deadline);
  const windowElapsed = remaining !== null && remaining <= FINALIZE_GRACE_MS;

  // Track pre-action bolao_status for validate predicate
  const preBolaoStatusRef = useRef<string>(row.bolao_status);

  const setRunning = (r: boolean) => setActionState((s) => ({ ...s, running: r }));

  const setValidate = (state: ValidateState, msg = '') =>
    setActionState((s) => ({ ...s, validateState: state, validateMsg: msg }));

  async function validate(matchId: number, preBolaoStatus: string): Promise<boolean> {
    setValidate('checking');
    try {
      const res = await fetch(
        `${oracleBase}/bolao/match-status/${encodeURIComponent(matchId)}`,
        { signal: AbortSignal.timeout(10000) },
      );
      const data: MatchStatusResponse = await res.json();
      if (!data.ok) {
        setValidate('not-landed', data.error ?? 'Validate failed');
        return false;
      }

      const nowStatus = data.status.bolao_status;
      const rawResult = data.raw_bolao_result as any;

      // Finalized → remove row
      if (typeof rawResult === 'object' && rawResult !== null && 'finalized' in rawResult) {
        setValidate('landed', 'Match finalized — row will disappear on next refresh');
        onRefetchAll();
        return true;
      }

      // Transition from Unresolved to Proposed → success
      if (preBolaoStatus === 'Unresolved' && nowStatus === 'Proposed') {
        setValidate('landed', 'Write landed — BolaoCore moved to Proposed');
        onRefetchAll();
        return true;
      }

      // Transition from Proposed to Unresolved → cancel succeeded
      if (preBolaoStatus === 'Proposed' && nowStatus === 'Unresolved') {
        setValidate('landed', 'Cancel landed — BolaoCore moved back to Unresolved');
        onRefetchAll();
        return true;
      }

      // Still Proposed (tried to finalize) — check if too early
      if (nowStatus === 'Proposed' && preBolaoStatus === 'Proposed') {
        const deadline = data.status.bolao_proposed_deadline;
        if (deadline !== null && Date.now() < deadline) {
          setValidate('too-early', 'Challenge window not yet over — wait and retry finalize');
          return false;
        }
        setValidate('not-landed', 'Write did not land. Check if the gateway is authorized or try again.');
        return false;
      }

      // Still Unresolved after propose attempt
      if (nowStatus === 'Unresolved' && preBolaoStatus === 'Unresolved') {
        setValidate(
          'not-landed',
          'Write did not land. Likely cause: gateway address not in BolaoCore.authorized_oracles. Run set_oracle_authorized(gateway, true) from an admin.',
        );
        return false;
      }

      setValidate('landed', `State is now: ${nowStatus}`);
      return true;
    } catch (e: any) {
      setValidate('not-landed', `Validate error: ${e?.message}`);
      return false;
    }
  }

  async function callEndpoint(path: string, body?: object): Promise<boolean> {
    const res = await fetch(`${oracleBase}${path}`, {
      method: body !== undefined ? 'POST' : 'GET',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30000),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error ?? `${path} failed`);
    return true;
  }

  async function runAction(action: () => Promise<void>) {
    if (actionState.running) return;
    preBolaoStatusRef.current = row.bolao_status;
    setRunning(true);
    setValidate('idle');
    try {
      await action();
    } catch (e: any) {
      setValidate('not-landed', e?.message ?? 'Action failed');
    } finally {
      setRunning(false);
    }
  }

  // ── PROPOSED actions ──

  function handleFinalize() {
    runAction(async () => {
      await callEndpoint('/bolao/finalize-result', { match_id: row.match_id });
      await validate(row.match_id, 'Proposed');
    });
  }

  function handleCancelProposed() {
    runAction(async () => {
      await callEndpoint('/bolao/cancel-proposed-result', { match_id: row.match_id });
      await validate(row.match_id, 'Proposed');
    });
  }

  // ── CASE_1 / CASE_3A — Oracle mutations ──

  /**
   * validateOracle — re-reads on-chain state via GET /bolao/match-status/:matchId
   * and applies an oracle-side landed predicate.
   *
   * Two predicates are supported:
   *   'cancel'        — landed when oracle_score is null AND oracle_submissions === 0
   *                     (cancel_result resets the entry to Pending with nothing cleared)
   *   'submit'         — landed when oracle_status === 'Finalized' AND oracle_score
   *                     matches the home/away values that were submitted
   */
  async function validateOracle(
    matchId: number,
    predicate: 'cancel' | 'submit',
    expectedScore?: { home: number; away: number },
  ): Promise<boolean> {
    setValidate('checking');
    try {
      const res = await fetch(
        `${oracleBase}/bolao/match-status/${encodeURIComponent(matchId)}`,
        { signal: AbortSignal.timeout(10000) },
      );
      const data: MatchStatusResponse = await res.json();
      if (!data.ok) {
        setValidate('not-landed', data.error ?? 'Validate failed');
        return false;
      }

      const status = data.status;

      if (predicate === 'cancel') {
        // cancel_result resets Oracle to Pending with submissions=0 and final_result=None
        const cleared = status.oracle_score === null && status.oracle_submissions === 0;
        if (cleared) {
          setValidate('landed', 'Oracle cancel landed — score cleared, ready to re-submit');
          onRefetchAll();
          return true;
        }
        setValidate(
          'not-landed',
          status.oracle_score !== null
            ? 'Oracle score still present — cancel did not land'
            : 'Oracle submissions not zero yet — cancel did not land',
        );
        return false;
      }

      if (predicate === 'submit') {
        if (status.oracle_status !== 'Finalized') {
          setValidate('not-landed', `Oracle status is still '${status.oracle_status ?? 'null'}' — submit did not reach consensus / did not land`);
          return false;
        }
        if (expectedScore !== undefined) {
          const scoreMatch =
            status.oracle_score !== null &&
            status.oracle_score.home === expectedScore.home &&
            status.oracle_score.away === expectedScore.away;
          if (!scoreMatch) {
            const got = status.oracle_score
              ? `${status.oracle_score.home}–${status.oracle_score.away}`
              : 'null';
            setValidate(
              'not-landed',
              `Oracle finalized but score mismatch: expected ${expectedScore.home}–${expectedScore.away}, got ${got}`,
            );
            return false;
          }
        }
        setValidate('landed', `Oracle finalized with score ${expectedScore ? `${expectedScore.home}–${expectedScore.away}` : ''}. Now call propose-from-oracle.`);
        onRefetchAll();
        return true;
      }

      return false;
    } catch (e: any) {
      setValidate('not-landed', `validateOracle error: ${e?.message}`);
      return false;
    }
  }

  function handleCancelResult() {
    runAction(async () => {
      await callEndpoint('/oracle/cancel-result', { match_id: row.match_id });
      await validateOracle(row.match_id, 'cancel');
    });
  }

  function handleSubmitOracleResult() {
    const h = parseInt(oracleInputHome, 10);
    const a = parseInt(oracleInputAway, 10);
    if (!Number.isInteger(h) || !Number.isInteger(a)) {
      setValidate('not-landed', 'Enter valid integer scores before submitting');
      return;
    }
    const pw = oracleInputPenalty || null;
    runAction(async () => {
      // Submit as the gateway feeder (matches operational flow). With
      // consensus_threshold=1 this finalizes the Oracle entry immediately.
      await callEndpoint('/oracle/submit-result', {
        match_id: row.match_id,
        home: h,
        away: a,
        penalty_winner: pw,
      });
      await validateOracle(row.match_id, 'submit', { home: h, away: a });
    });
  }

  function handleProposeFromOracle() {
    runAction(async () => {
      await callEndpoint('/bolao/propose-from-oracle', { match_id: row.match_id });
      await validate(row.match_id, row.bolao_status);
    });
  }

  // ── CASE_2_OR_3B ──

  function handleCase2Yes() {
    if (row.null_join) {
      setValidate('not-landed', 'null_join: Oracle has no entry for this match_id — propose-from-oracle unavailable.');
      return;
    }
    runAction(async () => {
      await callEndpoint('/bolao/propose-from-oracle', { match_id: row.match_id });
      await validate(row.match_id, row.bolao_status);
    });
  }

  function handleCase3bSubmit() {
    const h = parseInt(inputHome, 10);
    const a = parseInt(inputAway, 10);
    if (!Number.isInteger(h) || !Number.isInteger(a)) {
      setValidate('not-landed', 'Enter valid integer scores');
      return;
    }
    const pw = (h === a && inputPenalty) ? inputPenalty : null;
    setPendingConfirm({ home: h, away: a });
    // Store penalty in local variable for the confirm handler
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    pendingPenaltyRef.current = pw;
  }

  const pendingPenaltyRef = useRef<string | null>(null);

  function confirmCase3b() {
    const confirm = pendingConfirm;
    const penalty = pendingPenaltyRef.current;
    setPendingConfirm(null);
    if (!confirm) return;
    runAction(async () => {
      await callEndpoint('/bolao/propose-result', {
        match_id: row.match_id,
        home: confirm.home,
        away: confirm.away,
        penalty_winner: penalty,
      });
      await validate(row.match_id, 'Unresolved');
    });
  }

  function cancelConfirm() {
    setPendingConfirm(null);
  }

  // ── Validate button (manual) ──
  // Read-only re-read: reports the current on-chain state neutrally.
  // It does NOT judge "landed/not-landed" (no write was attempted here), so it
  // never shows write-specific messages like the unauthorized-gateway hint.
  function handleManualValidate() {
    if (actionState.running) return;
    runAction(async () => {
      setValidate('checking');
      const res = await fetch(
        `${oracleBase}/bolao/match-status/${encodeURIComponent(row.match_id)}`,
        { signal: AbortSignal.timeout(10000) },
      );
      const data: MatchStatusResponse = await res.json();
      if (!data.ok) {
        setValidate('not-landed', data.error ?? 'Validate failed');
        return;
      }
      const s = data.status;
      const rawResult = data.raw_bolao_result as any;
      // Finalized → row no longer actionable; refresh to drop it.
      if (typeof rawResult === 'object' && rawResult !== null && 'finalized' in rawResult) {
        setValidate('landed', 'BolaoCore: Finalized — row will disappear on refresh');
        onRefetchAll();
        return;
      }
      const oracleLabel = s.oracle_status === null
        ? 'no entry'
        : `${s.oracle_status}${s.oracle_score ? ` ${s.oracle_score.home}–${s.oracle_score.away}` : ''}`;
      setValidate('info', `On-chain — BolaoCore: ${s.bolao_status} · Oracle: ${oracleLabel}`);
    });
  }

  // ── Render action area by case ──

  function renderActions() {
    const disabled = actionState.running;

    if (row.case_label === 'PROPOSED') {
      const countdownText = remaining !== null
        ? (windowElapsed ? 'Window elapsed' : `Window: ${fmtCountdown(remaining)}`)
        : '';
      return (
        <ActionGroup>
          {!windowElapsed && remaining !== null && (
            <Countdown>{fmtCountdown(remaining)}</Countdown>
          )}
          <ActionBtn
            $variant="primary"
            disabled={disabled || !windowElapsed}
            onClick={handleFinalize}
            title={windowElapsed ? 'Challenge window has elapsed — finalize now' : `Challenge window active (${countdownText})`}
          >
            Finalize
          </ActionBtn>
          <ActionBtn
            $variant="danger"
            disabled={disabled || windowElapsed}
            onClick={handleCancelProposed}
            title="Cancel the proposed result within the challenge window"
          >
            Cancel
          </ActionBtn>
        </ActionGroup>
      );
    }

    if (row.case_label === 'CASE_1') {
      return (
        <ActionGroup>
          {!showOracleInput ? (
            <ActionBtn $variant="ghost" disabled={disabled} onClick={() => setShowOracleInput(true)}>
              Step 1: Set Oracle score
            </ActionBtn>
          ) : (
            <>
              <ScoreInputGroup>
                <ScoreInput
                  type="number"
                  min={0}
                  max={255}
                  placeholder="H"
                  value={oracleInputHome}
                  onChange={(e) => setOracleInputHome(e.target.value)}
                />
                <ScoreSep>–</ScoreSep>
                <ScoreInput
                  type="number"
                  min={0}
                  max={255}
                  placeholder="A"
                  value={oracleInputAway}
                  onChange={(e) => setOracleInputAway(e.target.value)}
                />
                {oracleInputHome === oracleInputAway && oracleInputHome !== '' && row.is_knockout && (
                  <PenaltySelect
                    value={oracleInputPenalty}
                    onChange={(e) => setOracleInputPenalty(e.target.value)}
                  >
                    <option value="">Pen?</option>
                    <option value="Home">Home</option>
                    <option value="Away">Away</option>
                  </PenaltySelect>
                )}
                <ActionBtn $variant="primary" disabled={disabled} onClick={handleSubmitOracleResult}>
                  Submit Oracle result
                </ActionBtn>
              </ScoreInputGroup>
              <ActionBtn $variant="ghost" disabled={disabled} onClick={handleProposeFromOracle}>
                Step 2: Propose from Oracle
              </ActionBtn>
            </>
          )}
        </ActionGroup>
      );
    }

    if (row.case_label === 'CASE_3A') {
      return (
        <ActionGroup>
          <ActionBtn $variant="danger" disabled={disabled} onClick={handleCancelResult}>
            1: Cancel Oracle result
          </ActionBtn>
          {!showOracleInput ? (
            <ActionBtn $variant="ghost" disabled={disabled} onClick={() => setShowOracleInput(true)}>
              2: Re-set Oracle score
            </ActionBtn>
          ) : (
            <ScoreInputGroup>
              <ScoreInput
                type="number"
                min={0}
                max={255}
                placeholder="H"
                value={oracleInputHome}
                onChange={(e) => setOracleInputHome(e.target.value)}
              />
              <ScoreSep>–</ScoreSep>
              <ScoreInput
                type="number"
                min={0}
                max={255}
                placeholder="A"
                value={oracleInputAway}
                onChange={(e) => setOracleInputAway(e.target.value)}
              />
              {oracleInputHome === oracleInputAway && oracleInputHome !== '' && row.is_knockout && (
                <PenaltySelect
                  value={oracleInputPenalty}
                  onChange={(e) => setOracleInputPenalty(e.target.value)}
                >
                  <option value="">Pen?</option>
                  <option value="Home">Home</option>
                  <option value="Away">Away</option>
                </PenaltySelect>
              )}
              <ActionBtn $variant="primary" disabled={disabled} onClick={handleSubmitOracleResult}>
                Submit Oracle result
              </ActionBtn>
            </ScoreInputGroup>
          )}
          <ActionBtn $variant="ghost" disabled={disabled} onClick={handleProposeFromOracle}>
            3: Propose from Oracle
          </ActionBtn>
        </ActionGroup>
      );
    }

    // CASE_2_OR_3B
    if (row.case_label === 'CASE_2_OR_3B') {
      const oracleScoreLabel = row.oracle_score
        ? `${row.oracle_score.home}–${row.oracle_score.away}`
        : '?–?';
      return (
        <ActionGroup>
          <ActionBtn
            $variant="primary"
            disabled={disabled || !!row.null_join}
            onClick={handleCase2Yes}
            title={row.null_join ? 'null_join: no Oracle entry for this match_id' : `Propose Oracle score ${oracleScoreLabel} to BolaoCore`}
          >
            ✓ Oracle score correct ({oracleScoreLabel})
          </ActionBtn>
          {!showScoreInput ? (
            <ActionBtn $variant="danger" disabled={disabled} onClick={() => setShowScoreInput(true)}>
              ✗ Score wrong — propose correct
            </ActionBtn>
          ) : (
            <ScoreInputGroup>
              <ScoreInput
                type="number"
                min={0}
                max={255}
                placeholder="H"
                value={inputHome}
                onChange={(e) => setInputHome(e.target.value)}
              />
              <ScoreSep>–</ScoreSep>
              <ScoreInput
                type="number"
                min={0}
                max={255}
                placeholder="A"
                value={inputAway}
                onChange={(e) => setInputAway(e.target.value)}
              />
              {inputHome === inputAway && inputHome !== '' && row.is_knockout && (
                <PenaltySelect
                  value={inputPenalty}
                  onChange={(e) => setInputPenalty(e.target.value)}
                >
                  <option value="">Pen?</option>
                  <option value="Home">Home</option>
                  <option value="Away">Away</option>
                </PenaltySelect>
              )}
              <ActionBtn $variant="danger" disabled={disabled} onClick={handleCase3bSubmit}>
                Propose correct result
              </ActionBtn>
            </ScoreInputGroup>
          )}
        </ActionGroup>
      );
    }

    return null;
  }

  function renderValidateCell() {
    const { validateState, validateMsg } = actionState;
    return (
      <ActionGroup>
        <ActionBtn
          $variant="ghost"
          disabled={actionState.running}
          onClick={handleManualValidate}
          title="Re-read current on-chain state (BolaoCore + Oracle)"
        >
          Validate
        </ActionBtn>
        {validateState !== 'idle' && (
          <ValidateIndicator $state={validateState} title={validateMsg}>
            {validateState === 'checking' ? 'Checking…' :
             validateState === 'landed' ? 'Landed' :
             validateState === 'not-landed' ? 'Did not land' :
             validateState === 'too-early' ? 'Too early' :
             validateState === 'info' ? 'On-chain' :
             'idle'}
          </ValidateIndicator>
        )}
        {validateMsg && validateState !== 'idle' && validateState !== 'checking' && (
          <InfoNote style={{ fontSize: 10, display: 'block', color: 'rgba(255,255,255,0.45)', maxWidth: 220 }}>
            {validateMsg}
          </InfoNote>
        )}
      </ActionGroup>
    );
  }

  const kickOffLabel = row.kick_off
    ? new Intl.DateTimeFormat('en-US', {
        month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
        timeZoneName: 'short',
      }).format(new Date(Number(row.kick_off)))
    : '—';

  const oracleScoreLabel = row.oracle_score
    ? `${row.oracle_score.home}–${row.oracle_score.away}${row.oracle_penalty_winner ? ` (${row.oracle_penalty_winner})` : ''}`
    : row.oracle_status === null ? 'No entry' : '—';

  const bolaoScoreLabel = row.bolao_proposed_score
    ? `${row.bolao_proposed_score.home}–${row.bolao_proposed_score.away}`
    : '—';

  return (
    <>
      {pendingConfirm && (
        <ProposeConfirmDialog
          matchId={row.match_id}
          score={pendingConfirm}
          onConfirm={confirmCase3b}
          onCancel={cancelConfirm}
        />
      )}
      <TR>
        <TD style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>{row.match_id}</TD>
        <TD style={{ fontWeight: 600 }}>{row.home} vs {row.away}</TD>
        <TD style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11 }}>{kickOffLabel}</TD>
        <TD>
          <CaseChip $label={row.case_label}>{row.case_label.replace(/_/g, ' ')}</CaseChip>
          {row.null_join && <NullJoinBadge title="No Oracle entry for this match_id">null-join</NullJoinBadge>}
        </TD>
        <TD style={{ color: row.oracle_score ? '#fbbf24' : 'rgba(255,255,255,0.35)', fontSize: 12 }}>
          {oracleScoreLabel}
        </TD>
        <TD style={{ color: row.bolao_proposed_score ? '#a78bfa' : 'rgba(255,255,255,0.35)', fontSize: 12 }}>
          {bolaoScoreLabel}
        </TD>
        <TD>{renderActions()}</TD>
        <TD>{renderValidateCell()}</TD>
      </TR>
    </>
  );
}

/* ────────────────────────────────────────────────────────────────────
   Main tab component
   ──────────────────────────────────────────────────────────────────── */

interface PendingFinalizationTabProps {
  oracleBase: string;
}

export function PendingFinalizationTab({ oracleBase }: PendingFinalizationTabProps) {
  const [rows, setRows] = useState<PendingMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);

  const fetchPending = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${oracleBase}/bolao/pending-finalization`, {
        signal: AbortSignal.timeout(10000),
      });
      const data: PendingFinalizationResponse = await res.json();
      if (!data.ok) throw new Error(data.error ?? 'Server error');
      const sorted = [...(data.matches ?? [])].sort((a, b) => a.match_id - b.match_id);
      setRows(sorted);
      setGeneratedAt(data.generated_at ?? null);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to fetch pending finalization data');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [oracleBase]);

  useEffect(() => {
    fetchPending();
  }, [fetchPending]);

  if (loading) {
    return (
      <CenterBox>
        <Spinner />
        <span>Loading pending finalization…</span>
      </CenterBox>
    );
  }

  if (error) {
    return (
      <CenterBox>
        <ErrMsg>Failed to load: {error}</ErrMsg>
        <RetryBtn onClick={fetchPending}>Retry</RetryBtn>
      </CenterBox>
    );
  }

  if (rows.length === 0) {
    return (
      <CenterBox>
        <span style={{ fontSize: 28 }}>✅</span>
        <span>No matches pending finalization</span>
        <InfoNote>All played matches are Finalized in BolaoCore</InfoNote>
        <RetryBtn onClick={fetchPending}>Refresh</RetryBtn>
      </CenterBox>
    );
  }

  return (
    <>
      <HeaderRow>
        <SectionTitle>
          {rows.length} match{rows.length !== 1 ? 'es' : ''} pending finalization
        </SectionTitle>
        <ActionGroup>
          {generatedAt && (
            <InfoNote>as of {new Date(generatedAt).toLocaleTimeString()}</InfoNote>
          )}
          <ActionBtn $variant="ghost" onClick={fetchPending}>
            Refresh
          </ActionBtn>
        </ActionGroup>
      </HeaderRow>
      <TableWrap>
        <Table>
          <THead>
            <tr>
              <TH>#</TH>
              <TH>Match</TH>
              <TH>Kick-off</TH>
              <TH>Case</TH>
              <TH>Oracle score</TH>
              <TH>BolaoCore</TH>
              <TH>Actions</TH>
              <TH>Validate</TH>
            </tr>
          </THead>
          <tbody>
            {rows.map((row) => (
              <PendingRow
                key={row.match_id}
                row={row}
                oracleBase={oracleBase}
                onRefetchAll={fetchPending}
              />
            ))}
          </tbody>
        </Table>
      </TableWrap>
    </>
  );
}
