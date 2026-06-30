import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveOnFieldResult } from '../result-mapping';

// resolveOnFieldResult turns a football-data.org score node into the on-field
// result the chain stores: the game score (draws stay draws) plus the penalty
// shootout winner. football-data.org folds the shootout goals INTO fullTime for
// PENALTY_SHOOTOUT, so they must be stripped back out (fullTime - penalties).

const ft = (home: number | null, away: number | null) => ({ home, away });
const pen = (home: number | null, away: number | null) => ({ home, away });

// Silence the guard warnings so the test output stays clean, but keep the spy
// so we can assert that an abstention actually logged.
let warnSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  warnSpy.mockRestore();
});

describe('resolveOnFieldResult — happy paths', () => {
  it('REGULAR uses fullTime as-is with no penalty winner', () => {
    expect(resolveOnFieldResult({ duration: 'REGULAR', fullTime: ft(2, 1), penalties: pen(null, null) }))
      .toEqual({ home: 2, away: 1, penalty_winner: null });
  });

  it('EXTRA_TIME uses fullTime as-is (already includes extra-time goals)', () => {
    expect(resolveOnFieldResult({ duration: 'EXTRA_TIME', fullTime: ft(2, 1), penalties: pen(0, 0) }))
      .toEqual({ home: 2, away: 1, penalty_winner: null });
  });

  it('PENALTY_SHOOTOUT (real: Germany 4-5 Paraguay, pens 3-4) → 1-1, Away', () => {
    expect(resolveOnFieldResult({ duration: 'PENALTY_SHOOTOUT', fullTime: ft(4, 5), penalties: pen(3, 4) }))
      .toEqual({ home: 1, away: 1, penalty_winner: 'Away' });
  });

  it('PENALTY_SHOOTOUT (real: Netherlands 3-4 Morocco, pens 2-3) → 1-1, Away', () => {
    expect(resolveOnFieldResult({ duration: 'PENALTY_SHOOTOUT', fullTime: ft(3, 4), penalties: pen(2, 3) }))
      .toEqual({ home: 1, away: 1, penalty_winner: 'Away' });
  });

  it('PENALTY_SHOOTOUT home wins (fullTime 5-4, pens 4-3) → 1-1, Home', () => {
    expect(resolveOnFieldResult({ duration: 'PENALTY_SHOOTOUT', fullTime: ft(5, 4), penalties: pen(4, 3) }))
      .toEqual({ home: 1, away: 1, penalty_winner: 'Home' });
  });

  it('PENALTY_SHOOTOUT 0-0 draw decided on pens (fullTime 3-4, pens 3-4) → 0-0, Away', () => {
    expect(resolveOnFieldResult({ duration: 'PENALTY_SHOOTOUT', fullTime: ft(3, 4), penalties: pen(3, 4) }))
      .toEqual({ home: 0, away: 0, penalty_winner: 'Away' });
  });
});

describe('resolveOnFieldResult — guards (abstain → null)', () => {
  it('fullTime missing → null', () => {
    expect(resolveOnFieldResult({ duration: 'REGULAR', fullTime: ft(null, 1), penalties: pen(null, null) }))
      .toBeNull();
    expect(warnSpy).toHaveBeenCalledOnce();
  });

  it('unknown duration → null (abstains for manual resolution)', () => {
    expect(resolveOnFieldResult({ duration: 'SUSPENDED', fullTime: ft(1, 1), penalties: pen(null, null) }))
      .toBeNull();
    expect(warnSpy).toHaveBeenCalledOnce();
  });

  it('PENALTY_SHOOTOUT without penalties data → null', () => {
    expect(resolveOnFieldResult({ duration: 'PENALTY_SHOOTOUT', fullTime: ft(4, 5), penalties: pen(null, null) }))
      .toBeNull();
  });

  it('PENALTY_SHOOTOUT with a tied shootout (no winner) → null', () => {
    expect(resolveOnFieldResult({ duration: 'PENALTY_SHOOTOUT', fullTime: ft(4, 4), penalties: pen(3, 3) }))
      .toBeNull();
  });

  it('PENALTY_SHOOTOUT where stripping penalties goes negative → null', () => {
    expect(resolveOnFieldResult({ duration: 'PENALTY_SHOOTOUT', fullTime: ft(1, 4), penalties: pen(3, 2) }))
      .toBeNull();
  });

  it('PENALTY_SHOOTOUT where on-field score is not a draw after stripping → null', () => {
    // 5-2 minus 3-1 = 2-1 (not a draw — corrupt data, a shootout implies a draw)
    expect(resolveOnFieldResult({ duration: 'PENALTY_SHOOTOUT', fullTime: ft(5, 2), penalties: pen(3, 1) }))
      .toBeNull();
  });
});
