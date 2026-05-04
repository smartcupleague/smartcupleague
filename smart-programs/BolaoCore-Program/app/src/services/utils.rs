use sails_rs::prelude::*;
use super::constants::FINAL_PRIZE_TOP5_BPS;
use super::types::{Score, PenaltyWinner};
use super::state::SmartCupState;

/// Returns 1 = home win, 0 = draw, -1 = away win.
pub fn outcome(score: Score) -> i8 {
    if score.home > score.away {
        1
    } else if score.home < score.away {
        -1
    } else {
        0
    }
}

/// Outcome for knockout matches, resolving draws via penalty winner.
pub fn advance_outcome(score: Score, pen: Option<PenaltyWinner>) -> i8 {
    if score.home > score.away {
        1
    } else if score.home < score.away {
        -1
    } else {
        match pen.expect("Penalty winner required on draw") {
            PenaltyWinner::Home => 1,
            PenaltyWinner::Away => -1,
        }
    }
}

/// A phase is knockout when its points_weight is greater than 1.
pub fn is_knockout(points_weight: u32) -> bool {
    points_weight > 1
}

/// Returns true if a bet is eligible for a payout given the finalized match result.
pub fn eligible_for_payout(
    bet_score: Score,
    bet_penalty_winner: Option<PenaltyWinner>,
    final_score: Score,
    final_penalty_winner: Option<PenaltyWinner>,
    phase_weight: u32,
) -> bool {
    let knockout = is_knockout(phase_weight);
    let draw_final = final_score.home == final_score.away;

    if bet_score == final_score {
        if knockout && draw_final {
            return bet_penalty_winner.is_some() && bet_penalty_winner == final_penalty_winner;
        }
        return true;
    }

    if !knockout {
        return outcome(bet_score) == outcome(final_score);
    }

    let final_adv = advance_outcome(final_score, final_penalty_winner);

    let bet_adv = if bet_score.home == bet_score.away {
        if bet_penalty_winner.is_none() {
            return false;
        }
        advance_outcome(bet_score, bet_penalty_winner)
    } else {
        outcome(bet_score)
    };

    bet_adv == final_adv
}

/// Sums BPS shares for positions start_pos..=end_pos_inclusive (1-indexed).
pub fn top5_share_sum_bps(start_pos: usize, end_pos_inclusive: usize) -> u128 {
    let mut total = 0u128;
    for pos in start_pos..=end_pos_inclusive {
        total = total.saturating_add(FINAL_PRIZE_TOP5_BPS[pos - 1]);
    }
    total
}

/// Returns all participants sorted by points descending.
/// Only includes wallets that placed at least one bet with stake > 0.
pub fn collect_leaderboard(state: &SmartCupState) -> Vec<(ActorId, u32)> {
    let mut leaderboard: Vec<(ActorId, u32)> = state
        .user_bets
        .iter()
        .filter(|(_, bets)| bets.iter().any(|b| b.stake_in_match_pool > 0))
        .map(|(wallet, _)| {
            let points = state.user_points.get(wallet).cloned().unwrap_or(0);
            (*wallet, points)
        })
        .collect();

    leaderboard.sort_by(|a, b| b.1.cmp(&a.1));
    leaderboard
}
