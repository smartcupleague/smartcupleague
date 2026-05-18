#![allow(static_mut_refs)]

use sails_rs::{prelude::*, gstd::msg};
use sails_rs::collections::HashMap as SailsHashMap;
use super::constants::{BET_TARGET_USD_MICRO, PLANCK_PER_VARA, DEFAULT_PRICE_STALENESS_LIMIT_MS, MIN_BET_PLANCK};
use super::types::{Match, PhaseConfig, Bet, UserBetRecord, PodiumPick, PodiumResult};

pub static mut SMARTCUP_STATE: Option<SmartCupState> = None;

#[derive(Debug, Clone, Default)]
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
        if !self.authorized_oracles.get(&caller).cloned().unwrap_or(false) {
            panic!("Only authorized oracle");
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
    pub r32_lock_time: Option<u64>,
    pub final_prize_finalized: bool,
    pub final_prize_claimable_total: u128,
    pub final_prize_rounding_dust: u128,
    pub vara_price_usd_micro: u64,
    pub price_cached_at: u64,
    pub price_staleness_limit_ms: u64,
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
            r32_lock_time: state.r32_lock_time,
            final_prize_finalized: state.final_prize_finalized,
            final_prize_claimable_total: state.final_prize_claimable_total,
            final_prize_rounding_dust: state.final_prize_rounding_dust,
            vara_price_usd_micro: state.vara_price_usd_micro,
            price_cached_at: state.price_cached_at,
            price_staleness_limit_ms: state.price_staleness_limit_ms,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use super::super::constants::{BET_TARGET_USD_MICRO, PLANCK_PER_VARA, MIN_BET_PLANCK};

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
        assert_eq!(s(0, 0, 3_600_000).compute_min_bet_planck(1_000), MIN_BET_PLANCK);
    }

    #[test]
    fn fallback_when_staleness_limit_is_zero() {
        assert_eq!(s(749, 0, 0).compute_min_bet_planck(1_000), MIN_BET_PLANCK);
    }

    #[test]
    fn fallback_when_price_is_stale() {
        // cached_at=0, now=3_600_001 > limit=3_600_000 → stale
        assert_eq!(s(749, 0, 3_600_000).compute_min_bet_planck(3_600_001), MIN_BET_PLANCK);
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
        assert_eq!(s(1_000_000, 0, 3_600_000).compute_min_bet_planck(0), expected);
        assert_eq!(expected, 3 * PLANCK_PER_VARA);
    }

    #[test]
    fn dynamic_price_at_upper_boundary_100_dollars() {
        // $100/VARA → min bet = ceil($3/$100) VARA = 30_000_000_000 planck = 0.03 VARA
        let price: u128 = 100_000_000;
        let expected = (BET_TARGET_USD_MICRO * PLANCK_PER_VARA + price - 1) / price;
        assert_eq!(s(100_000_000, 0, 3_600_000).compute_min_bet_planck(0), expected);
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
