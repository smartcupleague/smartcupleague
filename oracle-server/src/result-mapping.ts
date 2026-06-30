import type { PenaltyWinner } from "./oracle";

/** One side of a football-data.org score node (null until the match is played). */
export type ScoreSide = { home: number | null; away: number | null };

/** Oracle-Program result inputs derived from a football-data.org score. */
export type MappedResult = { home: number; away: number; penalty_winner: PenaltyWinner | null };

/**
 * Resolve the on-field match result (game score + penalty-shootout winner) from a
 * football-data.org score object.
 *
 * Key fact: football-data.org reports score.fullTime WITH the shootout goals added in
 * for PENALTY_SHOOTOUT matches (e.g. on-field 1-1 + penalties 3-4 => fullTime 4-5). The
 * on-chain result must store the on-field draw plus the penalty winner, so the shootout
 * goals are stripped from fullTime here. fullTime = regularTime + extraTime + penalties,
 * so fullTime - penalties yields the on-field score (verified against the API + docs).
 *
 * Only the three documented `duration` values are processed (REGULAR, EXTRA_TIME,
 * PENALTY_SHOOTOUT). Any unknown duration or inconsistent data returns null so the caller
 * abstains; abstained matches surface in GET /bolao/pending-finalization for manual
 * resolution (that endpoint flags by kick_off < now AND not finalized, independent of this
 * feeder, so abstention is never silent).
 */
export function resolveOnFieldResult(
  score: { duration?: string; fullTime: ScoreSide; penalties: ScoreSide },
  ctx = "",
): MappedResult | null {
  const tag = ctx ? ` match ${ctx}` : "";
  const { duration, fullTime, penalties } = score;

  // Guard: fullTime must be present and valid for EVERY case.
  if (fullTime == null || fullTime.home == null || fullTime.away == null) {
    console.warn(`[feed]${tag} skipped: fullTime missing (duration="${duration}")`);
    return null;
  }

  // REGULAR / EXTRA_TIME: fullTime already holds the on-field result, no shootout.
  if (duration === "REGULAR" || duration === "EXTRA_TIME") {
    return { home: fullTime.home, away: fullTime.away, penalty_winner: null };
  }

  // PENALTY_SHOOTOUT: fullTime includes the shootout goals — strip them out.
  if (duration === "PENALTY_SHOOTOUT") {
    // Guard: penalties must be present and valid.
    if (penalties == null || penalties.home == null || penalties.away == null) {
      console.warn(`[feed]${tag} skipped: PENALTY_SHOOTOUT without penalties data`);
      return null;
    }
    // Guard: a shootout always has a winner — a tie is impossible/corrupt.
    if (penalties.home === penalties.away) {
      console.warn(`[feed]${tag} skipped: penalty shootout tied ${penalties.home}-${penalties.away} (no winner)`);
      return null;
    }
    const home = fullTime.home - penalties.home;
    const away = fullTime.away - penalties.away;
    // Guard: subtraction must not go negative (corrupt data).
    if (home < 0 || away < 0) {
      console.warn(`[feed]${tag} skipped: negative on-field score after stripping penalties (${home}-${away})`);
      return null;
    }
    // Guard: a shootout implies the on-field score was a draw.
    if (home !== away) {
      console.warn(`[feed]${tag} skipped: on-field score not a draw after stripping penalties (${home}-${away})`);
      return null;
    }
    return { home, away, penalty_winner: penalties.home > penalties.away ? "Home" : "Away" };
  }

  // Unknown duration => abstain (surfaces in /bolao/pending-finalization).
  console.warn(`[feed]${tag} skipped: unsupported duration "${duration}" — needs manual resolution`);
  return null;
}
