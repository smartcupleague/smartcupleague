#![allow(static_mut_refs)]

use sails_rs::{prelude::*, gstd::msg};
use sails_rs::collections::HashMap as SailsHashMap;
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
}

impl SmartCupState {
    pub fn init(admin: ActorId, treasury: ActorId) {
        unsafe {
            SMARTCUP_STATE = Some(Self {
                admins: vec![admin],
                treasury,
                ..Default::default()
            })
        }
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
        }
    }
}
