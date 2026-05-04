use sails_rs::prelude::*;
use super::types::{Score, PenaltyWinner};

#[event]
#[derive(Debug, Encode, Decode, TypeInfo)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub enum SmartCupEvent {
    PhaseRegistered(String),
    MatchRegistered(u64, String, String, String, u64),
    OracleAuthorized(ActorId, bool),
    BetAccepted(ActorId, u64, Score, Option<PenaltyWinner>, u128),
    ResultProposed(u64, Score, Option<PenaltyWinner>, ActorId, u64), // last u64 = challenge_expires_at
    ResultFinalized(u64, Score, Option<PenaltyWinner>),
    SettlementPrepared(u64, u128),
    PointsAwarded(ActorId, u64, u32),
    MatchRewardClaimed(u64, ActorId, u128),
    MatchDustSwept(u64, u128),
    PodiumPickSubmitted(ActorId, String, String, String),
    PodiumFinalized(String, String, String),
    PodiumBonusAwarded(ActorId, u32),
    FinalPrizeSent(u128, ActorId),
    ProtocolFeesWithdrawn(u128, ActorId),
    AdminAdded(ActorId),
    AdminRemoved(ActorId),
    OperatorAdded(ActorId),
    OperatorRemoved(ActorId),
    TreasuryChanged(ActorId, ActorId),
    FinalPrizePoolFinalized(u128, u128),
    FinalPrizeClaimed(ActorId, u128),
    FinalPrizeRoundingDustWithdrawn(u128, ActorId),
    ResultProposalCancelled(u64, ActorId),
    MatchCancelled(u64, u128),
    RefundClaimed(ActorId, u128),
}
