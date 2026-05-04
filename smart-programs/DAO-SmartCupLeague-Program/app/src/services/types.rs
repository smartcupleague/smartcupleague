use sails_rs::prelude::*;

// ── Vote & Proposal types ─────────────────────────────────────────────────────

#[derive(Debug, Clone, Encode, Decode, TypeInfo, PartialEq, Eq)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub enum VoteChoice {
    Yes,
    No,
    Abstain,
}

#[derive(Debug, Clone, Encode, Decode, TypeInfo, PartialEq, Eq)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub enum ProposalStatus {
    Active,
    Defeated,
    Succeeded,
    Executed,
    /// Reserved for future time-lock extensions.
    Expired,
}

/// All actions that can be proposed and voted on.
#[derive(Debug, Clone, Encode, Decode, TypeInfo, PartialEq, Eq)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub enum ProposalKind {
    // ── BolaoCore configuration (dispatched to bolao_program as admin) ──────
    /// Register a new tournament phase in BolaoCore.
    AddPhase {
        name: String,
        start_time: u64,
        end_time: u64,
        /// Scoring weight: 1 = group stage, >1 = knockout rounds.
        points_weight: u32,
    },
    /// Register a new match in BolaoCore.
    AddMatch {
        phase: String,
        home: String,
        away: String,
        kick_off: u64,
    },
    /// Grant or revoke oracle authority on BolaoCore.
    SetOracleAuthorized {
        oracle: ActorId,
        authorized: bool,
    },
    /// Finalise the tournament podium on BolaoCore.
    FinalizePodium {
        champion: String,
        runner_up: String,
        third_place: String,
    },
    /// Cancel an oracle-proposed result that is still inside the challenge window.
    /// Maps to BolaoCore::cancel_proposed_result(match_id).
    CancelMatchResult { match_id: u64 },

    // ── BolaoCore factory ────────────────────────────────────────────────────
    /// Deploy a new BolaoCore program via the on-chain factory.
    /// `salt` must be unique per deployment to avoid deterministic address collisions.
    DeployBolao {
        admin: ActorId,
        salt: Vec<u8>,
        gas_limit: u64,
    },

    // ── DAO governance ───────────────────────────────────────────────────────
    /// Change the minimum quorum (basis points, 10 000 = 100 %).
    SetQuorum { new_quorum_bps: u16 },
    /// Change the voting window duration (milliseconds).
    SetVotingPeriod { new_voting_period: u64 },
    /// Update the default BolaoCore program that governance dispatches to.
    SetDefaultBolao { new_bolao: ActorId },
}

#[derive(Debug, Clone, Encode, Decode, TypeInfo)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub struct Proposal {
    pub id: u64,
    pub proposer: ActorId,
    pub kind: ProposalKind,
    pub description: String,
    pub start_time: u64,
    pub end_time: u64,
    pub yes: u32,
    pub no: u32,
    pub abstain: u32,
    pub status: ProposalStatus,
    pub executed: bool,
}

/// Metadata for a BolaoCore instance deployed via the DAO factory.
#[derive(Debug, Clone, Encode, Decode, TypeInfo)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub struct BolaoInstance {
    pub program_id: ActorId,
    pub admin: ActorId,
    /// Block timestamp (ms) at which the program was created.
    pub deployed_at: u64,
}

/// Read-only projection of DaoState returned by query_state().
#[derive(Debug, Clone, Encode, Decode, TypeInfo)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub struct IoDaoState {
    pub owner: ActorId,
    /// Default BolaoCore program that governance proposals dispatch to.
    pub bolao_program: ActorId,
    pub kyc_contract: Option<ActorId>,
    pub quorum_bps: u16,
    pub voting_period: u64,
    pub proposal_count: u64,
    /// True if a BolaoCore WASM code_id has been registered via register_bolao_code().
    pub bolao_code_registered: bool,
    /// Number of BolaoCore instances deployed via this DAO's factory.
    pub bolao_instance_count: u32,
}
