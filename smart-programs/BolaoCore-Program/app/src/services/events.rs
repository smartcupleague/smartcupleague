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
    /// VARA/USD price refreshed from Oracle-Program: (price_usd_micro).
    VaraPriceRefreshed(u64),

    // ── Migration events ──────────────────────────────────────────────────────

    /// Emitted by lock_for_migration() when the contract is locked for export.
    MigrationLocked,

    /// Emitted by export_state_page(): (page, entries_in_page).
    MigrationPageExported(u32, u32),

    /// Emitted by export_metadata().
    MigrationMetadataExported,

    /// Emitted by drain_vara_to(): (dest, amount).
    MigrationVaraDrained(ActorId, u128),

    /// Emitted by import_state_page(): (page, entries_imported).
    MigrationPageImported(u32, u32),

    /// Emitted by import_metadata().
    MigrationMetadataImported,

    /// Emitted by seal_migration().
    MigrationSealed,

    /// Emitted by admin_push_refund(): (user, amount).
    RefundPushed(ActorId, u128),
}
