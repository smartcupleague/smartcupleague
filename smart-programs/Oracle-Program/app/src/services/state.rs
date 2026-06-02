use super::constants::DEFAULT_CONSENSUS_THRESHOLD;
use super::types::{FinalResult, OracleMatchEntry, OracleResultStatus};
use sails_rs::collections::HashMap as SailsHashMap;
use sails_rs::prelude::*;

// ── Core state ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct OracleState {
    /// Current admin.
    pub admin: ActorId,
    /// Additional admins with the same operational permissions as admin.
    pub admins: Vec<ActorId>,
    /// Pending admin for 2-step ownership transfer.
    pub pending_admin: Option<ActorId>,
    /// Operators — can register matches and force-finalize results.
    pub operators: Vec<ActorId>,
    /// Authorized data feeders: feeder → active.
    pub authorized_feeders: SailsHashMap<ActorId, bool>,
    /// Number of matching submissions required to auto-finalize.
    pub consensus_threshold: u8,
    /// Optional BolaoCore program address (informational — stored for off-chain tooling).
    pub bolao_program_id: Option<ActorId>,
    /// Oracle records keyed by match_id.
    pub match_results: SailsHashMap<u64, OracleMatchEntry>,
    /// Latest VARA/USD price in micro-USD (USD × 1_000_000). 0 = never set.
    pub vara_price_usd_micro: u64,
    /// Block timestamp (ms) when vara_price_usd_micro was last updated. 0 = never.
    pub price_updated_at: u64,
}

impl OracleState {
    pub fn new(admin: ActorId) -> Self {
        Self {
            admin,
            admins: vec![admin],
            pending_admin: None,
            operators: Vec::new(),
            authorized_feeders: SailsHashMap::new(),
            consensus_threshold: DEFAULT_CONSENSUS_THRESHOLD,
            bolao_program_id: None,
            match_results: SailsHashMap::new(),
            vara_price_usd_micro: 0,
            price_updated_at: 0,
        }
    }
}

// ── Query projections ─────────────────────────────────────────────────────────

/// Flat view of an oracle result — exposed in `IoOracleState`.
#[derive(Debug, Clone, Encode, Decode, TypeInfo)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub struct IoMatchResult {
    pub match_id: u64,
    pub phase: String,
    pub home: String,
    pub away: String,
    pub kick_off: u64,
    pub status: OracleResultStatus,
    pub final_result: Option<FinalResult>,
    pub submissions: u32,
}

/// Full read-only projection returned by `query_state()`.
#[derive(Debug, Clone, Encode, Decode, TypeInfo)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub struct IoOracleState {
    pub admin: ActorId,
    pub admins: Vec<ActorId>,
    pub operators: Vec<ActorId>,
    pub consensus_threshold: u8,
    pub bolao_program_id: Option<ActorId>,
    pub authorized_feeders: Vec<ActorId>,
    pub match_results: Vec<IoMatchResult>,
    pub pending_admin: Option<ActorId>,
    pub vara_price_usd_micro: u64,
    pub price_updated_at: u64,
}

impl From<&OracleState> for IoOracleState {
    fn from(s: &OracleState) -> Self {
        let authorized_feeders = s
            .authorized_feeders
            .iter()
            .filter(|(_, &active)| active)
            .map(|(id, _)| *id)
            .collect();

        let match_results = s
            .match_results
            .values()
            .map(|e| IoMatchResult {
                match_id: e.match_id,
                phase: e.phase.clone(),
                home: e.home.clone(),
                away: e.away.clone(),
                kick_off: e.kick_off,
                status: e.status.clone(),
                final_result: e.final_result.clone(),
                submissions: e.submissions.len() as u32,
            })
            .collect();

        Self {
            admin: s.admin,
            admins: s.admins.clone(),
            operators: s.operators.clone(),
            consensus_threshold: s.consensus_threshold,
            bolao_program_id: s.bolao_program_id,
            authorized_feeders,
            match_results,
            pending_admin: s.pending_admin,
            vara_price_usd_micro: s.vara_price_usd_micro,
            price_updated_at: s.price_updated_at,
        }
    }
}
