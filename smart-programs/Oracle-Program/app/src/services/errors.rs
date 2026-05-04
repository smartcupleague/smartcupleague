use sails_rs::prelude::*;

#[derive(Debug, Clone, Encode, Decode, TypeInfo)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub enum OracleError {
    /// Caller is not the current admin.
    Unauthorized,
    /// Caller is not an active authorized feeder.
    NotAuthorizedFeeder,
    /// Adding this feeder would exceed MAX_FEEDERS.
    MaxFeedersReached,
    /// match_id exceeds MAX_MATCH_ID.
    InvalidMatchId,
    /// The result for this match is already finalized.
    AlreadyFinalized,
    /// This feeder already submitted a result for this match.
    FeederAlreadySubmitted,
    /// match_id not found in the oracle records.
    MatchNotFound,
    /// match_id has not been registered by admin yet — feeders cannot submit.
    MatchNotRegistered,
    /// match_id is already registered.
    MatchAlreadyRegistered,
    /// No pending admin transfer is in progress.
    NoPendingAdmin,
    /// Caller is not the pending admin for this transfer.
    NotPendingAdmin,
    /// consensus_threshold must be >= 1.
    ThresholdMustBeAtLeastOne,
    /// consensus_threshold cannot exceed MAX_FEEDERS — consensus would be unreachable.
    ThresholdExceedsMaxFeeders,
    /// new_admin cannot be the zero address.
    InvalidAdmin,
    /// Address is already in the operators list.
    AlreadyAnOperator,
    /// Address is not in the operators list.
    NotAnOperator,
    /// Operator address cannot be the zero address.
    InvalidOperator,
}
