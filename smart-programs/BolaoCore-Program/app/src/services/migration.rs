use sails_rs::prelude::*;
use super::types::{Match, PhaseConfig, Bet, UserBetRecord, PodiumPick, PodiumResult};

/// Per-user payload bundling all user-keyed map entries for migration.
#[derive(Debug, Clone, Encode, Decode, TypeInfo)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub struct MigrationUserPayload {
    pub user: ActorId,
    pub user_bets: Vec<UserBetRecord>,
    pub user_points: u32,
    pub pending_refund: u128,
    pub podium_pick: Option<PodiumPick>,
    pub final_prize_allocation: u128,
    pub final_prize_claimed: bool,
}

/// One page of state data returned by `export_state_page`.
/// `matches` and `phases` are only populated on page 0 (they are small bounded sets).
/// `bets` and `user_payloads` are paginated by `page_size` per collection.
#[derive(Debug, Clone, Encode, Decode, TypeInfo)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub struct MigrationPage {
    pub page: u32,
    pub total_pages: u32,
    pub is_last_page: bool,
    pub matches: Vec<Match>,
    pub phases: Vec<PhaseConfig>,
    pub bets: Vec<Bet>,
    pub user_payloads: Vec<MigrationUserPayload>,
}

/// Scalar metadata exported from the source contract.
/// Used by `import_metadata` to restore non-collection state.
#[derive(Debug, Clone, Encode, Decode, TypeInfo)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub struct MigrationMetadata {
    pub admins: Vec<ActorId>,
    pub operators: Vec<ActorId>,
    pub treasury: ActorId,
    pub authorized_oracles: Vec<(ActorId, bool)>,
    pub next_match_id: u64,
    pub protocol_fee_accumulated: u128,
    pub final_prize_accumulated: u128,
    pub r32_lock_time: Option<u64>,
    pub podium_result: Option<PodiumResult>,
    pub podium_finalized: bool,
    pub final_prize_finalized: bool,
    pub final_prize_claimable_total: u128,
    pub final_prize_rounding_dust: u128,
    pub vara_price_usd_micro: u64,
    pub price_cached_at: u64,
    pub price_staleness_limit_ms: u64,
    pub price_oracle_program_id: Option<ActorId>,
    /// Informational total of all pending_refunds; NOT persisted on import.
    pub pending_refunds_scalar: u128,
}

/// Slice a Vec deterministically for pagination.
/// Returns `v[page*per_collection .. min((page+1)*per_collection, v.len())]`.
pub fn slice<T: Clone>(v: &[T], page: u32, per_collection: usize) -> Vec<T> {
    let start = (page as usize).saturating_mul(per_collection);
    if start >= v.len() {
        return Vec::new();
    }
    let end = start.saturating_add(per_collection).min(v.len());
    v[start..end].to_vec()
}

/// Integer ceiling division.
pub fn div_ceil(a: usize, b: usize) -> usize {
    if b == 0 { return 0; }
    (a + b - 1) / b
}
