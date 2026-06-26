/**
 * Shared types and pure utility functions for the pending-finalization feature.
 * Extracted so they can be unit-tested independently of the Express server.
 */

export type BolaoStatus = 'Unresolved' | 'Proposed';
export type OracleStatus = 'Pending' | 'Finalized' | null;
export type CaseLabel = 'PROPOSED' | 'CASE_1' | 'CASE_2_OR_3B' | 'CASE_3A';

/**
 * Pure classification function — no side effects, no I/O.
 * Evaluated top-down: FIRST matching rule wins.
 *
 * Rules:
 *  1. BolaoCore Proposed → PROPOSED (takes precedence regardless of Oracle state)
 *  2. BolaoCore Unresolved + (Oracle missing OR Oracle Pending with 0 subs) → CASE_1
 *  3. BolaoCore Unresolved + Oracle Finalized → CASE_2_OR_3B (human decides)
 *  4. BolaoCore Unresolved + Oracle Pending with subs > 0 → CASE_3A
 */
export function classifyMatch(
  bolaoStatus: BolaoStatus,
  oracleStatus: OracleStatus,
  oracleSubmissions: number,
): CaseLabel {
  if (bolaoStatus === 'Proposed') return 'PROPOSED';

  // bolaoStatus === 'Unresolved' from here on
  if (oracleStatus === null || (oracleStatus === 'Pending' && oracleSubmissions === 0)) {
    return 'CASE_1';
  }
  if (oracleStatus === 'Finalized') return 'CASE_2_OR_3B';
  // oracleStatus === 'Pending' && oracleSubmissions > 0
  return 'CASE_3A';
}

export function availableActionsFor(caseLabel: CaseLabel): string[] {
  switch (caseLabel) {
    case 'PROPOSED':     return ['finalize-result', 'cancel-proposed-result'];
    case 'CASE_1':       return ['submit-result', 'propose-from-oracle'];
    case 'CASE_2_OR_3B': return ['propose-from-oracle', 'propose-result'];
    case 'CASE_3A':      return ['cancel-result', 'submit-result', 'propose-from-oracle'];
  }
}
