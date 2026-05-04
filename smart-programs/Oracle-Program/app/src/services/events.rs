use sails_rs::prelude::*;
use super::types::{Score, PenaltyWinner};

#[event]
#[derive(Debug, Encode, Decode, TypeInfo)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub enum OracleEvent {
    /// Admin registered a match_id for feeder submissions: (match_id).
    MatchRegistered(u64),

    /// A feeder was authorized or revoked: (feeder, authorized).
    FeederSet(ActorId, bool),

    /// Consensus threshold was updated: (new_threshold).
    ConsensusThresholdSet(u8),

    /// BolaoCore program address was registered.
    BolaoProgram(ActorId),

    /// A feeder submitted a result: (match_id, feeder, score).
    ResultSubmitted(u64, ActorId, Score),

    /// Consensus reached and result auto-finalized: (match_id, score, penalty_winner).
    ConsensusReached(u64, Score, Option<PenaltyWinner>),

    /// Admin force-finalized a result: (match_id, score, penalty_winner).
    ResultForced(u64, Score, Option<PenaltyWinner>),

    /// Admin cancelled a disputed result and reset it to Pending: (match_id).
    ResultCancelled(u64),

    /// 2-step admin transfer — new admin proposed: (old, proposed).
    AdminProposed(ActorId, ActorId),

    /// New admin accepted ownership: (old, new).
    AdminChanged(ActorId, ActorId),

    /// An operator was added by admin: (operator).
    OperatorAdded(ActorId),

    /// An operator was removed by admin: (operator).
    OperatorRemoved(ActorId),
}
