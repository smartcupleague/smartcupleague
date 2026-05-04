use sails_rs::prelude::*;
use super::types::{ProposalStatus, VoteChoice};

#[event]
#[derive(Debug, Clone, Encode, Decode, TypeInfo)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub enum DaoEvent {
    /// A new governance proposal was created. (proposal_id, proposer)
    ProposalCreated(u64, ActorId),
    /// A vote was cast. (proposal_id, voter, choice)
    Voted(u64, ActorId, VoteChoice),
    /// Voting ended and the final status was computed. (proposal_id, status)
    ProposalFinalized(u64, ProposalStatus),
    /// A succeeded proposal was executed. (proposal_id)
    ProposalExecuted(u64),
    /// A governance command was dispatched to a BolaoCore program. (proposal_id)
    BolaoCallDispatched(u64),
    /// A new BolaoCore instance was deployed via the factory. (program_id, admin)
    BolaoDeployed(ActorId, ActorId),
    /// A BolaoCore WASM code_id was registered (no args — code is sensitive).
    BolaoCodeRegistered,
    /// A DAO governance parameter (quorum, voting period, or bolao_program) was updated.
    GovernanceParamUpdated,
    /// The DAO owner was changed. (new_owner)
    OwnerChanged(ActorId),
}
