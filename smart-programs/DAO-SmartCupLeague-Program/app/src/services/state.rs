#![allow(static_mut_refs)]

use sails_rs::{collections::HashMap as SailsHashMap, prelude::*, gstd::msg};
use super::constants::{DEFAULT_QUORUM_BPS, DEFAULT_VOTING_PERIOD_MS};
use super::types::{BolaoInstance, Proposal, VoteChoice};

pub static mut DAO_STATE: Option<DaoState> = None;

#[derive(Debug, Clone, Default)]
pub struct DaoState {
    /// Current contract owner. Has authority over all admin-only methods.
    pub owner: ActorId,
    /// Default BolaoCore program that accepted proposals are dispatched to.
    pub bolao_program: ActorId,
    /// Optional KYC contract (reserved for future voter gating).
    pub kyc_contract: Option<ActorId>,
    /// Minimum participation threshold in basis points (10 000 = 100 %).
    pub quorum_bps: u16,
    /// Voting window duration in milliseconds.
    pub voting_period: u64,
    /// Monotonically increasing proposal counter (starts at 1).
    pub proposal_count: u64,
    /// All proposals indexed by id.
    pub proposals: SailsHashMap<u64, Proposal>,
    /// Vote records keyed by (proposal_id, voter).
    pub votes: SailsHashMap<(u64, ActorId), VoteChoice>,
    /// Registered BolaoCore WASM code_id (32-byte hash), used by the factory.
    pub bolao_code_id: Option<[u8; 32]>,
    /// BolaoCore instances deployed through this DAO.
    pub bolao_instances: Vec<BolaoInstance>,
}

impl DaoState {
    pub fn init(owner: ActorId, bolao_program: ActorId) {
        unsafe {
            DAO_STATE = Some(Self {
                owner,
                bolao_program,
                kyc_contract: None,
                quorum_bps: DEFAULT_QUORUM_BPS,
                voting_period: DEFAULT_VOTING_PERIOD_MS,
                proposal_count: 0,
                proposals: SailsHashMap::new(),
                votes: SailsHashMap::new(),
                bolao_code_id: None,
                bolao_instances: Vec::new(),
            });
        }
    }

    pub fn state_mut() -> &'static mut DaoState {
        let s = unsafe { DAO_STATE.as_mut() };
        debug_assert!(s.is_some(), "DAO state not initialized");
        unsafe { s.unwrap_unchecked() }
    }

    pub fn state_ref() -> &'static DaoState {
        let s = unsafe { DAO_STATE.as_ref() };
        debug_assert!(s.is_some(), "DAO state not initialized");
        unsafe { s.unwrap_unchecked() }
    }

    /// Panics if the caller is not the current owner.
    pub fn only_owner() {
        if msg::source() != DaoState::state_ref().owner {
            panic!("Only owner");
        }
    }
}
