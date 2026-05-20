use sails_rs::{cell::RefCell, prelude::*, gstd::{exec, msg}};

use super::constants::{MAX_FEEDERS, MAX_MATCH_ID};
use super::errors::OracleError;
use super::types::{
    FinalResult, OracleMatchEntry, OracleResultStatus,
    PenaltyWinner, ResultSubmission, Score,
};
use super::events::OracleEvent;
use super::state::{IoMatchResult, IoOracleState, OracleState};
use super::utils::{feeder_already_submitted, find_consensus};

// ── Service ───────────────────────────────────────────────────────────────────

pub struct Service<'a> {
    state: &'a RefCell<OracleState>,
}

impl<'a> Service<'a> {
    pub fn new(state: &'a RefCell<OracleState>) -> Self {
        Self { state }
    }

    fn ensure_admin(&self) -> Result<(), OracleError> {
        if msg::source() != self.state.borrow().admin {
            return Err(OracleError::Unauthorized);
        }
        Ok(())
    }

    fn ensure_admin_or_operator(&self) -> Result<(), OracleError> {
        let caller = msg::source();
        let state = self.state.borrow();
        if caller != state.admin && !state.operators.contains(&caller) {
            return Err(OracleError::Unauthorized);
        }
        Ok(())
    }

    fn ensure_feeder(&self) -> Result<(), OracleError> {
        let caller = msg::source();
        if !self.state.borrow().authorized_feeders.get(&caller).cloned().unwrap_or(false) {
            return Err(OracleError::NotAuthorizedFeeder);
        }
        Ok(())
    }
}

#[sails_rs::service(events = OracleEvent)]
impl<'a> Service<'a> {

    // ── ADMIN — match registration ────────────────────────────────────────────

    /// Admin or operator pre-registers a match_id before feeders can submit results.
    /// Mirrors the BolaoCore registration info (phase, home, away, kick_off) so the
    /// Oracle holds the same metadata as the betting contract.
    #[export(unwrap_result)]
    pub fn register_match(
        &mut self,
        match_id: u64,
        phase: String,
        home: String,
        away: String,
        kick_off: u64,
    ) -> Result<(), OracleError> {
        self.ensure_admin_or_operator()?;
        if match_id > MAX_MATCH_ID {
            return Err(OracleError::InvalidMatchId);
        }
        {
            let mut state = self.state.borrow_mut();
            if state.match_results.contains_key(&match_id) {
                return Err(OracleError::MatchAlreadyRegistered);
            }
            state.match_results.insert(match_id, OracleMatchEntry {
                match_id,
                phase,
                home,
                away,
                kick_off,
                submissions:  Vec::new(),
                status:       OracleResultStatus::Pending,
                final_result: None,
            });
        }
        self.emit_event(OracleEvent::MatchRegistered(match_id)).expect("event");
        Ok(())
    }

    // ── ADMIN — feeder management ─────────────────────────────────────────────

    /// Authorize or revoke a data feeder.
    /// Revoking a feeder excludes their past submissions from future consensus checks.
    #[export(unwrap_result)]
    pub fn set_feeder_authorized(
        &mut self,
        feeder: ActorId,
        authorized: bool,
    ) -> Result<(), OracleError> {
        self.ensure_admin()?;
        {
            let mut state = self.state.borrow_mut();
            // Check against the feeder's CURRENT active status, not just map presence.
            // A revoked feeder (key exists, value=false) being re-authorized counts as
            // adding an active slot and must also respect the MAX_FEEDERS limit.
            let is_currently_active = state
                .authorized_feeders
                .get(&feeder)
                .cloned()
                .unwrap_or(false);
            if authorized && !is_currently_active {
                let active_count = state.authorized_feeders.values().filter(|&&v| v).count();
                if active_count >= MAX_FEEDERS {
                    return Err(OracleError::MaxFeedersReached);
                }
            }
            state.authorized_feeders.insert(feeder, authorized);
        }
        self.emit_event(OracleEvent::FeederSet(feeder, authorized)).expect("event");
        Ok(())
    }

    /// Update the number of agreeing feeders needed to auto-finalize a result.
    /// Must be >= 1 and <= MAX_FEEDERS; values above MAX_FEEDERS make organic
    /// consensus unreachable.
    #[export(unwrap_result)]
    pub fn set_consensus_threshold(&mut self, threshold: u8) -> Result<(), OracleError> {
        self.ensure_admin()?;
        if threshold == 0 {
            return Err(OracleError::ThresholdMustBeAtLeastOne);
        }
        // Fix #2: threshold > MAX_FEEDERS makes consensus mathematically impossible.
        if threshold as usize > MAX_FEEDERS {
            return Err(OracleError::ThresholdExceedsMaxFeeders);
        }
        self.state.borrow_mut().consensus_threshold = threshold;
        self.emit_event(OracleEvent::ConsensusThresholdSet(threshold)).expect("event");
        Ok(())
    }

    /// Register the BolaoCore program address (informational — used by off-chain tooling).
    #[export(unwrap_result)]
    pub fn set_bolao_program(&mut self, program_id: ActorId) -> Result<(), OracleError> {
        self.ensure_admin()?;
        self.state.borrow_mut().bolao_program_id = Some(program_id);
        self.emit_event(OracleEvent::BolaoProgram(program_id)).expect("event");
        Ok(())
    }

    // ── ADMIN — result override ───────────────────────────────────────────────

    /// Admin or operator force-finalizes a result, bypassing the consensus requirement.
    /// Creates the oracle entry if it does not exist yet.
    #[export(unwrap_result)]
    pub fn force_finalize_result(
        &mut self,
        match_id: u64,
        home: u8,
        away: u8,
        penalty_winner: Option<PenaltyWinner>,
    ) -> Result<(), OracleError> {
        self.ensure_admin_or_operator()?;
        if match_id > MAX_MATCH_ID {
            return Err(OracleError::InvalidMatchId);
        }
        let score = Score { home, away };
        {
            let mut state = self.state.borrow_mut();
            let entry = state
                .match_results
                .entry(match_id)
                .or_insert_with(|| OracleMatchEntry {
                    match_id,
                    phase:        String::new(),
                    home:         String::new(),
                    away:         String::new(),
                    kick_off:     0,
                    submissions:  Vec::new(),
                    status:       OracleResultStatus::Pending,
                    final_result: None,
                });
            if entry.status == OracleResultStatus::Finalized {
                return Err(OracleError::AlreadyFinalized);
            }
            entry.status = OracleResultStatus::Finalized;
            entry.final_result = Some(FinalResult {
                score,
                penalty_winner,
                finalized_at: exec::block_timestamp(),
            });
        }
        self.emit_event(OracleEvent::ResultForced(match_id, score, penalty_winner)).expect("event");
        Ok(())
    }

    /// Admin cancels a disputed result, clearing all submissions and resetting the
    /// match to Pending so feeders can submit fresh results.
    /// Cannot cancel an already-finalized result (Fix #1).
    #[export(unwrap_result)]
    pub fn cancel_result(&mut self, match_id: u64) -> Result<(), OracleError> {
        self.ensure_admin()?;
        {
            let mut state = self.state.borrow_mut();
            let entry = state
                .match_results
                .get_mut(&match_id)
                .ok_or(OracleError::MatchNotFound)?;

            // Fix #1: block cancellation of finalized results to prevent
            // state inconsistency with downstream consumers (e.g. BolaoCore).
            if entry.status == OracleResultStatus::Finalized {
                return Err(OracleError::AlreadyFinalized);
            }

            entry.status = OracleResultStatus::Pending;
            entry.final_result = None;
            entry.submissions.clear();
        }
        self.emit_event(OracleEvent::ResultCancelled(match_id)).expect("event");
        Ok(())
    }

    // ── ADMIN — ownership transfer (2-step) ───────────────────────────────────

    /// Step 1: propose a new admin. Cannot be the zero address (Fix #3).
    #[export(unwrap_result)]
    pub fn propose_admin(&mut self, new_admin: ActorId) -> Result<(), OracleError> {
        self.ensure_admin()?;
        // Fix #3: zero-address would permanently brick admin access if accepted.
        if new_admin == ActorId::zero() {
            return Err(OracleError::InvalidAdmin);
        }
        let old = self.state.borrow().admin;
        self.state.borrow_mut().pending_admin = Some(new_admin);
        self.emit_event(OracleEvent::AdminProposed(old, new_admin)).expect("event");
        Ok(())
    }

    /// Step 2: new admin accepts. Caller must be the pending admin.
    #[export(unwrap_result)]
    pub fn accept_admin(&mut self) -> Result<(), OracleError> {
        let caller = msg::source();
        let (old, pending) = {
            let state = self.state.borrow();
            let pending = state.pending_admin.ok_or(OracleError::NoPendingAdmin)?;
            (state.admin, pending)
        };
        if caller != pending {
            return Err(OracleError::NotPendingAdmin);
        }
        {
            let mut state = self.state.borrow_mut();
            state.admin         = caller;
            state.pending_admin = None;
        }
        self.emit_event(OracleEvent::AdminChanged(old, caller)).expect("event");
        Ok(())
    }

    // ── FEEDER — result submission ────────────────────────────────────────────

    /// Authorized feeder submits a match result.
    ///
    /// - The match must be pre-registered by admin (Fix #8 — no phantom entries).
    /// - One submission per feeder per match.
    /// - Consensus only counts votes from currently authorized feeders (Fix #4).
    /// - Exactly ONE event is emitted, after the state transition is complete.
    /// - The entry borrow is released in an explicit inner scope before the
    ///   consensus re-read, preventing NLL ambiguity (Fix #6).
    #[export(unwrap_result)]
    pub fn submit_result(
        &mut self,
        match_id: u64,
        home: u8,
        away: u8,
        penalty_winner: Option<PenaltyWinner>,
    ) -> Result<(), OracleError> {
        self.ensure_feeder()?;

        if match_id > MAX_MATCH_ID {
            return Err(OracleError::InvalidMatchId);
        }

        let feeder = msg::source();
        let score  = Score { home, away };

        let (consensus_result, threshold) = {
            let mut state = self.state.borrow_mut();

            // Fix #8: require explicit admin registration — reject unknown match_ids.
            // Fix #6: entry borrow is confined to this inner scope; after the closing
            //         brace the mutable borrow on match_results is fully released,
            //         making the subsequent immutable get() unambiguous for the compiler.
            {
                let entry = state
                    .match_results
                    .get_mut(&match_id)
                    .ok_or(OracleError::MatchNotRegistered)?;

                if entry.status == OracleResultStatus::Finalized {
                    return Err(OracleError::AlreadyFinalized);
                }
                if feeder_already_submitted(&entry.submissions, feeder) {
                    return Err(OracleError::FeederAlreadySubmitted);
                }

                entry.submissions.push(ResultSubmission {
                    feeder,
                    score,
                    penalty_winner,
                    submitted_at: exec::block_timestamp(),
                });
            } // ← entry (and its mutable borrow on match_results) dropped here

            // Fix #4: pass authorized_feeders so revoked feeders' votes are excluded.
            let threshold = state.consensus_threshold;
            let consensus = find_consensus(
                &state.match_results.get(&match_id).unwrap().submissions,
                &state.authorized_feeders,
            );
            (consensus, threshold)
        }; // ← state borrow released here

        // ── Emit one event after the state is fully settled ───────────────────
        if let Some((c_score, c_pen, count)) = consensus_result {
            if count >= threshold {
                {
                    let mut state = self.state.borrow_mut();
                    let entry = state.match_results.get_mut(&match_id).unwrap();
                    entry.status       = OracleResultStatus::Finalized;
                    entry.final_result = Some(FinalResult {
                        score:          c_score,
                        penalty_winner: c_pen,
                        finalized_at:   exec::block_timestamp(),
                    });
                }
                self.emit_event(OracleEvent::ConsensusReached(match_id, c_score, c_pen))
                    .expect("event");
                return Ok(());
            }
        }

        self.emit_event(OracleEvent::ResultSubmitted(match_id, feeder, score)).expect("event");
        Ok(())
    }

    // ── FEEDER — price feed ───────────────────────────────────────────────────

    /// Authorized feeder pushes the current VARA/USD price on-chain.
    /// Range: [1, 100_000_000] micro-USD (= $0.000001 to $100 per VARA).
    #[export(unwrap_result)]
    pub fn set_vara_usd_price(
        &mut self,
        price_usd_micro: u64,
    ) -> Result<(), OracleError> {
        self.ensure_feeder()?;
        if !(1..=100_000_000).contains(&price_usd_micro) {
            return Err(OracleError::PriceOutOfRange);
        }
        {
            let mut state = self.state.borrow_mut();
            state.vara_price_usd_micro = price_usd_micro;
            state.price_updated_at     = exec::block_timestamp();
        }
        self.emit_event(OracleEvent::VaraPriceSet(price_usd_micro)).expect("event");
        Ok(())
    }

    // ── ADMIN — operator management ───────────────────────────────────────────

    /// Adds an operator. Only admin can call this.
    /// Operators can call register_match and force_finalize_result.
    #[export(unwrap_result)]
    pub fn add_operator(&mut self, new_operator: ActorId) -> Result<(), OracleError> {
        self.ensure_admin()?;
        if new_operator == ActorId::zero() {
            return Err(OracleError::InvalidOperator);
        }
        {
            let mut state = self.state.borrow_mut();
            if state.operators.contains(&new_operator) {
                return Err(OracleError::AlreadyAnOperator);
            }
            state.operators.push(new_operator);
        }
        self.emit_event(OracleEvent::OperatorAdded(new_operator)).expect("event");
        Ok(())
    }

    /// Removes an operator. Only admin can call this.
    #[export(unwrap_result)]
    pub fn remove_operator(&mut self, operator: ActorId) -> Result<(), OracleError> {
        self.ensure_admin()?;
        {
            let mut state = self.state.borrow_mut();
            let pos = state
                .operators
                .iter()
                .position(|a| *a == operator)
                .ok_or(OracleError::NotAnOperator)?;
            state.operators.remove(pos);
        }
        self.emit_event(OracleEvent::OperatorRemoved(operator)).expect("event");
        Ok(())
    }

    // ── QUERIES ───────────────────────────────────────────────────────────────

    /// Returns (price_usd_micro, price_updated_at). Both are 0 if never set.
    #[export]
    pub fn query_vara_usd_price(&self) -> (u64, u64) {
        let state = self.state.borrow();
        (state.vara_price_usd_micro, state.price_updated_at)
    }

    /// Full program state — admin, feeders, threshold, all match records.
    #[export]
    pub fn query_state(&self) -> IoOracleState {
        IoOracleState::from(&*self.state.borrow())
    }

    /// Returns the finalized result for a given match, or None if not yet finalized.
    #[export]
    pub fn query_match_result(&self, match_id: u64) -> Option<FinalResult> {
        self.state
            .borrow()
            .match_results
            .get(&match_id)
            .and_then(|e| e.final_result.clone())
    }

    /// Returns all match_ids that are still in Pending status.
    #[export]
    pub fn query_pending_matches(&self) -> Vec<u64> {
        self.state
            .borrow()
            .match_results
            .values()
            .filter(|e| e.status == OracleResultStatus::Pending)
            .map(|e| e.match_id)
            .collect()
    }

    /// Returns a flat view of all oracle entries.
    #[export]
    pub fn query_all_results(&self) -> Vec<IoMatchResult> {
        self.state
            .borrow()
            .match_results
            .values()
            .map(|e| IoMatchResult {
                match_id:     e.match_id,
                phase:        e.phase.clone(),
                home:         e.home.clone(),
                away:         e.away.clone(),
                kick_off:     e.kick_off,
                status:       e.status.clone(),
                final_result: e.final_result.clone(),
                submissions:  e.submissions.len() as u32,
            })
            .collect()
    }

    /// Returns the matches on which a specific feeder has submitted a result.
    #[export]
    pub fn query_feeder_submissions(
        &self,
        feeder: ActorId,
    ) -> Vec<(u64, Score, Option<PenaltyWinner>)> {
        let state = self.state.borrow();
        state
            .match_results
            .values()
            .flat_map(|e| {
                e.submissions
                    .iter()
                    .filter(move |s| s.feeder == feeder)
                    .map(move |s| (e.match_id, s.score, s.penalty_winner))
            })
            .collect()
    }

    #[export]
    pub fn contract_version_4(&self) -> u32 {
        4
    }
}
