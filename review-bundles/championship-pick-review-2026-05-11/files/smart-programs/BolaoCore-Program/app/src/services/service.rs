use sails_rs::{prelude::*, gstd::{exec, msg}};

use super::constants::{
    PROTOCOL_FEE_BPS, FINAL_PRIZE_BPS, BPS_DENOMINATOR,
    PODIUM_FINAL_PRIZE_BPS, PODIUM_PROTOCOL_FEE_BPS,
    BET_CLOSE_WINDOW_SECONDS, MIN_BET_PLANCK,
    MAX_PHASE_NAME_LEN, MAX_POINTS_WEIGHT, MAX_TEAM_NAME_LEN,
    CHALLENGE_WINDOW_MS, CLAIM_DEADLINE_MS,
};
use super::types::{
    Score, PenaltyWinner, ResultStatus, Match, Bet, UserBetRecord,
    UserBetView, PhaseConfig, PodiumPick, PodiumResult,
    WalletClaimStatus, FinalPrizeClaimStatus,
};
use super::events::SmartCupEvent;
use super::state::{SmartCupState, IoSmartCupState};
use super::utils::{
    outcome, advance_outcome, is_knockout, eligible_for_payout,
    top5_share_sum_bps, collect_leaderboard,
};

// ── Service bootstrap ─────────────────────────────────────────────────────────

#[derive(Default)]
pub struct Service;

impl Service {
    pub fn new() -> Self {
        Self
    }

    pub fn seed(admin: ActorId, treasury: ActorId) {
        SmartCupState::init(admin, treasury)
    }
}

#[sails_rs::service(events = SmartCupEvent)]
impl Service {

    // ── Admin: oracle management ──────────────────────────────────────────────

    #[export]
    pub fn set_oracle_authorized(&mut self, oracle: ActorId, authorized: bool) {
        let state = SmartCupState::state_mut();
        state.only_admin();

        state.authorized_oracles.insert(oracle, authorized);

        self.emit_event(SmartCupEvent::OracleAuthorized(oracle, authorized))
            .expect("event");
    }

    // ── Admin: phase & match registration ────────────────────────────────────

    #[export]
    pub fn register_phase(
        &mut self,
        phase_name: String,
        start_time: u64,
        end_time: u64,
        points_weight: u32,
    ) {
        let state = SmartCupState::state_mut();
        state.only_admin_or_operator();

        if phase_name.len() > MAX_PHASE_NAME_LEN {
            panic!("Phase name too long");
        }
        if state.phases.contains_key(&phase_name) {
            panic!("Duplicate phase");
        }
        if points_weight == 0 {
            panic!("Invalid points weight");
        }
       
        if points_weight > MAX_POINTS_WEIGHT {
            panic!("Points weight too large");
        }

        let phase = PhaseConfig {
            name: phase_name.clone(),
            start_time,
            end_time,
            points_weight,
        };
        state.phases.insert(phase_name.clone(), phase);

        self.emit_event(SmartCupEvent::PhaseRegistered(phase_name))
            .expect("event");
    }

    #[export]
    pub fn register_match(
        &mut self,
        phase: String,
        home: String,
        away: String,
        kick_off: u64,
    ) {
        let state = SmartCupState::state_mut();
        state.only_admin_or_operator();

        if !state.phases.contains_key(&phase) {
            panic!("Phase not found");
        }

        if home.len() > MAX_TEAM_NAME_LEN || home.is_empty() {
            panic!("Invalid home team name length");
        }
        if away.len() > MAX_TEAM_NAME_LEN || away.is_empty() {
            panic!("Invalid away team name length");
        }

        if kick_off <= exec::block_timestamp() {
            panic!("kick_off must be in the future");
        }

        let match_id = state.next_match_id.saturating_add(1);
        state.next_match_id = match_id;

        if phase == "Round of 32" {
            match state.r32_lock_time {
                None => state.r32_lock_time = Some(kick_off),
                Some(t) => {
                    if kick_off < t {
                        state.r32_lock_time = Some(kick_off);
                    }
                }
            }
        }

        let m = Match {
            match_id,
            phase: phase.clone(),
            home: home.clone(),
            away: away.clone(),
            kick_off,
            result: ResultStatus::Unresolved,
            match_prize_pool: 0,
            has_bets: false,
            participants: Vec::new(),
            total_winner_stake: 0,
            total_claimed: 0,
            settlement_prepared: false,
            dust_swept: false,
            finalized_at: None,
        };

        state.matches.insert(match_id, m);

        self.emit_event(SmartCupEvent::MatchRegistered(
            match_id,
            phase,
            home,
            away,
            kick_off,
        ))
        .expect("event");
    }

    // ── Betting ───────────────────────────────────────────────────────────────

    #[export]
    pub fn place_bet(
        &mut self,
        match_id: u64,
        predicted_score: Score,
        predicted_penalty_winner: Option<PenaltyWinner>,
    ) {
        let state = SmartCupState::state_mut();

        let bettor = msg::source();
        let sent_value = msg::value();
        let now = exec::block_timestamp();

        let m = state.matches.get_mut(&match_id).expect("Match not found");

        if sent_value < MIN_BET_PLANCK {
            panic!("Bet below minimum");
        }

        let close_time = m.kick_off.saturating_sub(BET_CLOSE_WINDOW_SECONDS);
        if now >= close_time {
            panic!("Betting closed");
        }
        if state.bets.contains_key(&(bettor, match_id)) {
            panic!("Already bet");
        }
        if predicted_score.home > 20 || predicted_score.away > 20 {
            panic!("Score too high");
        }

        let phase_weight = state
            .phases
            .get(&m.phase)
            .map(|p| p.points_weight)
            .unwrap_or(1);
        let knockout = is_knockout(phase_weight);

        let predicted_draw = predicted_score.home == predicted_score.away;

        if !knockout {
            if predicted_penalty_winner.is_some() {
                panic!("Penalty winner not allowed in group stage");
            }
        } else {
            if predicted_draw {
                if predicted_penalty_winner.is_none() {
                    panic!("Knockout draw requires penalty winner");
                }
            } else {
                if predicted_penalty_winner.is_some() {
                    panic!("Penalty winner only allowed when predicting draw");
                }
            }
        }

        let protocol_fee = sent_value.saturating_mul(PROTOCOL_FEE_BPS) / BPS_DENOMINATOR;
        let final_prize_cut = sent_value.saturating_mul(FINAL_PRIZE_BPS) / BPS_DENOMINATOR;
        let match_pool_cut = sent_value
            .saturating_sub(protocol_fee)
            .saturating_sub(final_prize_cut);

        state.protocol_fee_accumulated =
            state.protocol_fee_accumulated.saturating_add(protocol_fee);
        state.final_prize_accumulated =
            state.final_prize_accumulated.saturating_add(final_prize_cut);

        m.match_prize_pool = m.match_prize_pool.saturating_add(match_pool_cut);
        m.has_bets = true;
        if !m.participants.contains(&bettor) {
            m.participants.push(bettor);
        }

        let bet = Bet {
            user: bettor,
            match_id,
            score: predicted_score,
            penalty_winner: predicted_penalty_winner,
            stake_in_match_pool: match_pool_cut,
            claimed: false,
        };
        state.bets.insert((bettor, match_id), bet);

        let list = state.user_bets.entry(bettor).or_insert(Vec::new());
        list.push(UserBetRecord {
            match_id,
            score: predicted_score,
            penalty_winner: predicted_penalty_winner,
            stake_in_match_pool: match_pool_cut,
        });

        self.emit_event(SmartCupEvent::BetAccepted(
            bettor,
            match_id,
            predicted_score,
            predicted_penalty_winner,
            match_pool_cut,
        ))
        .expect("event");
    }

    // ── Oracle: result proposal ───────────────────────────────────────────────

    #[export]
    pub fn propose_result(
        &mut self,
        match_id: u64,
        final_score: Score,
        penalty_winner: Option<PenaltyWinner>,
    ) {
        let state = SmartCupState::state_mut();
        state.only_oracle();

        let oracle = msg::source();
        let proposed_at = exec::block_timestamp();
        let m = state.matches.get_mut(&match_id).expect("No such match");

        let phase_weight = state.phases.get(&m.phase).map(|p| p.points_weight).unwrap_or(1);
        if !is_knockout(phase_weight) && penalty_winner.is_some() {
            panic!("Group stage must not include penalty winner");
        }

        match &m.result {
            ResultStatus::Unresolved => {
                m.result = ResultStatus::Proposed {
                    score: final_score,
                    penalty_winner,
                    oracle,
                    proposed_at,
                };
            }
            _ => panic!("Result already proposed/finalized"),
        }

        self.emit_event(SmartCupEvent::ResultProposed(
            match_id,
            final_score,
            penalty_winner,
            oracle,
            proposed_at.saturating_add(CHALLENGE_WINDOW_MS),
        ))
        .expect("event");
    }

    // ── Admin: cancel wrong oracle proposal ──────────────────────────────────
    #[export]
    pub fn cancel_proposed_result(&mut self, match_id: u64) {
        let state = SmartCupState::state_mut();
        state.only_admin();

        let m = state.matches.get_mut(&match_id).expect("No such match");

        let oracle = match &m.result {
            ResultStatus::Proposed { oracle, proposed_at, .. } => {
                let expires_at = proposed_at.saturating_add(CHALLENGE_WINDOW_MS);
                if exec::block_timestamp() >= expires_at {
                    panic!("Challenge window expired — result is now final");
                }
                *oracle
            },
            ResultStatus::Unresolved => panic!("No proposal to cancel"),
            ResultStatus::Finalized { .. } => panic!("Result already finalized — cannot cancel"),
            ResultStatus::Cancelled => panic!("Match already cancelled"),
        };

        m.result = ResultStatus::Unresolved;

        self.emit_event(SmartCupEvent::ResultProposalCancelled(match_id, oracle))
            .expect("event");
    }

    // ── Admin: cancel match (real-world cancellation) ───────────────────────
    /// Marks a match as Cancelled and accumulates per-bettor refunds in
    /// pending_refunds. Use when a match cannot or will not produce a real
    /// result (suspension, abandonment, FIFA voiding, registration error).
    /// Bettors then call claim_refund() to pull their stake out.
    ///
    /// Refund amount per bettor = stake_in_match_pool (the 85% post-fee share).
    /// The 5% protocol fee and 10% final-prize cut already left this match's
    /// pool at place_bet time and are not returned.
    ///
    /// Cancelling a match is terminal — no transition out of Cancelled.
    /// Cannot cancel a match already Finalized (claims may have happened).
    #[export]
    pub fn cancel_match(&mut self, match_id: u64) {
        let state = SmartCupState::state_mut();
        state.only_admin();

        // Validate state transition
        {
            let m = state.matches.get(&match_id).expect("No such match");
            match m.result {
                ResultStatus::Unresolved | ResultStatus::Proposed { .. } => {}
                ResultStatus::Finalized { .. } => {
                    panic!("Match already finalized — cannot cancel")
                }
                ResultStatus::Cancelled => panic!("Match already cancelled"),
            }
        }

        // Snapshot participants to release the matches borrow before touching bets
        let participants: Vec<ActorId> = state
            .matches
            .get(&match_id)
            .expect("No such match")
            .participants
            .clone();

        // Accumulate refunds per bettor; mark each bet as claimed to block
        // both claim_match_reward and double-cancel.
        let mut total_refunded: u128 = 0;
        for participant in participants.iter() {
            let refund = match state.bets.get_mut(&(*participant, match_id)) {
                Some(bet) if !bet.claimed && bet.stake_in_match_pool > 0 => {
                    let r = bet.stake_in_match_pool;
                    bet.claimed = true;
                    r
                }
                _ => continue,
            };

            let entry = state.pending_refunds.entry(*participant).or_insert(0);
            *entry = entry.saturating_add(refund);
            total_refunded = total_refunded.saturating_add(refund);
        }

        // Mark match as cancelled and saneado for finalize_final_prize_pool
        let m = state.matches.get_mut(&match_id).expect("No such match");
        m.match_prize_pool = 0;
        m.total_winner_stake = 0;
        m.settlement_prepared = true;
        m.dust_swept = true;
        m.result = ResultStatus::Cancelled;
        m.finalized_at = Some(exec::block_timestamp());

        self.emit_event(SmartCupEvent::MatchCancelled(match_id, total_refunded))
            .expect("event");
    }

    // ── User: claim refund from cancelled matches ───────────────────────────
    #[export]
    pub fn claim_refund(&mut self) {
        let state = SmartCupState::state_mut();
        let caller = msg::source();

        let amount = state.pending_refunds.get(&caller).cloned().unwrap_or(0);
        if amount == 0 {
            panic!("No refund available");
        }

        // CEI: clear before send
        state.pending_refunds.insert(caller, 0);

        msg::send_with_gas(caller, (), 0, amount)
            .unwrap_or_else(|_| panic!("Refund send failed"));

        self.emit_event(SmartCupEvent::RefundClaimed(caller, amount))
            .expect("event");
    }

    // ── Oracle: pull result directly from Oracle-Program ─────────────────────
    #[export]
    pub async fn propose_from_oracle(
        &mut self,
        match_id: u64,
        oracle_program_id: ActorId,
    ) {
        // 1. Verify oracle is authorized and match is still Unresolved
        {
            let state = SmartCupState::state_mut();
            if !state.authorized_oracles.get(&oracle_program_id).cloned().unwrap_or(false) {
                panic!("Oracle not authorized");
            }
            let m = state.matches.get(&match_id).expect("No such match");
            if !matches!(m.result, ResultStatus::Unresolved) {
                panic!("Result already proposed or finalized");
            }
        }

        // 2. Build sails-rs encoded call: (service_name, method_name, params)
        //    Mirrors the TypeScript pattern: registry.createType('(String, String, u64)', ...)
        let payload = {
            use sails_rs::scale_codec::Encode;
            ("Service", "QueryMatchResult", match_id).encode()
        };

        // 3. Cross-program query to Oracle-Program
        //    Reply format: (String, String, Option<FinalResult>)
        let reply_bytes = msg::send_bytes_for_reply(oracle_program_id, &payload, 0, 0)
            .expect("Failed to send query to Oracle-Program")
            .await
            .expect("Oracle-Program query reply failed");

        // 4. Decode the sails-rs reply: (service, method, return_value)
        //    Types come from oracle-client — same SCALE encoding, no manual mirrors needed.
        let oracle_final = {
            use sails_rs::scale_codec::Decode;
            let (_svc, _method, result): (String, String, Option<oracle_client::FinalResult>) =
                Decode::decode(&mut reply_bytes.as_slice())
                    .expect("Failed to decode Oracle-Program reply");
            result.expect("Oracle-Program has no finalized result for this match")
        };

        // 5. Map oracle-client types → BolaoCore types
        let score = Score {
            home: oracle_final.score.home,
            away: oracle_final.score.away,
        };
        let penalty_winner = oracle_final.penalty_winner.map(|pw| match pw {
            oracle_client::PenaltyWinner::Home => PenaltyWinner::Home,
            oracle_client::PenaltyWinner::Away => PenaltyWinner::Away,
        });

        // 6. Set match to Proposed — challenge window begins now.
        //    TOCTOU guard: state may have changed during the .await above
        //    (e.g. admin called cancel_match, or another propose_result raced in).
        let proposed_at = exec::block_timestamp();
        let state = SmartCupState::state_mut();
        let m = state.matches.get_mut(&match_id).expect("No such match");
        if !matches!(m.result, ResultStatus::Unresolved) {
            panic!("Match state changed during oracle query — aborting proposal");
        }
        m.result = ResultStatus::Proposed { score, penalty_winner, oracle: oracle_program_id, proposed_at };

        self.emit_event(SmartCupEvent::ResultProposed(
            match_id,
            score,
            penalty_winner,
            oracle_program_id,
            proposed_at.saturating_add(CHALLENGE_WINDOW_MS),
        ))
        .expect("event");
    }

    // ── Result finalization + settlement (fused) ─────────────────────────────

    #[export]
    pub fn finalize_result(&mut self, match_id: u64) {
        let state = SmartCupState::state_mut();
        // Permissionless after challenge window — no only_admin() guard

        let m = state.matches.get_mut(&match_id).expect("No such match");

        let (final_score, final_penalty_winner) = match &m.result {
            ResultStatus::Proposed {
                score,
                penalty_winner,
                oracle: _,
                proposed_at,
            } => {
                let expires_at = proposed_at.saturating_add(CHALLENGE_WINDOW_MS);
                if exec::block_timestamp() < expires_at {
                    panic!("Challenge window not expired yet");
                }
                (*score, *penalty_winner)
            },
            ResultStatus::Cancelled => panic!("Match cancelled — cannot finalize"),
            _ => panic!("Not proposed or already finalized"),
        };

        let phase_weight = state
            .phases
            .get(&m.phase)
            .map(|p| p.points_weight)
            .unwrap_or(1);
        let knockout = is_knockout(phase_weight);

        let draw_final = final_score.home == final_score.away;
        if knockout {
            if draw_final && final_penalty_winner.is_none() {
                panic!("Knockout draw result requires penalty winner");
            }
            if !draw_final && final_penalty_winner.is_some() {
                panic!("Penalty winner should be None when final score is not a draw");
            }
        } else {
            if final_penalty_winner.is_some() {
                panic!("Group stage must not include penalty winner");
            }
        }

        m.result = ResultStatus::Finalized {
            score: final_score,
            penalty_winner: final_penalty_winner,
        };

        let final_outcome = if knockout {
            advance_outcome(final_score, final_penalty_winner)
        } else {
            outcome(final_score)
        };

        // Combined loop: award points + accumulate winner stake in one pass
        let mut total_winner_stake: u128 = 0;

        for participant in m.participants.iter() {
            if let Some(bet) = state.bets.get(&(*participant, match_id)) {
                let mut added_points: u32 = 0;

                let bet_outcome = if knockout {
                    if bet.score.home == bet.score.away {
                        if bet.penalty_winner.is_none() {
                            0
                        } else {
                            advance_outcome(bet.score, bet.penalty_winner)
                        }
                    } else {
                        outcome(bet.score)
                    }
                } else {
                    outcome(bet.score)
                };

                let penalties_correct = if knockout && draw_final {
                    bet.penalty_winner.is_some() && bet.penalty_winner == final_penalty_winner
                } else {
                    true
                };

                if bet.score == final_score && penalties_correct {
                    added_points = 3u32.saturating_mul(phase_weight);
                } else if bet_outcome == final_outcome {
                    added_points = phase_weight;
                }

                if added_points > 0 {
                    let pts = state.user_points.entry(*participant).or_insert(0);
                    *pts = pts.saturating_add(added_points);

                    self.emit_event(SmartCupEvent::PointsAwarded(
                        *participant,
                        match_id,
                        added_points,
                    ))
                    .expect("event");
                }

                // Settlement: accumulate winner stake in the same pass
                if eligible_for_payout(
                    bet.score,
                    bet.penalty_winner,
                    final_score,
                    final_penalty_winner,
                    phase_weight,
                ) {
                    total_winner_stake =
                        total_winner_stake.saturating_add(bet.stake_in_match_pool);
                }
            }
        }

        // Settle immediately — no separate prepare_match_settlement() needed
        if total_winner_stake == 0 {
            state.final_prize_accumulated = state
                .final_prize_accumulated
                .saturating_add(m.match_prize_pool);
            m.match_prize_pool = 0;
            m.dust_swept = true;
        }
        m.total_winner_stake = total_winner_stake;
        m.settlement_prepared = true;
        m.finalized_at = Some(exec::block_timestamp());

        self.emit_event(SmartCupEvent::ResultFinalized(
            match_id,
            final_score,
            final_penalty_winner,
        ))
        .expect("event");

        self.emit_event(SmartCupEvent::SettlementPrepared(match_id, total_winner_stake))
            .expect("event");
    }

    // ── Settlement ────────────────────────────────────────────────────────────

    #[export]
    pub fn claim_match_reward(&mut self, match_id: u64) {
        let state = SmartCupState::state_mut();
        let caller = msg::source();

        let m = state.matches.get_mut(&match_id).expect("No such match");

        if m.match_prize_pool == 0 || m.total_winner_stake == 0 {
            panic!("No rewards for this match");
        }

        let bet = state
            .bets
            .get_mut(&(caller, match_id))
            .expect("No bet for this match");

        if bet.claimed {
            panic!("Already claimed");
        }

        let (final_score, final_penalty_winner) = match m.result {
            ResultStatus::Finalized { score, penalty_winner } => (score, penalty_winner),
            ResultStatus::Cancelled => panic!("Match cancelled — claim refund instead"),
            _ => panic!("Match not finalized"),
        };

        let phase_weight = state
            .phases
            .get(&m.phase)
            .map(|p| p.points_weight)
            .unwrap_or(1);

        let eligible = eligible_for_payout(
            bet.score,
            bet.penalty_winner,
            final_score,
            final_penalty_winner,
            phase_weight,
        );

        if !eligible {
            panic!("Not eligible for payout");
        }

        let share = bet
            .stake_in_match_pool
            .saturating_mul(m.match_prize_pool)
            .checked_div(m.total_winner_stake)
            .expect("Division by zero: total_winner_stake is zero");

        if share == 0 {
            bet.claimed = true;
            panic!("Zero payout");
        }

        bet.claimed = true;
        m.total_claimed = m.total_claimed.saturating_add(share);

        msg::send_with_gas(caller, (), 0, share)
            .unwrap_or_else(|_| panic!("Failed to send reward"));

        self.emit_event(SmartCupEvent::MatchRewardClaimed(match_id, caller, share))
            .expect("event");
    }

    // ── Dust sweep ────────────────────────────────────────────────────────────

    #[export]
    pub fn sweep_match_dust_to_final_prize(&mut self, match_id: u64) {
        let state = SmartCupState::state_mut();
        // Permissionless — no only_admin() guard

        {
            let m = state.matches.get(&match_id).expect("No such match");

            if !m.settlement_prepared {
                panic!("Settlement not prepared");
            }
            if m.dust_swept {
                panic!("Dust already swept");
            }

            if m.match_prize_pool > 0 {
                let deadline_passed = m.finalized_at
                    .map(|t| exec::block_timestamp() >= t.saturating_add(CLAIM_DEADLINE_MS))
                    .unwrap_or(false);

                // Before deadline: guard requires all winners to have claimed
                if !deadline_passed {
                    let (final_score, final_penalty_winner) = match m.result {
                        ResultStatus::Finalized { score, penalty_winner } => (score, penalty_winner),
                        _ => panic!("Match not finalized"),
                    };
                    let phase_weight = state
                        .phases
                        .get(&m.phase)
                        .map(|p| p.points_weight)
                        .unwrap_or(1);

                    for participant in m.participants.iter() {
                        if let Some(bet) = state.bets.get(&(*participant, match_id)) {
                            if !bet.claimed
                                && eligible_for_payout(
                                    bet.score,
                                    bet.penalty_winner,
                                    final_score,
                                    final_penalty_winner,
                                    phase_weight,
                                )
                            {
                                panic!("Unclaimed eligible bets remain — wait for 72h claim deadline");
                            }
                        }
                    }
                }
                // After deadline: sweep unconditionally, forfeiting unclaimed rewards
            }
        }

        let m = state.matches.get_mut(&match_id).expect("No such match");

        if m.match_prize_pool == 0 {
            m.dust_swept = true;
            self.emit_event(SmartCupEvent::MatchDustSwept(match_id, 0))
                .expect("event");
            return;
        }

        let dust = m.match_prize_pool.saturating_sub(m.total_claimed);
        state.final_prize_accumulated =
            state.final_prize_accumulated.saturating_add(dust);

        m.match_prize_pool = 0;
        m.dust_swept = true;

        self.emit_event(SmartCupEvent::MatchDustSwept(match_id, dust))
            .expect("event");
    }

    // ── Podium picks ──────────────────────────────────────────────────────────

    #[export]
    pub fn submit_podium_pick(
        &mut self,
        champion: String,
        runner_up: String,
        third_place: String,
    ) {
        let state = SmartCupState::state_mut();
        let user = msg::source();
        let sent_value = msg::value();
        let now = exec::block_timestamp();

        if sent_value < MIN_BET_PLANCK {
            panic!("Podium pick below minimum");
        }

        let lock = state.r32_lock_time.expect("R32 lock time not set");
        if now >= lock {
            panic!("Podium picks locked");
        }
        if state.podium_picks.contains_key(&user) {
            panic!("Podium pick already submitted");
        }

        if champion.is_empty() || champion.len() > MAX_TEAM_NAME_LEN {
            panic!("Invalid champion name length");
        }
        if runner_up.is_empty() || runner_up.len() > MAX_TEAM_NAME_LEN {
            panic!("Invalid runner_up name length");
        }
        if third_place.is_empty() || third_place.len() > MAX_TEAM_NAME_LEN {
            panic!("Invalid third_place name length");
        }

        let protocol_fee = sent_value.saturating_mul(PODIUM_PROTOCOL_FEE_BPS) / BPS_DENOMINATOR;
        let final_prize_cut = sent_value
            .saturating_mul(PODIUM_FINAL_PRIZE_BPS)
            / BPS_DENOMINATOR;

        state.protocol_fee_accumulated =
            state.protocol_fee_accumulated.saturating_add(protocol_fee);
        state.final_prize_accumulated =
            state.final_prize_accumulated.saturating_add(final_prize_cut);

        state.podium_picks.insert(
            user,
            PodiumPick {
                champion: champion.clone(),
                runner_up: runner_up.clone(),
                third_place: third_place.clone(),
            },
        );

        self.emit_event(SmartCupEvent::PodiumPickSubmitted(
            user,
            champion,
            runner_up,
            third_place,
        ))
        .expect("event");
    }

    #[export]
    pub fn finalize_podium(
        &mut self,
        champion: String,
        runner_up: String,
        third_place: String,
    ) {
        let state = SmartCupState::state_mut();
        state.only_admin();

        if state.podium_finalized {
            panic!("Already finalized");
        }

        state.podium_finalized = true;
        state.podium_result = Some(PodiumResult {
            champion: champion.clone(),
            runner_up: runner_up.clone(),
            third_place: third_place.clone(),
        });

        self.emit_event(SmartCupEvent::PodiumFinalized(
            champion.clone(),
            runner_up.clone(),
            third_place.clone(),
        ))
        .expect("event");

        // Collect bonuses first to avoid borrowing state while mutating it.
        let bonuses: Vec<(ActorId, u32)> = state
            .podium_picks
            .iter()
            .filter_map(|(user, pick)| {
                let mut bonus: u32 = 0;
                if pick.champion == champion {
                    bonus = bonus.saturating_add(20);
                }
                if pick.runner_up == runner_up {
                    bonus = bonus.saturating_add(10);
                }
                if pick.third_place == third_place {
                    bonus = bonus.saturating_add(5);
                }
                if bonus > 0 { Some((*user, bonus)) } else { None }
            })
            .collect();

        for (user, bonus) in bonuses {
            let pts = state.user_points.entry(user).or_insert(0);
            *pts = pts.saturating_add(bonus);
            self.emit_event(SmartCupEvent::PodiumBonusAwarded(user, bonus))
                .expect("event");
        }
    }

    // ── Final prize pool ──────────────────────────────────────────────────────

    #[export]
    pub fn finalize_final_prize_pool(&mut self) {
        let state = SmartCupState::state_mut();
        state.only_admin();

        if state.final_prize_finalized {
            panic!("Final prize already finalized");
        }
        if !state.podium_finalized {
            panic!("Podium not finalized");
        }

        for m in state.matches.values() {
            match m.result {
                ResultStatus::Finalized { .. } | ResultStatus::Cancelled => {}
                _ => panic!("Not all matches finalized or cancelled"),
            }
            if !m.settlement_prepared {
                panic!("Not all match settlements prepared");
            }
            if !m.dust_swept {
                panic!("Not all match dust swept");
            }
        }

        let pool = state.final_prize_accumulated;
        if pool == 0 {
            panic!("No final prize pool");
        }

        let leaderboard = collect_leaderboard(state);
        if leaderboard.is_empty() {
            panic!("No participants");
        }

        let mut i: usize = 0;
        let mut current_position: usize = 1;
        let mut total_allocated: u128 = 0;

        while i < leaderboard.len() && current_position <= 5 {
            let tied_points = leaderboard[i].1;
            let mut j = i + 1;

            while j < leaderboard.len() && leaderboard[j].1 == tied_points {
                j += 1;
            }

            let group_size = j - i; // always >= 1 by loop invariant
            let start_pos = current_position;
            let end_pos = current_position + group_size - 1;
            let affected_end = end_pos.min(5);

            if start_pos <= 5 {
                let group_bps = top5_share_sum_bps(start_pos, affected_end);
                if group_bps > 0 {
                    let group_amount = pool.saturating_mul(group_bps) / BPS_DENOMINATOR;

                    let per_wallet = group_amount
                        .checked_div(group_size as u128)
                        .expect("Division by zero: group_size is zero");

                    if per_wallet > 0 {
                        for k in i..j {
                            let wallet = leaderboard[k].0;
                            state.final_prize_allocations.insert(wallet, per_wallet);
                            state.final_prize_claimed.insert(wallet, false);
                        }
                        total_allocated = total_allocated
                            .saturating_add(per_wallet.saturating_mul(group_size as u128));
                    }
                }
            }

            current_position = current_position.saturating_add(group_size);
            i = j;
        }

        if total_allocated == 0 {
            panic!("Nothing allocated");
        }

        let dust = pool.saturating_sub(total_allocated);

        state.final_prize_finalized = true;
        state.final_prize_claimable_total = total_allocated;
        state.final_prize_accumulated = 0;

        if dust > 0 {
            let treasury = state.treasury;
            state.final_prize_rounding_dust = 0;
            msg::send(treasury, (), dust).expect("Dust auto-sweep failed");
            self.emit_event(SmartCupEvent::FinalPrizeRoundingDustWithdrawn(dust, treasury))
                .expect("event");
        } else {
            state.final_prize_rounding_dust = 0;
        }

        self.emit_event(SmartCupEvent::FinalPrizePoolFinalized(total_allocated, dust))
            .expect("event");
    }

    #[export]
    pub fn claim_final_prize(&mut self) {
        let state = SmartCupState::state_mut();
        let caller = msg::source();

        if !state.final_prize_finalized {
            panic!("Final prize not finalized");
        }

        let already_claimed = state
            .final_prize_claimed
            .get(&caller)
            .cloned()
            .unwrap_or(false);

        if already_claimed {
            panic!("Final prize already claimed");
        }

        let amount = state
            .final_prize_allocations
            .get(&caller)
            .cloned()
            .unwrap_or(0);

        if amount == 0 {
            panic!("Not eligible for final prize");
        }

        // CEI: update state BEFORE external send
        state.final_prize_claimed.insert(caller, true);
        state.final_prize_claimable_total =
            state.final_prize_claimable_total.saturating_sub(amount);

        msg::send_with_gas(caller, (), 0, amount)
            .unwrap_or_else(|_| panic!("Failed to send final prize"));

        self.emit_event(SmartCupEvent::FinalPrizeClaimed(caller, amount))
            .expect("event");
    }

    // ── Admin: withdrawals ────────────────────────────────────────────────────

    #[export]
    pub fn withdraw_protocol_fees(&mut self) {
        let state = SmartCupState::state_mut();
        state.only_admin();

        let to = state.treasury;
        let amt = state.protocol_fee_accumulated;

        if amt == 0 {
            panic!("No protocol fees");
        }

        state.protocol_fee_accumulated = 0;
        msg::send(to, (), amt).expect("Fee transfer failed");

        self.emit_event(SmartCupEvent::ProtocolFeesWithdrawn(amt, to))
            .expect("event");
    }

    #[export]
    pub fn withdraw_final_prize_rounding_dust(&mut self) {
        let state = SmartCupState::state_mut();
        state.only_admin();

        if !state.final_prize_finalized {
            panic!("Final prize not finalized");
        }

        let amt = state.final_prize_rounding_dust;
        if amt == 0 {
            panic!("No final prize rounding dust");
        }

        let to = state.treasury;
        state.final_prize_rounding_dust = 0;
        msg::send(to, (), amt).expect("Final prize rounding dust transfer failed");

        self.emit_event(SmartCupEvent::FinalPrizeRoundingDustWithdrawn(amt, to))
            .expect("event");
    }

    /// Adds a new admin to the admins list. Any existing admin can call this.
    #[export]
    pub fn add_admin(&mut self, new_admin: ActorId) {
        let state = SmartCupState::state_mut();
        state.only_admin();

        if new_admin == ActorId::zero() {
            panic!("Invalid admin address");
        }
        if state.admins.contains(&new_admin) {
            panic!("Already an admin");
        }

        state.admins.push(new_admin);

        self.emit_event(SmartCupEvent::AdminAdded(new_admin))
            .expect("event");
    }

    /// Removes an admin from the admins list. Any existing admin can call this.
    /// Panics if trying to remove the last admin.
    #[export]
    pub fn remove_admin(&mut self, admin_to_remove: ActorId) {
        let state = SmartCupState::state_mut();
        state.only_admin();

        if state.admins.len() <= 1 {
            panic!("Cannot remove last admin");
        }

        let pos = state
            .admins
            .iter()
            .position(|a| *a == admin_to_remove)
            .expect("Address is not an admin");

        state.admins.remove(pos);

        self.emit_event(SmartCupEvent::AdminRemoved(admin_to_remove))
            .expect("event");
    }

    // ── Operator management (admin-only) ──────────────────────────────────────

    /// Adds an operator. Only admins can call this.
    /// Operators can call register_phase and register_match.
    #[export]
    pub fn add_operator(&mut self, new_operator: ActorId) {
        let state = SmartCupState::state_mut();
        state.only_admin();

        if new_operator == ActorId::zero() {
            panic!("Invalid operator address");
        }
        if state.operators.contains(&new_operator) {
            panic!("Already an operator");
        }

        state.operators.push(new_operator);

        self.emit_event(SmartCupEvent::OperatorAdded(new_operator))
            .expect("event");
    }

    /// Removes an operator. Only admins can call this.
    #[export]
    pub fn remove_operator(&mut self, operator_to_remove: ActorId) {
        let state = SmartCupState::state_mut();
        state.only_admin();

        let pos = state
            .operators
            .iter()
            .position(|a| *a == operator_to_remove)
            .expect("Address is not an operator");

        state.operators.remove(pos);

        self.emit_event(SmartCupEvent::OperatorRemoved(operator_to_remove))
            .expect("event");
    }

    /// Updates the treasury address. Only admins can call this.
    /// The treasury receives protocol fees and rounding dust.
    #[export]
    pub fn set_treasury(&mut self, new_treasury: ActorId) {
        let state = SmartCupState::state_mut();
        state.only_admin();

        if new_treasury == ActorId::zero() {
            panic!("Invalid treasury address");
        }

        let old = state.treasury;
        state.treasury = new_treasury;

        self.emit_event(SmartCupEvent::TreasuryChanged(old, new_treasury))
            .expect("event");
    }

    // ── Queries ───────────────────────────────────────────────────────────────

    #[export]
    pub fn query_match(&self, match_id: u64) -> Option<Match> {
        SmartCupState::state_ref().matches.get(&match_id).cloned()
    }

    #[export]
    pub fn query_user_points(&self, user: ActorId) -> u32 {
        SmartCupState::state_ref()
            .user_points
            .get(&user)
            .cloned()
            .unwrap_or(0)
    }

    #[export]
    pub fn query_matches_by_phase(&self, phase: String) -> Vec<Match> {
        let state = SmartCupState::state_ref();
        state
            .matches
            .values()
            .filter(|m| m.phase == phase)
            .cloned()
            .collect()
    }

    #[export]
    pub fn query_state(&self) -> IoSmartCupState {
        SmartCupState::state_ref().clone().into()
    }

    #[export]
    pub fn query_wallet_claim_status(&self, wallet: ActorId) -> WalletClaimStatus {
        let state = SmartCupState::state_ref();

        let records = match state.user_bets.get(&wallet) {
            Some(v) => v,
            None => {
                return WalletClaimStatus {
                    wallet,
                    amount_claimable: 0,
                    already_claimed: false,
                };
            }
        };

        let mut total_claimable: u128 = 0;
        let mut has_unclaimed_eligible = false;

        for r in records.iter() {
            let m = match state.matches.get(&r.match_id) {
                Some(m) => m,
                None => continue,
            };

            if !m.settlement_prepared || m.match_prize_pool == 0 || m.total_winner_stake == 0 {
                continue;
            }

            let bet = match state.bets.get(&(wallet, r.match_id)) {
                Some(b) => b,
                None => continue,
            };

            if bet.claimed {
                continue;
            }

            let (final_score, final_penalty_winner) = match m.result {
                ResultStatus::Finalized { score, penalty_winner } => (score, penalty_winner),
                _ => continue,
            };

            let phase_weight = state
                .phases
                .get(&m.phase)
                .map(|p| p.points_weight)
                .unwrap_or(1);

            let eligible = eligible_for_payout(
                bet.score,
                bet.penalty_winner,
                final_score,
                final_penalty_winner,
                phase_weight,
            );

            if !eligible {
                continue;
            }

            let claimable = bet
                .stake_in_match_pool
                .saturating_mul(m.match_prize_pool)
                .checked_div(m.total_winner_stake)
                .unwrap_or(0);

            if claimable > 0 {
                total_claimable = total_claimable.saturating_add(claimable);
                has_unclaimed_eligible = true;
            }
        }

        WalletClaimStatus {
            wallet,
            amount_claimable: total_claimable,
            already_claimed: !has_unclaimed_eligible,
        }
    }

    #[export]
    pub fn query_bets_by_user(&self, user: ActorId) -> Vec<UserBetView> {
        let state = SmartCupState::state_ref();

        let records = match state.user_bets.get(&user) {
            Some(v) => v,
            None => return Vec::new(),
        };

        let mut out = Vec::with_capacity(records.len());
        for r in records.iter() {
            let claimed = state
                .bets
                .get(&(user, r.match_id))
                .map(|b| b.claimed)
                .unwrap_or(false);

            out.push(UserBetView {
                match_id: r.match_id,
                score: r.score,
                penalty_winner: r.penalty_winner,
                stake_in_match_pool: r.stake_in_match_pool,
                claimed,
            });
        }
        out
    }

    #[export]
    pub fn query_final_prize_claim_status(&self, wallet: ActorId) -> FinalPrizeClaimStatus {
        let state = SmartCupState::state_ref();

        let points = state.user_points.get(&wallet).cloned().unwrap_or(0);
        let allocated = state
            .final_prize_allocations
            .get(&wallet)
            .cloned()
            .unwrap_or(0);
        let already_claimed = state
            .final_prize_claimed
            .get(&wallet)
            .cloned()
            .unwrap_or(false);

        FinalPrizeClaimStatus {
            wallet,
            final_prize_finalized: state.final_prize_finalized,
            eligible: allocated > 0,
            amount_claimable: if already_claimed { 0 } else { allocated },
            already_claimed,
            points,
        }
    }

    #[export]
    pub fn query_pending_refund(&self, user: ActorId) -> u128 {
        SmartCupState::state_ref()
            .pending_refunds
            .get(&user)
            .cloned()
            .unwrap_or(0)
    }
}
