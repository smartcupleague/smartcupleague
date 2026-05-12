/**
 * Fire-and-forget helpers to report on-chain events to the SmartCup backend.
 * Errors are silently swallowed — stats are best-effort and must never
 * block or break the user's main flow.
 */

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000';

export type PredictedOutcome = 'home' | 'draw' | 'away';

export function reportBet(
  walletAddress: string,
  matchId: string,
  amountPlanck: string,
  predictedOutcome: PredictedOutcome,
): void {
  fetch(`${API_BASE}/api/v1/stats/record-bet`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      wallet_address: walletAddress,
      match_id: String(matchId),
      amount_planck: amountPlanck,
      predicted_outcome: predictedOutcome,
    }),
  }).catch(() => { /* non-fatal */ });
}

export function reportClaim(
  walletAddress: string,
  matchId: string,
  amountPlanck: string,
  isExact = false,
): void {
  fetch(`${API_BASE}/api/v1/stats/record-claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      wallet_address: walletAddress,
      match_id: String(matchId),
      amount_planck: amountPlanck,
      is_exact: isExact,
    }),
  }).catch(() => { /* non-fatal */ });
}
