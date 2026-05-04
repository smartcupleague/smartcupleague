use sails_rs::prelude::*;
use sails_rs::collections::HashMap as SailsHashMap;
use super::types::{Score, PenaltyWinner, ResultSubmission};

/// Counts how many submissions from **currently authorized** feeders agree on the
/// same (score, penalty_winner) tuple.
///
/// - Submissions from revoked feeders are excluded from the count.
/// - Returns the majority result and its count, or None if no active submissions exist.
pub fn find_consensus(
    submissions: &[ResultSubmission],
    authorized_feeders: &SailsHashMap<ActorId, bool>,
) -> Option<(Score, Option<PenaltyWinner>, u8)> {
    // Only count votes from currently active feeders.
    let active: Vec<&ResultSubmission> = submissions
        .iter()
        .filter(|s| authorized_feeders.get(&s.feeder).cloned().unwrap_or(false))
        .collect();

    if active.is_empty() {
        return None;
    }

    let mut best_score:          Option<Score>                 = None;
    let mut best_penalty_winner: Option<Option<PenaltyWinner>> = None;
    let mut best_count:          u8                            = 0;

    for sub in &active {
        // Saturating cast — with MAX_FEEDERS=20 this never overflows u8,
        // but guarded explicitly against future MAX_FEEDERS increases.
        let count = active
            .iter()
            .filter(|s| s.score == sub.score && s.penalty_winner == sub.penalty_winner)
            .count()
            .min(u8::MAX as usize) as u8;

        if count > best_count {
            best_count          = count;
            best_score          = Some(sub.score);
            best_penalty_winner = Some(sub.penalty_winner);
        }
    }

    best_score.map(|s| (s, best_penalty_winner.unwrap(), best_count))
}

/// Returns true if the feeder has already submitted for this match.
pub fn feeder_already_submitted(
    submissions: &[ResultSubmission],
    feeder: ActorId,
) -> bool {
    submissions.iter().any(|s| s.feeder == feeder)
}
