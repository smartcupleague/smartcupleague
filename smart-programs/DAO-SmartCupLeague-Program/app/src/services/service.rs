#![allow(static_mut_refs)]

use sails_rs::{
    gstd::{exec, msg},
    prelude::*,
};

use super::constants::MAX_DESCRIPTION_LEN;
use super::events::DaoEvent;
use super::state::DaoState;
use super::types::{BolaoInstance, IoDaoState, Proposal, ProposalKind, ProposalStatus, VoteChoice};
use super::utils::compute_status;

// ── Internal BolaoCore command type ─────────────────────────────────────────
// Not exported; used only to build sails-compatible message payloads.

enum BolaoCmd {
    RegisterPhase {
        name: String,
        start_time: u64,
        end_time: u64,
        points_weight: u32,
    },
    RegisterMatch {
        phase: String,
        home: String,
        away: String,
        kick_off: u64,
    },
    SetOracleAuthorized {
        oracle: ActorId,
        authorized: bool,
    },
    FinalizePodium {
        champion: String,
        runner_up: String,
        third_place: String,
    },
    CancelMatchResult {
        match_id: u64,
    },
}

/// Encode a sails service call and fire it at `target` with zero value.
///
/// Payload format (SCALE):
///   SCALE("Service")  +  SCALE("method_name")  +  SCALE(arg1)  +  …
///
/// This is identical to what the sails-generated client produces, so BolaoCore's
/// router can decode it as a normal service call, provided this DAO is the admin.
fn dispatch_bolao(target: ActorId, cmd: BolaoCmd) {
    let payload = match cmd {
        BolaoCmd::RegisterPhase {
            name,
            start_time,
            end_time,
            points_weight,
        } => {
            let mut p = "Service".encode();
            p.extend_from_slice(&"register_phase".encode());
            p.extend_from_slice(&name.encode());
            p.extend_from_slice(&start_time.encode());
            p.extend_from_slice(&end_time.encode());
            p.extend_from_slice(&points_weight.encode());
            p
        }
        BolaoCmd::RegisterMatch {
            phase,
            home,
            away,
            kick_off,
        } => {
            let mut p = "Service".encode();
            p.extend_from_slice(&"register_match".encode());
            p.extend_from_slice(&phase.encode());
            p.extend_from_slice(&home.encode());
            p.extend_from_slice(&away.encode());
            p.extend_from_slice(&kick_off.encode());
            p
        }
        BolaoCmd::SetOracleAuthorized { oracle, authorized } => {
            let mut p = "Service".encode();
            p.extend_from_slice(&"set_oracle_authorized".encode());
            p.extend_from_slice(&oracle.encode());
            p.extend_from_slice(&authorized.encode());
            p
        }
        BolaoCmd::FinalizePodium {
            champion,
            runner_up,
            third_place,
        } => {
            let mut p = "Service".encode();
            p.extend_from_slice(&"finalize_podium".encode());
            p.extend_from_slice(&champion.encode());
            p.extend_from_slice(&runner_up.encode());
            p.extend_from_slice(&third_place.encode());
            p
        }
        BolaoCmd::CancelMatchResult { match_id } => {
            let mut p = "Service".encode();
            p.extend_from_slice(&"cancel_proposed_result".encode());
            p.extend_from_slice(&match_id.encode());
            p
        }
    };
    msg::send_bytes(target, payload, 0).expect("BolaoCore dispatch failed");
}

// ── Service ───────────────────────────────────────────────────────────────────

#[derive(Default)]
pub struct Service;

impl Service {
    pub fn new() -> Self {
        Self
    }

    /// Called once during Program::new(). Seeds the static state.
    pub fn seed(bolao_program: ActorId) {
        DaoState::init(msg::source(), bolao_program);
    }
}

#[sails_rs::service(events = DaoEvent)]
impl Service {
    // ── Owner admin ──────────────────────────────────────────────────────────

    /// Update the default BolaoCore program that governance proposals dispatch to.
    /// Owner-only.
    #[export]
    pub fn set_bolao_program(&mut self, new_bolao: ActorId) {
        DaoState::only_owner();
        DaoState::state_mut().bolao_program = new_bolao;
        self.emit_event(DaoEvent::GovernanceParamUpdated).ok();
    }

    /// Transfer ownership of this DAO to a new address.
    /// Owner-only. Single-step — use with care.
    #[export]
    pub fn set_owner(&mut self, new_owner: ActorId) {
        DaoState::only_owner();
        if new_owner == ActorId::zero() {
            panic!("Owner cannot be zero address");
        }
        let st = DaoState::state_mut();
        st.owner = new_owner;
        if !st.admins.contains(&new_owner) {
            st.admins.push(new_owner);
        }
        self.emit_event(DaoEvent::OwnerChanged(new_owner)).ok();
    }

    #[export]
    pub fn add_admin(&mut self, new_admin: ActorId) {
        DaoState::only_owner();
        if new_admin == ActorId::zero() {
            panic!("Admin cannot be zero address");
        }
        let st = DaoState::state_mut();
        if !st.admins.contains(&new_admin) {
            st.admins.push(new_admin);
            self.emit_event(DaoEvent::AdminAdded(new_admin)).ok();
        }
    }

    #[export]
    pub fn remove_admin(&mut self, admin: ActorId) {
        DaoState::only_owner();
        let st = DaoState::state_mut();
        if st.admins.len() <= 1 {
            panic!("Cannot remove last admin");
        }
        let pos = st
            .admins
            .iter()
            .position(|id| *id == admin)
            .expect("Address is not an admin");
        st.admins.remove(pos);
        if st.owner == admin {
            st.owner = st.admins[0];
        }
        self.emit_event(DaoEvent::AdminRemoved(admin)).ok();
    }

    #[export]
    pub fn withdraw_vara(&mut self, to: ActorId, amount: u128) {
        DaoState::only_owner();
        if to == ActorId::zero() || to == exec::program_id() {
            panic!("Invalid withdraw destination");
        }
        if amount == 0 {
            panic!("Amount must be greater than zero");
        }
        if exec::value_available() < amount {
            panic!("Insufficient balance");
        }
        msg::send(to, (), amount).expect("VARA withdraw failed");
        self.emit_event(DaoEvent::VaraWithdrawn(to, amount)).ok();
    }

    #[export]
    pub fn force_withdraw_vara(&mut self, to: ActorId, amount: u128) {
        DaoState::only_owner();
        if to == ActorId::zero() || to == exec::program_id() {
            panic!("Invalid withdraw destination");
        }
        if amount == 0 {
            panic!("Amount must be greater than zero");
        }
        if exec::value_available() < amount {
            panic!("Insufficient balance");
        }
        msg::send(to, (), amount).expect("Force VARA withdraw failed");
        self.emit_event(DaoEvent::ForceVaraWithdrawn(to, amount))
            .ok();
    }

    // ── BolaoCore factory ────────────────────────────────────────────────────

    /// Register the WASM code_id (32-byte Blake2 hash) of the BolaoCore binary.
    /// Must be called before deploy_bolao() or executing a DeployBolao proposal.
    /// Owner-only.
    #[export]
    pub fn register_bolao_code(&mut self, code_id: [u8; 32]) {
        DaoState::only_owner();
        DaoState::state_mut().bolao_code_id = Some(code_id);
        self.emit_event(DaoEvent::BolaoCodeRegistered).ok();
    }

    /// Deploy a new BolaoCore program immediately (no governance vote required).
    /// Owner-only. The factory records the new instance in bolao_instances.
    ///
    /// `admin`     — Initial admin of the new BolaoCore instance.
    ///               Pass `exec::program_id()` to make this DAO the admin.
    /// `salt`      — Unique bytes used to derive the deterministic program address.
    /// `gas_limit` — Gas forwarded to the BolaoCore init handler.
    ///               Use DEFAULT_BOLAO_DEPLOY_GAS as a starting point.
    #[export]
    pub fn deploy_bolao(&mut self, admin: ActorId, salt: Vec<u8>, gas_limit: u64) {
        DaoState::only_owner();

        let code_id_bytes = DaoState::state_ref()
            .bolao_code_id
            .expect("BolaoCore code not registered; call register_bolao_code first");

        let code_id: gstd::CodeId = code_id_bytes.into();

        // BolaoCore constructor: new(admin: ActorId)
        // Sails route encoding: SCALE("New") + SCALE(admin)
        let mut payload = "New".encode();
        payload.extend_from_slice(&admin.encode());

        let (_, new_program_id) =
            gstd::prog::create_program_bytes_with_gas(code_id, salt, payload, gas_limit, 0)
                .expect("BolaoCore deployment failed");

        let deployed_at = exec::block_timestamp();
        DaoState::state_mut().bolao_instances.push(BolaoInstance {
            program_id: new_program_id,
            admin,
            deployed_at,
        });

        self.emit_event(DaoEvent::BolaoDeployed(new_program_id, admin))
            .ok();
    }

    // ── Governance ───────────────────────────────────────────────────────────

    /// Create a new governance proposal. Open to any caller.
    #[export]
    pub fn create_proposal(&mut self, kind: ProposalKind, description: String) {
        if description.len() > MAX_DESCRIPTION_LEN {
            panic!("Description exceeds maximum length");
        }

        let st = DaoState::state_mut();
        let proposer = msg::source();
        let now = exec::block_timestamp();

        let id = st.proposal_count.saturating_add(1);
        st.proposal_count = id;

        let end = now.saturating_add(st.voting_period);

        let p = Proposal {
            id,
            proposer,
            kind,
            description,
            start_time: now,
            end_time: end,
            yes: 0,
            no: 0,
            abstain: 0,
            status: ProposalStatus::Active,
            executed: false,
        };

        st.proposals.insert(id, p);
        self.emit_event(DaoEvent::ProposalCreated(id, proposer))
            .ok();
    }

    /// Cast a vote on an active proposal. Each address may vote once per proposal.
    #[export]
    pub fn vote(&mut self, proposal_id: u64, choice: VoteChoice) {
        let voter = msg::source();
        let now = exec::block_timestamp();
        let st = DaoState::state_mut();

        let p = st
            .proposals
            .get_mut(&proposal_id)
            .expect("Proposal not found");

        if p.status != ProposalStatus::Active {
            panic!("Proposal is not active");
        }
        if now >= p.end_time {
            panic!("Voting period has ended");
        }
        if st.votes.contains_key(&(proposal_id, voter)) {
            panic!("Already voted on this proposal");
        }

        match choice {
            VoteChoice::Yes => p.yes = p.yes.saturating_add(1),
            VoteChoice::No => p.no = p.no.saturating_add(1),
            VoteChoice::Abstain => p.abstain = p.abstain.saturating_add(1),
        }

        st.votes.insert((proposal_id, voter), choice.clone());
        self.emit_event(DaoEvent::Voted(proposal_id, voter, choice))
            .ok();
    }

    /// Compute and persist the final status of a proposal after voting ends.
    /// Permissionless — anyone can call this once `end_time` has passed.
    #[export]
    pub fn finalize_proposal(&mut self, proposal_id: u64) {
        let st = DaoState::state_mut();
        let now = exec::block_timestamp();

        let p = st
            .proposals
            .get_mut(&proposal_id)
            .expect("Proposal not found");

        let new_status = compute_status(p, st.quorum_bps, now);
        p.status = new_status.clone();

        self.emit_event(DaoEvent::ProposalFinalized(proposal_id, new_status))
            .ok();
    }

    /// Execute a proposal that has reached Succeeded status.
    /// Permissionless — any caller may trigger execution.
    ///
    /// If the proposal is still Active, execution panics.
    /// If the proposal Defeated/Expired, its status is updated and the call returns.
    #[export]
    pub fn execute(&mut self, proposal_id: u64) {
        let now = exec::block_timestamp();

        // ── Phase 1: validate & extract ─────────────────────────────────────
        let (kind, bolao_program) = {
            let st = DaoState::state_mut();
            let p = st
                .proposals
                .get_mut(&proposal_id)
                .expect("Proposal not found");

            let status = compute_status(p, st.quorum_bps, now);

            if status == ProposalStatus::Active {
                panic!("Voting still in progress");
            }
            if p.executed {
                panic!("Proposal already executed");
            }
            if status != ProposalStatus::Succeeded {
                // Update status to Defeated and return early.
                p.status = status;
                return;
            }

            (p.kind.clone(), st.bolao_program)
        };

        // ── Phase 2: dispatch the action ────────────────────────────────────
        match kind {
            ProposalKind::AddPhase {
                name,
                start_time,
                end_time,
                points_weight,
            } => {
                dispatch_bolao(
                    bolao_program,
                    BolaoCmd::RegisterPhase {
                        name,
                        start_time,
                        end_time,
                        points_weight,
                    },
                );
                self.emit_event(DaoEvent::BolaoCallDispatched(proposal_id))
                    .ok();
            }

            ProposalKind::AddMatch {
                phase,
                home,
                away,
                kick_off,
            } => {
                dispatch_bolao(
                    bolao_program,
                    BolaoCmd::RegisterMatch {
                        phase,
                        home,
                        away,
                        kick_off,
                    },
                );
                self.emit_event(DaoEvent::BolaoCallDispatched(proposal_id))
                    .ok();
            }

            ProposalKind::SetOracleAuthorized { oracle, authorized } => {
                dispatch_bolao(
                    bolao_program,
                    BolaoCmd::SetOracleAuthorized { oracle, authorized },
                );
                self.emit_event(DaoEvent::BolaoCallDispatched(proposal_id))
                    .ok();
            }

            ProposalKind::FinalizePodium {
                champion,
                runner_up,
                third_place,
            } => {
                dispatch_bolao(
                    bolao_program,
                    BolaoCmd::FinalizePodium {
                        champion,
                        runner_up,
                        third_place,
                    },
                );
                self.emit_event(DaoEvent::BolaoCallDispatched(proposal_id))
                    .ok();
            }

            ProposalKind::CancelMatchResult { match_id } => {
                dispatch_bolao(bolao_program, BolaoCmd::CancelMatchResult { match_id });
                self.emit_event(DaoEvent::BolaoCallDispatched(proposal_id))
                    .ok();
            }

            // Factory via governance vote
            ProposalKind::DeployBolao {
                admin,
                salt,
                gas_limit,
            } => {
                let code_id_bytes = DaoState::state_ref()
                    .bolao_code_id
                    .expect("BolaoCore code not registered; call register_bolao_code first");

                let code_id: gstd::CodeId = code_id_bytes.into();
                let mut payload = "New".encode();
                payload.extend_from_slice(&admin.encode());

                let (_, new_program_id) =
                    gstd::prog::create_program_bytes_with_gas(code_id, salt, payload, gas_limit, 0)
                        .expect("BolaoCore deployment failed");

                let deployed_at = exec::block_timestamp();
                DaoState::state_mut().bolao_instances.push(BolaoInstance {
                    program_id: new_program_id,
                    admin,
                    deployed_at,
                });

                self.emit_event(DaoEvent::BolaoDeployed(new_program_id, admin))
                    .ok();
            }

            ProposalKind::SetQuorum { new_quorum_bps } => {
                DaoState::state_mut().quorum_bps = new_quorum_bps;
                self.emit_event(DaoEvent::GovernanceParamUpdated).ok();
            }

            ProposalKind::SetVotingPeriod { new_voting_period } => {
                DaoState::state_mut().voting_period = new_voting_period;
                self.emit_event(DaoEvent::GovernanceParamUpdated).ok();
            }

            ProposalKind::SetDefaultBolao { new_bolao } => {
                DaoState::state_mut().bolao_program = new_bolao;
                self.emit_event(DaoEvent::GovernanceParamUpdated).ok();
            }
        }

        // ── Phase 3: mark executed ───────────────────────────────────────────
        let p = DaoState::state_mut()
            .proposals
            .get_mut(&proposal_id)
            .unwrap();
        p.executed = true;
        p.status = ProposalStatus::Executed;

        self.emit_event(DaoEvent::ProposalExecuted(proposal_id))
            .ok();
    }

    // ── Queries ───────────────────────────────────────────────────────────────

    #[export]
    pub fn query_state(&self) -> IoDaoState {
        let st = DaoState::state_ref();
        IoDaoState {
            owner: st.owner,
            admins: st.admins.clone(),
            bolao_program: st.bolao_program,
            kyc_contract: st.kyc_contract,
            quorum_bps: st.quorum_bps,
            voting_period: st.voting_period,
            proposal_count: st.proposal_count,
            bolao_code_registered: st.bolao_code_id.is_some(),
            bolao_instance_count: st.bolao_instances.len() as u32,
        }
    }

    #[export]
    pub fn query_proposal(&self, proposal_id: u64) -> Option<Proposal> {
        DaoState::state_ref().proposals.get(&proposal_id).cloned()
    }

    #[export]
    pub fn query_proposals(&self) -> Vec<Proposal> {
        DaoState::state_ref().proposals.values().cloned().collect()
    }

    #[export]
    pub fn query_vote(&self, proposal_id: u64, voter: ActorId) -> Option<VoteChoice> {
        DaoState::state_ref()
            .votes
            .get(&(proposal_id, voter))
            .cloned()
    }

    /// Returns all BolaoCore instances deployed by this DAO's factory.
    #[export]
    pub fn query_bolao_instances(&self) -> Vec<BolaoInstance> {
        DaoState::state_ref().bolao_instances.clone()
    }
}
