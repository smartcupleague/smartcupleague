use super::types::{Proposal, ProposalStatus};

/// Sum of all votes cast on a proposal.
pub fn total_votes(p: &Proposal) -> u32 {
    p.yes.saturating_add(p.no).saturating_add(p.abstain)
}

/// Returns `true` when the participation threshold has been reached.
///
/// - `quorum_bps == 0`  → quorum is always met (useful for testing).
/// - Otherwise: requires at least `max(2, quorum_bps / 1000)` total votes.
pub fn meets_quorum(p: &Proposal, quorum_bps: u16) -> bool {
    if quorum_bps == 0 {
        return true;
    }
    let tv = total_votes(p);
    if tv == 0 {
        return false;
    }
    let min_votes = core::cmp::max(2, (quorum_bps as u32) / 1000);
    tv >= min_votes
}

/// Derive the current status of a proposal from its vote counts and timing.
pub fn compute_status(p: &Proposal, quorum_bps: u16, now: u64) -> ProposalStatus {
    if p.executed {
        return ProposalStatus::Executed;
    }
    if now < p.end_time {
        return ProposalStatus::Active;
    }
    if !meets_quorum(p, quorum_bps) {
        return ProposalStatus::Defeated;
    }
    if p.yes > p.no {
        ProposalStatus::Succeeded
    } else {
        ProposalStatus::Defeated
    }
}
