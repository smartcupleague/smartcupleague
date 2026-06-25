import { describe, it, expect } from 'vitest';
import { classifyMatch, availableActionsFor } from '../finalization-utils';

// ── classifyMatch ────────────────────────────────────────────────────────────
//
// Classification algorithm (from design doc, precedence top-down):
//  1. BolaoCore Proposed → PROPOSED (beats any Oracle state)
//  2. Unresolved + Oracle null or (Pending with subs=0) → CASE_1
//  3. Unresolved + Oracle Finalized → CASE_2_OR_3B
//  4. Unresolved + Oracle Pending with subs>0 → CASE_3A

describe('classifyMatch', () => {
  // ── Rule 1: PROPOSED takes precedence over any Oracle state ──

  it('returns PROPOSED when BolaoCore is Proposed and Oracle is null', () => {
    expect(classifyMatch('Proposed', null, 0)).toBe('PROPOSED');
  });

  it('returns PROPOSED when BolaoCore is Proposed and Oracle is Pending with 0 subs', () => {
    expect(classifyMatch('Proposed', 'Pending', 0)).toBe('PROPOSED');
  });

  it('returns PROPOSED when BolaoCore is Proposed and Oracle is Pending with subs > 0', () => {
    expect(classifyMatch('Proposed', 'Pending', 5)).toBe('PROPOSED');
  });

  it('returns PROPOSED when BolaoCore is Proposed and Oracle is Finalized (Rule 1 precedes Rule 3)', () => {
    expect(classifyMatch('Proposed', 'Finalized', 0)).toBe('PROPOSED');
  });

  // ── Rule 2: CASE_1 — no Oracle entry ──

  it('returns CASE_1 when Oracle is null (no Oracle entry for this match_id)', () => {
    expect(classifyMatch('Unresolved', null, 0)).toBe('CASE_1');
  });

  // ── Rule 2: CASE_1 — Oracle Pending with 0 submissions ──

  it('returns CASE_1 when Oracle is Pending with 0 submissions', () => {
    expect(classifyMatch('Unresolved', 'Pending', 0)).toBe('CASE_1');
  });

  // ── Rule 3: CASE_2_OR_3B ──

  it('returns CASE_2_OR_3B when Oracle is Finalized and BolaoCore is Unresolved', () => {
    expect(classifyMatch('Unresolved', 'Finalized', 0)).toBe('CASE_2_OR_3B');
  });

  it('returns CASE_2_OR_3B when Oracle is Finalized regardless of submissions count', () => {
    expect(classifyMatch('Unresolved', 'Finalized', 3)).toBe('CASE_2_OR_3B');
  });

  // ── Rule 4: CASE_3A ──

  it('returns CASE_3A when Oracle is Pending with 1 submission', () => {
    expect(classifyMatch('Unresolved', 'Pending', 1)).toBe('CASE_3A');
  });

  it('returns CASE_3A when Oracle is Pending with many submissions', () => {
    expect(classifyMatch('Unresolved', 'Pending', 10)).toBe('CASE_3A');
  });
});

// ── availableActionsFor ───────────────────────────────────────────────────────

describe('availableActionsFor', () => {
  it('returns finalize-result and cancel for PROPOSED', () => {
    const actions = availableActionsFor('PROPOSED');
    expect(actions).toContain('finalize-result');
    expect(actions).toContain('cancel-proposed-result');
  });

  it('returns Oracle feed actions for CASE_1', () => {
    const actions = availableActionsFor('CASE_1');
    expect(actions).toContain('propose-from-oracle');
    expect(actions).toContain('submit-result');
  });

  it('returns both propose paths for CASE_2_OR_3B', () => {
    const actions = availableActionsFor('CASE_2_OR_3B');
    expect(actions).toContain('propose-from-oracle');
    expect(actions).toContain('propose-result');
  });

  it('returns cancel-result and correction flow for CASE_3A', () => {
    const actions = availableActionsFor('CASE_3A');
    expect(actions).toContain('cancel-result');
    expect(actions).toContain('submit-result');
    expect(actions).toContain('propose-from-oracle');
  });
});
