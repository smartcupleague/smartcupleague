#![allow(static_mut_refs)]

use super::constants::{
    BET_TARGET_USD_MICRO, DEFAULT_PRICE_STALENESS_LIMIT_MS, MAX_MIGRATION_PAGE_SIZE,
    MIN_BET_PLANCK, PLANCK_PER_VARA,
};
use super::migration::{div_ceil, slice, MigrationMetadata, MigrationPage, MigrationUserPayload};
use super::types::{Bet, Match, PhaseConfig, PodiumPick, PodiumResult, UserBetRecord};
use sails_rs::collections::BTreeSet;
use sails_rs::collections::HashMap as SailsHashMap;
use sails_rs::{gstd::msg, prelude::*};

pub static mut SMARTCUP_STATE: Option<SmartCupState> = None;

#[derive(Debug, Clone)]
pub struct SmartCupState {
    pub admins: Vec<ActorId>,
    pub operators: Vec<ActorId>,
    pub treasury: ActorId,
    pub protocol_fee_accumulated: u128,
    pub final_prize_accumulated: u128,
    pub matches: SailsHashMap<u64, Match>,
    pub phases: SailsHashMap<String, PhaseConfig>,
    pub user_points: SailsHashMap<ActorId, u32>,
    pub bets: SailsHashMap<(ActorId, u64), Bet>,
    pub user_bets: SailsHashMap<ActorId, Vec<UserBetRecord>>,
    pub next_match_id: u64,
    pub podium_picks: SailsHashMap<ActorId, PodiumPick>,
    pub podium_result: Option<PodiumResult>,
    pub podium_finalized: bool,
    pub r32_lock_time: Option<u64>,
    pub authorized_oracles: SailsHashMap<ActorId, bool>,
    pub final_prize_finalized: bool,
    pub final_prize_claimable_total: u128,
    pub final_prize_rounding_dust: u128,
    pub final_prize_allocations: SailsHashMap<ActorId, u128>,
    pub final_prize_claimed: SailsHashMap<ActorId, bool>,
    pub pending_refunds: SailsHashMap<ActorId, u128>,
    /// Cached VARA/USD price from Oracle-Program, in micro-USD. 0 = not yet set.
    pub vara_price_usd_micro: u64,
    /// Block timestamp (ms) when vara_price_usd_micro was last refreshed.
    pub price_cached_at: u64,
    /// Max age (ms) before the cached price is considered stale and bets are paused.
    pub price_staleness_limit_ms: u64,
    /// Oracle-Program address used for refresh_vara_price (informational).
    pub price_oracle_program_id: Option<ActorId>,
    /// FreebetLedger-Program address allowed to place sponsored predictions.
    pub freebet_ledger_program_id: Option<ActorId>,

    // ── Migration fields ──────────────────────────────────────────────────────
    /// SOURCE side: set to true by lock_for_migration(); blocks all user writes.
    /// Default: false (normal operation).
    pub migration_locked: bool,

    /// SINK side: set to false when deployed as importer; set to true by seal_migration().
    /// Default: true (normal operation — writes allowed immediately after deploy).
    pub migration_sealed: bool,

    /// SOURCE side: advisory cursor tracking next expected page (informational).
    pub migration_page_cursor: u32,

    /// SINK side: number of pages successfully imported (debug/audit).
    pub imported_page_count: u32,

    /// Frozen sorted match key snapshot — populated by lock_for_migration().
    pub migration_match_keys: Vec<u64>,

    /// Frozen sorted bet key snapshot — sorted by (match_id ASC, ActorId bytes ASC).
    pub migration_bet_keys: Vec<(ActorId, u64)>,

    /// Frozen sorted user key snapshot — union of all ActorId-keyed maps, sorted by bytes.
    pub migration_user_keys: Vec<ActorId>,

    /// Frozen sorted phase key snapshot — sorted lexicographically.
    pub migration_phase_keys: Vec<String>,
}

impl Default for SmartCupState {
    fn default() -> Self {
        Self {
            admins: Vec::new(),
            operators: Vec::new(),
            treasury: ActorId::zero(),
            protocol_fee_accumulated: 0,
            final_prize_accumulated: 0,
            matches: SailsHashMap::new(),
            phases: SailsHashMap::new(),
            user_points: SailsHashMap::new(),
            bets: SailsHashMap::new(),
            user_bets: SailsHashMap::new(),
            next_match_id: 0,
            podium_picks: SailsHashMap::new(),
            podium_result: None,
            podium_finalized: false,
            r32_lock_time: None,
            authorized_oracles: SailsHashMap::new(),
            final_prize_finalized: false,
            final_prize_claimable_total: 0,
            final_prize_rounding_dust: 0,
            final_prize_allocations: SailsHashMap::new(),
            final_prize_claimed: SailsHashMap::new(),
            pending_refunds: SailsHashMap::new(),
            vara_price_usd_micro: 0,
            price_cached_at: 0,
            price_staleness_limit_ms: 0,
            price_oracle_program_id: None,
            freebet_ledger_program_id: None,
            // Migration: default to sealed=true so normal deploys work without any admin action.
            migration_locked: false,
            migration_sealed: true,
            migration_page_cursor: 0,
            imported_page_count: 0,
            migration_match_keys: Vec::new(),
            migration_bet_keys: Vec::new(),
            migration_user_keys: Vec::new(),
            migration_phase_keys: Vec::new(),
        }
    }
}

impl SmartCupState {
    pub fn init(admin: ActorId, treasury: ActorId) {
        unsafe {
            SMARTCUP_STATE = Some(Self {
                admins: vec![admin],
                treasury,
                price_staleness_limit_ms: DEFAULT_PRICE_STALENESS_LIMIT_MS,
                ..Default::default()
            })
        }
    }

    /// T5 — Deploys the contract in "importer mode": migration_sealed=false blocks all
    /// user writes until seal_migration() is called. Used when this contract is the
    /// migration SINK receiving state from a source contract.
    pub fn init_as_importer(admin: ActorId, treasury: ActorId) {
        unsafe {
            SMARTCUP_STATE = Some(Self {
                admins: vec![admin],
                treasury,
                migration_sealed: false,
                price_staleness_limit_ms: DEFAULT_PRICE_STALENESS_LIMIT_MS,
                ..Default::default()
            })
        }
    }

    /// Computes the minimum bet in planck for the current VARA price and staleness.
    /// Returns 0 when the price feed is stale or unset — caller must reject the bet.
    /// `now_ms` is the current block timestamp in milliseconds.
    pub fn compute_min_bet_planck(&self, now_ms: u64) -> u128 {
        let price = self.vara_price_usd_micro as u128;
        if price == 0
            || self.price_staleness_limit_ms == 0
            || now_ms.saturating_sub(self.price_cached_at) > self.price_staleness_limit_ms
        {
            return MIN_BET_PLANCK; // safe fallback: 3 VARA while oracle reconnects
        }
        // ceil($3_000_000 micro-USD × 10^12 planck/VARA ÷ price_usd_micro)
        (BET_TARGET_USD_MICRO * PLANCK_PER_VARA + price - 1) / price
    }

    pub fn state_mut() -> &'static mut SmartCupState {
        let s = unsafe { SMARTCUP_STATE.as_mut() };
        debug_assert!(s.is_some(), "State not initialized");
        unsafe { s.unwrap_unchecked() }
    }

    pub fn state_ref() -> &'static SmartCupState {
        let s = unsafe { SMARTCUP_STATE.as_ref() };
        debug_assert!(s.is_some(), "State not initialized");
        unsafe { s.unwrap_unchecked() }
    }

    /// Panics if the caller is not one of the admins.
    pub fn only_admin(&self) {
        let caller = msg::source();
        if !self.admins.contains(&caller) {
            panic!("Only admin");
        }
    }

    /// Panics if the caller is not an admin or an operator.
    pub fn only_admin_or_operator(&self) {
        let caller = msg::source();
        if !self.admins.contains(&caller) && !self.operators.contains(&caller) {
            panic!("Only admin or operator");
        }
    }

    /// Panics if the caller is not an active authorized oracle.
    pub fn only_oracle(&self) {
        let caller = msg::source();
        if !self
            .authorized_oracles
            .get(&caller)
            .cloned()
            .unwrap_or(false)
        {
            panic!("Only authorized oracle");
        }
    }

    // ── T8: Write-lock guard (full) ───────────────────────────────────────────

    /// Panics if the contract is locked for migration (source export in progress)
    /// OR if the contract is in importer mode and has not yet been sealed.
    /// Call this at the entry of every user-facing and permissionless mutating handler.
    pub fn check_writes_allowed(&self) {
        if self.migration_locked {
            panic!("Contract locked for migration");
        }
        if !self.migration_sealed {
            panic!("Contract in import mode — writes disabled until seal_migration");
        }
    }

    // ── T9: Narrower guard for admin handlers ─────────────────────────────────

    /// Panics only if the export lock is active (migration_locked == true).
    /// Admin handlers use this so they can still operate during import mode
    /// (migration_sealed == false) but are blocked during the export lock.
    pub fn check_not_locked_for_export(&self) {
        if self.migration_locked {
            panic!("Contract locked for migration");
        }
    }

    // ── T12: Snapshot helper ──────────────────────────────────────────────────

    /// Walks all migratable collections, sorts their keys, and stores frozen Vecs
    /// in state. Called once by lock_for_migration(). After this returns, the Vecs
    /// MUST NOT be modified until seal_migration() clears them.
    pub fn build_migration_indices(&mut self) {
        // Match keys — ascending u64
        let mut mks: Vec<u64> = self.matches.keys().copied().collect();
        mks.sort_unstable();
        self.migration_match_keys = mks;

        // Bet keys — match-major (match_id ASC), then ActorId bytes ASC
        let mut bks: Vec<(ActorId, u64)> = self.bets.keys().copied().collect();
        bks.sort_unstable_by(|a, b| a.1.cmp(&b.1).then_with(|| a.0.as_ref().cmp(b.0.as_ref())));
        self.migration_bet_keys = bks;

        // User keys — union of all ActorId-keyed maps, deduplicated, sorted by bytes
        let mut uks: BTreeSet<[u8; 32]> = BTreeSet::new();
        for k in self.user_bets.keys() {
            uks.insert((*k).into_bytes());
        }
        for k in self.user_points.keys() {
            uks.insert((*k).into_bytes());
        }
        for k in self.pending_refunds.keys() {
            uks.insert((*k).into_bytes());
        }
        for k in self.podium_picks.keys() {
            uks.insert((*k).into_bytes());
        }
        for k in self.final_prize_allocations.keys() {
            uks.insert((*k).into_bytes());
        }
        for k in self.final_prize_claimed.keys() {
            uks.insert((*k).into_bytes());
        }
        // BTreeSet<[u8;32]> gives lexicographic sort by default
        self.migration_user_keys = uks.into_iter().map(ActorId::from).collect();

        // Phase keys — lexicographic string sort
        let mut pks: Vec<String> = self.phases.keys().cloned().collect();
        pks.sort_unstable();
        self.migration_phase_keys = pks;
    }

    // ── Export helpers ────────────────────────────────────────────────────────

    /// Builds a MigrationPage for the given page index and page_size.
    /// Requires migration_locked == true. Called by the export_state_page handler.
    pub fn build_export_page(&self, page: u32, page_size: u32) -> MigrationPage {
        if !self.migration_locked {
            panic!("Migration not locked");
        }
        if page_size == 0 {
            panic!("Invalid page_size");
        }

        let per_collection = page_size.min(MAX_MIGRATION_PAGE_SIZE) as usize;

        let bet_len = self.migration_bet_keys.len();
        let user_len = self.migration_user_keys.len();
        let total_pages = div_ceil(bet_len.max(user_len), per_collection).max(1) as u32;

        if page >= total_pages {
            panic!("Invalid page");
        }

        // Matches and phases are small and bounded — ship in full on page 0 only.
        let matches: Vec<Match> = if page == 0 {
            self.migration_match_keys
                .iter()
                .filter_map(|id| self.matches.get(id).cloned())
                .collect()
        } else {
            Vec::new()
        };

        let phases: Vec<super::types::PhaseConfig> = if page == 0 {
            self.migration_phase_keys
                .iter()
                .filter_map(|n| self.phases.get(n).cloned())
                .collect()
        } else {
            Vec::new()
        };

        // Bets slice
        let bets_keys = slice(&self.migration_bet_keys, page, per_collection);
        let bets: Vec<Bet> = bets_keys
            .iter()
            .filter_map(|k| self.bets.get(k).cloned())
            .collect();

        // User payload slice
        let user_keys = slice(&self.migration_user_keys, page, per_collection);
        let user_payloads: Vec<MigrationUserPayload> = user_keys
            .iter()
            .map(|u| MigrationUserPayload {
                user: *u,
                user_bets: self.user_bets.get(u).cloned().unwrap_or_default(),
                user_points: self.user_points.get(u).cloned().unwrap_or(0),
                pending_refund: self.pending_refunds.get(u).cloned().unwrap_or(0),
                podium_pick: self.podium_picks.get(u).cloned(),
                final_prize_allocation: self.final_prize_allocations.get(u).cloned().unwrap_or(0),
                final_prize_claimed: self.final_prize_claimed.get(u).cloned().unwrap_or(false),
            })
            .collect();

        MigrationPage {
            page,
            total_pages,
            is_last_page: page + 1 >= total_pages,
            matches,
            phases,
            bets,
            user_payloads,
        }
    }

    /// Returns the total VARA (in planck) the contract holds on behalf of users and protocol.
    /// Formula: unclaimed match pools + pending refunds + fee/prize accumulators.
    pub fn total_locked_vara(&self) -> u128 {
        let match_remaining: u128 = self
            .matches
            .values()
            .map(|m| m.match_prize_pool.saturating_sub(m.total_claimed))
            .sum();
        let pending: u128 = self.pending_refunds.values().cloned().sum();
        self.protocol_fee_accumulated
            .saturating_add(self.final_prize_accumulated)
            .saturating_add(self.final_prize_claimable_total)
            .saturating_add(self.final_prize_rounding_dust)
            .saturating_add(match_remaining)
            .saturating_add(pending)
    }

    /// Builds a MigrationMetadata snapshot of all scalar state fields.
    /// Requires migration_locked == true.
    pub fn build_export_metadata(&self) -> MigrationMetadata {
        if !self.migration_locked {
            panic!("Migration not locked");
        }
        let pending_refunds_scalar: u128 = self.pending_refunds.values().copied().sum();
        MigrationMetadata {
            admins: self.admins.clone(),
            operators: self.operators.clone(),
            treasury: self.treasury,
            authorized_oracles: self
                .authorized_oracles
                .iter()
                .map(|(k, v)| (*k, *v))
                .collect(),
            next_match_id: self.next_match_id,
            protocol_fee_accumulated: self.protocol_fee_accumulated,
            final_prize_accumulated: self.final_prize_accumulated,
            r32_lock_time: self.r32_lock_time,
            podium_result: self.podium_result.clone(),
            podium_finalized: self.podium_finalized,
            final_prize_finalized: self.final_prize_finalized,
            final_prize_claimable_total: self.final_prize_claimable_total,
            final_prize_rounding_dust: self.final_prize_rounding_dust,
            vara_price_usd_micro: self.vara_price_usd_micro,
            price_cached_at: self.price_cached_at,
            price_staleness_limit_ms: self.price_staleness_limit_ms,
            price_oracle_program_id: self.price_oracle_program_id,
            freebet_ledger_program_id: self.freebet_ledger_program_id,
            pending_refunds_scalar,
        }
    }
}

// ── Query projection ──────────────────────────────────────────────────────────

#[derive(Debug, Encode, Decode, TypeInfo, Clone)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub struct IoSmartCupState {
    pub admins: Vec<ActorId>,
    pub operators: Vec<ActorId>,
    pub treasury: ActorId,
    pub protocol_fee_accumulated: u128,
    pub final_prize_accumulated: u128,
    pub matches: Vec<Match>,
    pub phases: Vec<PhaseConfig>,
    pub user_points: Vec<(ActorId, u32)>,
    pub podium_finalized: bool,
    pub podium_result: Option<PodiumResult>,
    pub r32_lock_time: Option<u64>,
    pub final_prize_finalized: bool,
    pub final_prize_claimable_total: u128,
    pub final_prize_rounding_dust: u128,
    pub vara_price_usd_micro: u64,
    pub price_cached_at: u64,
    pub price_staleness_limit_ms: u64,
    pub freebet_ledger_program_id: Option<ActorId>,
}

impl From<SmartCupState> for IoSmartCupState {
    fn from(state: SmartCupState) -> Self {
        Self {
            admins: state.admins,
            operators: state.operators,
            treasury: state.treasury,
            protocol_fee_accumulated: state.protocol_fee_accumulated,
            final_prize_accumulated: state.final_prize_accumulated,
            matches: state.matches.values().cloned().collect(),
            phases: state.phases.values().cloned().collect(),
            user_points: state
                .user_points
                .iter()
                .map(|(id, pts)| (*id, *pts))
                .collect(),
            podium_finalized: state.podium_finalized,
            podium_result: state.podium_result,
            r32_lock_time: state.r32_lock_time,
            final_prize_finalized: state.final_prize_finalized,
            final_prize_claimable_total: state.final_prize_claimable_total,
            final_prize_rounding_dust: state.final_prize_rounding_dust,
            vara_price_usd_micro: state.vara_price_usd_micro,
            price_cached_at: state.price_cached_at,
            price_staleness_limit_ms: state.price_staleness_limit_ms,
            freebet_ledger_program_id: state.freebet_ledger_program_id,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::super::constants::{BET_TARGET_USD_MICRO, MIN_BET_PLANCK, PLANCK_PER_VARA};
    use super::*;

    fn s(price: u64, cached_at: u64, limit_ms: u64) -> SmartCupState {
        SmartCupState {
            vara_price_usd_micro: price,
            price_cached_at: cached_at,
            price_staleness_limit_ms: limit_ms,
            ..Default::default()
        }
    }

    #[test]
    fn fallback_when_price_is_zero() {
        assert_eq!(
            s(0, 0, 3_600_000).compute_min_bet_planck(1_000),
            MIN_BET_PLANCK
        );
    }

    #[test]
    fn fallback_when_staleness_limit_is_zero() {
        assert_eq!(s(749, 0, 0).compute_min_bet_planck(1_000), MIN_BET_PLANCK);
    }

    #[test]
    fn fallback_when_price_is_stale() {
        // cached_at=0, now=3_600_001 > limit=3_600_000 → stale
        assert_eq!(
            s(749, 0, 3_600_000).compute_min_bet_planck(3_600_001),
            MIN_BET_PLANCK
        );
    }

    #[test]
    fn exact_limit_not_stale() {
        // age == limit is NOT stale (condition is strictly >)
        assert_ne!(
            s(749, 0, 3_600_000).compute_min_bet_planck(3_600_000),
            MIN_BET_PLANCK
        );
    }

    #[test]
    fn dynamic_price_real_vara_749_micro() {
        // $0.000749/VARA (real testnet price) → min bet ≈ 4_005 VARA
        let expected = (BET_TARGET_USD_MICRO * PLANCK_PER_VARA + 749 - 1) / 749;
        assert_eq!(s(749, 0, 3_600_000).compute_min_bet_planck(0), expected);
        // Sanity: must be above 3 VARA (cheap coin → expensive bet in VARA)
        assert!(expected > MIN_BET_PLANCK);
    }

    #[test]
    fn dynamic_price_at_1_dollar() {
        // $1/VARA → min bet = ceil($3) = 3 VARA = MIN_BET_PLANCK exactly
        let expected = (BET_TARGET_USD_MICRO * PLANCK_PER_VARA + 1_000_000 - 1) / 1_000_000;
        assert_eq!(
            s(1_000_000, 0, 3_600_000).compute_min_bet_planck(0),
            expected
        );
        assert_eq!(expected, 3 * PLANCK_PER_VARA);
    }

    #[test]
    fn dynamic_price_at_upper_boundary_100_dollars() {
        // $100/VARA → min bet = ceil($3/$100) VARA = 30_000_000_000 planck = 0.03 VARA
        let price: u128 = 100_000_000;
        let expected = (BET_TARGET_USD_MICRO * PLANCK_PER_VARA + price - 1) / price;
        assert_eq!(
            s(100_000_000, 0, 3_600_000).compute_min_bet_planck(0),
            expected
        );
        // Must be below MIN_BET_PLANCK (expensive coin → cheap bet in VARA)
        assert!(expected < MIN_BET_PLANCK);
    }

    #[test]
    fn ceil_division_never_undercharges() {
        // For any valid price, min_bet × price_usd_micro >= BET_TARGET_USD_MICRO × PLANCK_PER_VARA
        for price in [1_u64, 100, 749, 1_000_000, 50_000_000, 100_000_000] {
            let min_bet = s(price, 0, 3_600_000).compute_min_bet_planck(0);
            let value_micro = min_bet * (price as u128);
            assert!(
                value_micro >= BET_TARGET_USD_MICRO * PLANCK_PER_VARA,
                "price={price}: min_bet={min_bet} covers less than $3 USD"
            );
        }
    }
}
