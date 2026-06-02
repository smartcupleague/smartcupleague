use sails_rs::prelude::*;

/// Final score of a match.
#[derive(Debug, Clone, Copy, Encode, Decode, TypeInfo, PartialEq, Eq)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub struct Score {
    pub home: u8,
    pub away: u8,
}

/// Penalty shootout winner for knockout draws.
#[derive(Debug, Clone, Copy, Encode, Decode, TypeInfo, PartialEq, Eq)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub enum PenaltyWinner {
    Home,
    Away,
}

/// A single result submission made by an authorized feeder.
#[derive(Debug, Clone, Encode, Decode, TypeInfo, PartialEq, Eq)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub struct ResultSubmission {
    pub feeder: ActorId,
    pub score: Score,
    pub penalty_winner: Option<PenaltyWinner>,
    pub submitted_at: u64,
}

/// Lifecycle of an oracle match entry.
#[derive(Debug, Clone, Encode, Decode, TypeInfo, PartialEq, Eq)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub enum OracleResultStatus {
    /// Submissions received but consensus not yet reached.
    Pending,
    /// Consensus threshold met — result locked.
    Finalized,
}

/// The verified, locked result for a match.
#[derive(Debug, Clone, Encode, Decode, TypeInfo, PartialEq, Eq)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub struct FinalResult {
    pub score: Score,
    pub penalty_winner: Option<PenaltyWinner>,
    pub finalized_at: u64,
}

/// Full oracle record for one match.
#[derive(Debug, Clone, Encode, Decode, TypeInfo)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub struct OracleMatchEntry {
    pub match_id: u64,
    pub phase: String,
    pub home: String,
    pub away: String,
    pub kick_off: u64,
    pub submissions: Vec<ResultSubmission>,
    pub status: OracleResultStatus,
    pub final_result: Option<FinalResult>,
}
