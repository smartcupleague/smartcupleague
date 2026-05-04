use bolao_program::client::{
    service::Service as BolaoSvc, // trait — needed for method dispatch
    ResultStatus, Score,
};
use sails_rs::prelude::*;

mod fixture;
mod utils;

use fixture::{actor, Fixture, ADMIN, NEW_ADMIN, OPERATOR, TREASURY, ORACLE, STRANGER, USER1, USER2};
use utils::{
    AWAY_TEAM, BET_5_VARA, BET_10_VARA, CHALLENGE_WINDOW_BLOCKS, CLAIM_DEADLINE_BLOCKS,
    GROUP_PHASE, HOME_TEAM, KICK_OFF, MIN_BET, ONE_VARA,
};

// ── Shared setup helpers ──────────────────────────────────────────────────────

/// Registers Group Stage + one match. Returns match_id = 1.
async fn setup_phase_and_match(f: &Fixture) -> u64 {
    f.program
        .service("Service")
        .register_phase(GROUP_PHASE.to_string(), 0, u64::MAX, 1)
        .await
        .unwrap();
    f.program
        .service("Service")
        .register_match(
            GROUP_PHASE.to_string(),
            HOME_TEAM.to_string(),
            AWAY_TEAM.to_string(),
            KICK_OFF,
        )
        .await
        .unwrap();
    1
}

/// Authorizes ORACLE and proposes `score` for `match_id`.
async fn propose(f: &Fixture, match_id: u64, score: Score) {
    f.program
        .service("Service")
        .set_oracle_authorized(actor(ORACLE), true)
        .await
        .unwrap();
    f.as_actor(ORACLE)
        .service("Service")
        .propose_result(match_id, score, None)
        .await
        .unwrap();
}

/// Proposes `score` then advances past the 24h window and finalizes.
/// Returns the match_id for convenience.
async fn propose_and_finalize(f: &Fixture, match_id: u64, score: Score) {
    propose(f, match_id, score).await;
    f.spend_blocks(CHALLENGE_WINDOW_BLOCKS + 1);
    f.program
        .service("Service")
        .finalize_result(match_id)
        .await
        .unwrap();
}

// ── Test 1: deploy ────────────────────────────────────────────────────────────

#[tokio::test]
async fn deploy_and_query_state() {
    let f = Fixture::new().await;

    let state = f.program.service("Service").query_state().query().unwrap();

    assert!(state.admins.contains(&actor(ADMIN)));
    assert_eq!(state.admins.len(), 1);
    assert_eq!(state.treasury, actor(TREASURY));
    assert_eq!(state.protocol_fee_accumulated, 0);
    assert_eq!(state.final_prize_accumulated, 0);
    assert!(state.matches.is_empty());
    assert!(state.phases.is_empty());
    assert!(!state.podium_finalized);
    assert!(!state.final_prize_finalized);
}

// ── Test 2: oracle access control ────────────────────────────────────────────

#[tokio::test]
async fn set_oracle_authorized() {
    let f = Fixture::new().await;

    // Stranger cannot authorize an oracle.
    let err = f
        .as_actor(STRANGER)
        .service("Service")
        .set_oracle_authorized(actor(ORACLE), true)
        .await;
    assert!(err.is_err(), "non-admin should not authorize oracle");

    // Admin authorizes oracle.
    f.program
        .service("Service")
        .set_oracle_authorized(actor(ORACLE), true)
        .await
        .unwrap();

    // Admin can also revoke.
    f.program
        .service("Service")
        .set_oracle_authorized(actor(ORACLE), false)
        .await
        .expect("revoking oracle should succeed");
}

// ── Test 3: phase registration ────────────────────────────────────────────────

#[tokio::test]
async fn register_phase_happy_path() {
    let f = Fixture::new().await;

    f.program
        .service("Service")
        .register_phase(GROUP_PHASE.to_string(), 0, u64::MAX, 1)
        .await
        .unwrap();

    let state = f.program.service("Service").query_state().query().unwrap();
    assert_eq!(state.phases.len(), 1);
    assert_eq!(state.phases[0].name, GROUP_PHASE);
    assert_eq!(state.phases[0].points_weight, 1);
}

// ── Test 4: phase validation ──────────────────────────────────────────────────

#[tokio::test]
async fn register_phase_validations() {
    let f = Fixture::new().await;

    let err = f
        .program
        .service("Service")
        .register_phase("Phase A".to_string(), 0, 100, 0)
        .await;
    assert!(err.is_err(), "weight 0 should be rejected");

    let err = f
        .program
        .service("Service")
        .register_phase("Phase B".to_string(), 0, 100, 21)
        .await;
    assert!(err.is_err(), "weight > 20 should be rejected");

    f.program
        .service("Service")
        .register_phase("Phase C".to_string(), 0, 100, 1)
        .await
        .unwrap();

    // Duplicate name.
    let err = f
        .program
        .service("Service")
        .register_phase("Phase C".to_string(), 0, 200, 1)
        .await;
    assert!(err.is_err(), "duplicate phase should be rejected");

    // Stranger cannot register.
    let err = f
        .as_actor(STRANGER)
        .service("Service")
        .register_phase("Phase D".to_string(), 0, 100, 1)
        .await;
    assert!(err.is_err(), "non-admin should not register phase");
}

// ── Test 5: match registration ────────────────────────────────────────────────

#[tokio::test]
async fn register_match_happy_path() {
    let f = Fixture::new().await;
    let match_id = setup_phase_and_match(&f).await;

    let m = f
        .program
        .service("Service")
        .query_match(match_id)
        .query()
        .unwrap()
        .expect("match 1 should exist");

    assert_eq!(m.match_id, 1);
    assert_eq!(m.home, HOME_TEAM);
    assert_eq!(m.away, AWAY_TEAM);
    assert_eq!(m.kick_off, KICK_OFF);
    assert!(!m.has_bets);
    assert!(m.finalized_at.is_none());
}

// ── Test 6: match validation ──────────────────────────────────────────────────

#[tokio::test]
async fn register_match_validations() {
    let f = Fixture::new().await;

    let err = f
        .program
        .service("Service")
        .register_match(
            "Unknown Phase".to_string(),
            HOME_TEAM.to_string(),
            AWAY_TEAM.to_string(),
            KICK_OFF,
        )
        .await;
    assert!(err.is_err(), "unknown phase should be rejected");

    f.program
        .service("Service")
        .register_phase(GROUP_PHASE.to_string(), 0, u64::MAX, 1)
        .await
        .unwrap();

    let err = f
        .as_actor(STRANGER)
        .service("Service")
        .register_match(
            GROUP_PHASE.to_string(),
            HOME_TEAM.to_string(),
            AWAY_TEAM.to_string(),
            KICK_OFF,
        )
        .await;
    assert!(err.is_err(), "non-admin should not register match");
}

// ── Test 7: oracle proposal access control ────────────────────────────────────

#[tokio::test]
async fn propose_result_access_control() {
    let f = Fixture::new().await;
    let match_id = setup_phase_and_match(&f).await;

    let score = Score { home: 2, away: 1 };

    // Unauthorized caller cannot propose.
    let err = f
        .as_actor(STRANGER)
        .service("Service")
        .propose_result(match_id, score.clone(), None)
        .await;
    assert!(err.is_err(), "non-oracle should not propose result");

    // Authorized oracle proposes successfully.
    f.program
        .service("Service")
        .set_oracle_authorized(actor(ORACLE), true)
        .await
        .unwrap();
    f.as_actor(ORACLE)
        .service("Service")
        .propose_result(match_id, score.clone(), None)
        .await
        .expect("authorized oracle should propose successfully");

    let m = f
        .program
        .service("Service")
        .query_match(match_id)
        .query()
        .unwrap()
        .unwrap();

    assert!(
        !matches!(m.result, ResultStatus::Unresolved),
        "result should be Proposed after oracle submission"
    );
}

// ── Test 8: cancel within challenge window ────────────────────────────────────

#[tokio::test]
async fn cancel_proposed_result_within_window() {
    let f = Fixture::new().await;
    let match_id = setup_phase_and_match(&f).await;

    f.program
        .service("Service")
        .set_oracle_authorized(actor(ORACLE), true)
        .await
        .unwrap();

    // Oracle submits wrong result.
    let wrong_score = Score { home: 0, away: 0 };
    f.as_actor(ORACLE)
        .service("Service")
        .propose_result(match_id, wrong_score, None)
        .await
        .unwrap();

    // Admin cancels immediately — within the 24h window.
    f.program
        .service("Service")
        .cancel_proposed_result(match_id)
        .await
        .expect("admin should cancel within challenge window");

    // Match is back to Unresolved.
    let m = f
        .program
        .service("Service")
        .query_match(match_id)
        .query()
        .unwrap()
        .unwrap();
    assert!(
        matches!(m.result, ResultStatus::Unresolved),
        "match should be Unresolved after cancel"
    );

    // Oracle re-proposes with correct score.
    let correct_score = Score { home: 2, away: 1 };
    f.as_actor(ORACLE)
        .service("Service")
        .propose_result(match_id, correct_score, None)
        .await
        .expect("oracle should re-propose after cancellation");
}

// ── Test 9: full match flow with winner ───────────────────────────────────────

#[tokio::test]
async fn full_match_flow_with_winner() {
    let f = Fixture::new().await;
    let match_id = setup_phase_and_match(&f).await;

    let score = Score { home: 2, away: 1 };

    // USER1 places a correct bet.
    f.as_actor(USER1)
        .service("Service")
        .place_bet(match_id, score.clone(), None)
        .with_value(BET_5_VARA)
        .await
        .expect("USER1 place_bet should succeed");

    // Oracle proposes, window expires, finalize.
    propose_and_finalize(&f, match_id, score).await;

    // USER1 should have 3 pts (exact score, group phase weight=1).
    let pts = f
        .program
        .service("Service")
        .query_user_points(actor(USER1))
        .query()
        .unwrap();
    assert_eq!(pts, 3, "exact score in group phase should award 3 points");

    // Settlement is automatic — no prepare_match_settlement() call needed.
    let m = f
        .program
        .service("Service")
        .query_match(match_id)
        .query()
        .unwrap()
        .unwrap();
    assert!(m.settlement_prepared, "settlement must be prepared by finalize_result");
    assert!(m.finalized_at.is_some(), "finalized_at must be set");

    // USER1 claims reward immediately.
    f.as_actor(USER1)
        .service("Service")
        .claim_match_reward(match_id)
        .await
        .expect("USER1 claim_match_reward should succeed");

    // Second claim must fail.
    let err = f
        .as_actor(USER1)
        .service("Service")
        .claim_match_reward(match_id)
        .await;
    assert!(err.is_err(), "double-claim should be rejected");
}

// ── Test 10: bet validations ──────────────────────────────────────────────────

#[tokio::test]
async fn place_bet_validations() {
    let f = Fixture::new().await;
    let match_id = setup_phase_and_match(&f).await;

    let score = Score { home: 1, away: 0 };

    // Below minimum.
    let err = f
        .as_actor(USER1)
        .service("Service")
        .place_bet(match_id, score.clone(), None)
        .with_value(ONE_VARA)
        .await;
    assert!(err.is_err(), "bet below minimum should be rejected");

    // Valid bet.
    f.as_actor(USER1)
        .service("Service")
        .place_bet(match_id, score.clone(), None)
        .with_value(BET_5_VARA)
        .await
        .unwrap();

    // Duplicate bet on same match.
    let err = f
        .as_actor(USER1)
        .service("Service")
        .place_bet(match_id, score, None)
        .with_value(BET_5_VARA)
        .await;
    assert!(err.is_err(), "double bet should be rejected");
}

// ── Test 11: no-winner path ───────────────────────────────────────────────────

#[tokio::test]
async fn no_winner_settlement() {
    let f = Fixture::new().await;
    let match_id = setup_phase_and_match(&f).await;

    let final_score = Score { home: 1, away: 0 }; // home wins

    // USER1 predicts away win — wrong outcome.
    let wrong_bet = Score { home: 0, away: 2 };
    f.as_actor(USER1)
        .service("Service")
        .place_bet(match_id, wrong_bet, None)
        .with_value(BET_5_VARA)
        .await
        .unwrap();

    // Oracle proposes, window expires, finalize.
    propose_and_finalize(&f, match_id, final_score).await;

    // No winners — match pool redirected to final_prize_accumulated.
    let pts = f
        .program
        .service("Service")
        .query_user_points(actor(USER1))
        .query()
        .unwrap();
    assert_eq!(pts, 0, "wrong outcome should give 0 points");

    let m = f
        .program
        .service("Service")
        .query_match(match_id)
        .query()
        .unwrap()
        .unwrap();
    assert!(m.dust_swept, "no-winner match should be dust_swept immediately");
    assert_eq!(m.match_prize_pool, 0, "no-winner pool should be redirected to final prize");

    // USER1 (non-winner) cannot claim.
    let err = f
        .as_actor(USER1)
        .service("Service")
        .claim_match_reward(match_id)
        .await;
    assert!(err.is_err(), "non-winner should not claim match reward");
}

// ── Test 12: multi-admin management ──────────────────────────────────────────

#[tokio::test]
async fn admin_management() {
    let f = Fixture::new().await;

    // Zero address rejected.
    let err = f.program.service("Service").add_admin(ActorId::zero()).await;
    assert!(err.is_err(), "add_admin(zero) should be rejected");

    // Stranger cannot add admin.
    let err = f
        .as_actor(STRANGER)
        .service("Service")
        .add_admin(actor(NEW_ADMIN))
        .await;
    assert!(err.is_err(), "non-admin should not add admin");

    // Admin adds NEW_ADMIN.
    f.program
        .service("Service")
        .add_admin(actor(NEW_ADMIN))
        .await
        .expect("add_admin should succeed");

    let state = f.program.service("Service").query_state().query().unwrap();
    assert!(state.admins.contains(&actor(ADMIN)));
    assert!(state.admins.contains(&actor(NEW_ADMIN)));
    assert_eq!(state.admins.len(), 2);

    // Duplicate add rejected.
    let err = f.program.service("Service").add_admin(actor(NEW_ADMIN)).await;
    assert!(err.is_err(), "duplicate add_admin should be rejected");

    // Admin removes original admin (ADMIN removes itself while NEW_ADMIN remains).
    f.program
        .service("Service")
        .remove_admin(actor(ADMIN))
        .await
        .expect("remove_admin should succeed");

    let state = f.program.service("Service").query_state().query().unwrap();
    assert!(!state.admins.contains(&actor(ADMIN)));
    assert!(state.admins.contains(&actor(NEW_ADMIN)));
    assert_eq!(state.admins.len(), 1);

    // Cannot remove the last admin.
    let err = f
        .as_actor(NEW_ADMIN)
        .service("Service")
        .remove_admin(actor(NEW_ADMIN))
        .await;
    assert!(err.is_err(), "should not remove last admin");

    // Removing a non-admin address fails.
    let err = f
        .as_actor(NEW_ADMIN)
        .service("Service")
        .remove_admin(actor(STRANGER))
        .await;
    assert!(err.is_err(), "should not remove non-admin address");
}

// ── Test 13: treasury management ─────────────────────────────────────────────

#[tokio::test]
async fn treasury_management() {
    let f = Fixture::new().await;

    // Initial treasury set at deploy.
    let state = f.program.service("Service").query_state().query().unwrap();
    assert_eq!(state.treasury, actor(TREASURY));

    // Zero address rejected.
    let err = f
        .program
        .service("Service")
        .set_treasury(ActorId::zero())
        .await;
    assert!(err.is_err(), "set_treasury(zero) should be rejected");

    // Stranger cannot change treasury.
    let err = f
        .as_actor(STRANGER)
        .service("Service")
        .set_treasury(actor(USER1))
        .await;
    assert!(err.is_err(), "non-admin should not change treasury");

    // Operator cannot change treasury.
    f.program
        .service("Service")
        .add_operator(actor(OPERATOR))
        .await
        .unwrap();
    let err = f
        .as_actor(OPERATOR)
        .service("Service")
        .set_treasury(actor(USER1))
        .await;
    assert!(err.is_err(), "operator should not change treasury");

    // Admin changes treasury.
    f.program
        .service("Service")
        .set_treasury(actor(USER1))
        .await
        .expect("admin should change treasury");

    let state = f.program.service("Service").query_state().query().unwrap();
    assert_eq!(state.treasury, actor(USER1));
}

// ── Test 15: operator management and register permissions ────────────────────

#[tokio::test]
async fn operator_management() {
    let f = Fixture::new().await;

    // Stranger cannot add operator.
    let err = f
        .as_actor(STRANGER)
        .service("Service")
        .add_operator(actor(OPERATOR))
        .await;
    assert!(err.is_err(), "non-admin should not add operator");

    // Operator cannot add itself before being added.
    let err = f
        .as_actor(OPERATOR)
        .service("Service")
        .add_operator(actor(OPERATOR))
        .await;
    assert!(err.is_err(), "operator cannot self-add");

    // Admin adds OPERATOR.
    f.program
        .service("Service")
        .add_operator(actor(OPERATOR))
        .await
        .expect("add_operator should succeed");

    let state = f.program.service("Service").query_state().query().unwrap();
    assert!(state.operators.contains(&actor(OPERATOR)));
    assert_eq!(state.operators.len(), 1);

    // Duplicate add rejected.
    let err = f
        .program
        .service("Service")
        .add_operator(actor(OPERATOR))
        .await;
    assert!(err.is_err(), "duplicate add_operator should be rejected");

    // Operator can register a phase.
    f.as_actor(OPERATOR)
        .service("Service")
        .register_phase(GROUP_PHASE.to_string(), 0, u64::MAX, 1)
        .await
        .expect("operator should register phase");

    // Operator can register a match.
    f.as_actor(OPERATOR)
        .service("Service")
        .register_match(
            GROUP_PHASE.to_string(),
            HOME_TEAM.to_string(),
            AWAY_TEAM.to_string(),
            KICK_OFF,
        )
        .await
        .expect("operator should register match");

    // Stranger still cannot register.
    let err = f
        .as_actor(STRANGER)
        .service("Service")
        .register_phase("Phase X".to_string(), 0, u64::MAX, 1)
        .await;
    assert!(err.is_err(), "stranger should not register phase");

    // Operator cannot perform admin-only actions.
    let err = f
        .as_actor(OPERATOR)
        .service("Service")
        .add_operator(actor(USER1))
        .await;
    assert!(err.is_err(), "operator should not add other operators");

    // Admin removes OPERATOR.
    f.program
        .service("Service")
        .remove_operator(actor(OPERATOR))
        .await
        .expect("admin should remove operator");

    let state = f.program.service("Service").query_state().query().unwrap();
    assert!(!state.operators.contains(&actor(OPERATOR)));
    assert_eq!(state.operators.len(), 0);

    // Removed operator can no longer register.
    let err = f
        .as_actor(OPERATOR)
        .service("Service")
        .register_phase("Phase Y".to_string(), 0, u64::MAX, 1)
        .await;
    assert!(err.is_err(), "removed operator should not register phase");
}

// ── Test 16: finalize before challenge window fails ──────────────────────────

#[tokio::test]
async fn finalize_before_challenge_window_fails() {
    let f = Fixture::new().await;
    let match_id = setup_phase_and_match(&f).await;

    propose(&f, match_id, Score { home: 1, away: 0 }).await;

    // Try to finalize immediately — window has not expired.
    let err = f
        .program
        .service("Service")
        .finalize_result(match_id)
        .await;
    assert!(
        err.is_err(),
        "finalize_result before 24h challenge window should fail"
    );
}

// ── Test 17: cancel after challenge window fails, anyone can finalize ────────

#[tokio::test]
async fn cancel_after_window_fails_and_anyone_can_finalize() {
    let f = Fixture::new().await;
    let match_id = setup_phase_and_match(&f).await;

    propose(&f, match_id, Score { home: 2, away: 1 }).await;

    // Advance past the 24h window.
    f.spend_blocks(CHALLENGE_WINDOW_BLOCKS + 1);

    // Admin can no longer cancel — window expired.
    let err = f
        .program
        .service("Service")
        .cancel_proposed_result(match_id)
        .await;
    assert!(
        err.is_err(),
        "admin should not cancel after challenge window expired"
    );

    // Stranger (non-admin) can now finalize — permissionless after window.
    f.as_actor(STRANGER)
        .service("Service")
        .finalize_result(match_id)
        .await
        .expect("stranger should finalize after challenge window");

    let m = f
        .program
        .service("Service")
        .query_match(match_id)
        .query()
        .unwrap()
        .unwrap();
    assert!(
        matches!(m.result, ResultStatus::Finalized { .. }),
        "match should be Finalized"
    );
}

// ── Test 18: settlement is fused into finalize_result ────────────────────────

#[tokio::test]
async fn settlement_is_automatic_after_finalize() {
    let f = Fixture::new().await;
    let match_id = setup_phase_and_match(&f).await;

    let score = Score { home: 2, away: 0 };

    // Two users bet on the winning score.
    f.as_actor(USER1)
        .service("Service")
        .place_bet(match_id, score.clone(), None)
        .with_value(BET_5_VARA)
        .await
        .unwrap();
    f.as_actor(USER2)
        .service("Service")
        .place_bet(match_id, score.clone(), None)
        .with_value(BET_10_VARA)
        .await
        .unwrap();

    propose_and_finalize(&f, match_id, score).await;

    let m = f
        .program
        .service("Service")
        .query_match(match_id)
        .query()
        .unwrap()
        .unwrap();

    // Settlement is prepared in the same transaction as finalize — no extra call.
    assert!(m.settlement_prepared, "settlement_prepared should be true after finalize");
    assert!(m.total_winner_stake > 0, "total_winner_stake should be set");
    assert!(m.finalized_at.is_some(), "finalized_at must be recorded");

    // Both users can claim immediately.
    f.as_actor(USER1)
        .service("Service")
        .claim_match_reward(match_id)
        .await
        .expect("USER1 should claim immediately after finalize");
    f.as_actor(USER2)
        .service("Service")
        .claim_match_reward(match_id)
        .await
        .expect("USER2 should claim immediately after finalize");
}

// ── Test 19: sweep is permissionless and respects claim window ───────────────

#[tokio::test]
async fn sweep_blocked_before_deadline_with_unclaimed_winner() {
    let f = Fixture::new().await;
    let match_id = setup_phase_and_match(&f).await;

    let score = Score { home: 1, away: 0 };

    // USER1 bets correct score — will be a winner.
    f.as_actor(USER1)
        .service("Service")
        .place_bet(match_id, score.clone(), None)
        .with_value(BET_5_VARA)
        .await
        .unwrap();

    propose_and_finalize(&f, match_id, score).await;

    // USER1 has NOT claimed. Sweep immediately — should fail (deadline not passed).
    let err = f
        .as_actor(STRANGER)
        .service("Service")
        .sweep_match_dust_to_final_prize(match_id)
        .await;
    assert!(
        err.is_err(),
        "sweep before 72h deadline with unclaimed winner should fail"
    );
}

// ── Test 20: sweep succeeds for anyone after 72h deadline ───────────────────

#[tokio::test]
async fn sweep_permissionless_by_stranger_after_claim_deadline() {
    let f = Fixture::new().await;
    let match_id = setup_phase_and_match(&f).await;

    let score = Score { home: 3, away: 0 };

    // USER1 bets correct score — will be a winner who never claims.
    f.as_actor(USER1)
        .service("Service")
        .place_bet(match_id, score.clone(), None)
        .with_value(BET_5_VARA)
        .await
        .unwrap();

    propose_and_finalize(&f, match_id, score).await;

    // USER1 does NOT claim — simulates an inactive wallet.

    // Advance past the 72h claim deadline.
    f.spend_blocks(CLAIM_DEADLINE_BLOCKS + 1);

    // Stranger (not admin) can sweep unconditionally after deadline.
    f.as_actor(STRANGER)
        .service("Service")
        .sweep_match_dust_to_final_prize(match_id)
        .await
        .expect("stranger should sweep after 72h deadline even with unclaimed winner");

    let m = f
        .program
        .service("Service")
        .query_match(match_id)
        .query()
        .unwrap()
        .unwrap();
    assert!(m.dust_swept, "match should be dust_swept after deadline");
    assert_eq!(m.match_prize_pool, 0, "match pool should be zeroed after sweep");
}

// ── Test 21: cancel_match from Unresolved refunds bettors ───────────────────

#[tokio::test]
async fn cancel_match_unresolved_refunds_bettors() {
    let f = Fixture::new().await;
    let match_id = setup_phase_and_match(&f).await;

    f.as_actor(USER1)
        .service("Service")
        .place_bet(match_id, Score { home: 1, away: 0 }, None)
        .with_value(BET_5_VARA)
        .await
        .unwrap();
    f.as_actor(USER2)
        .service("Service")
        .place_bet(match_id, Score { home: 2, away: 1 }, None)
        .with_value(BET_10_VARA)
        .await
        .unwrap();

    f.program
        .service("Service")
        .cancel_match(match_id)
        .await
        .expect("admin should cancel match");

    let m = f
        .program
        .service("Service")
        .query_match(match_id)
        .query()
        .unwrap()
        .unwrap();
    assert!(matches!(m.result, ResultStatus::Cancelled), "match should be Cancelled");
    assert_eq!(m.match_prize_pool, 0, "pool zeroed");
    assert!(m.settlement_prepared, "settlement_prepared so finalize_final_prize_pool passes");
    assert!(m.dust_swept, "dust_swept so finalize_final_prize_pool passes");
    assert!(m.finalized_at.is_some(), "finalized_at recorded");

    // Each user has 85% of their bet in pending_refunds.
    let user1_refund = f
        .program
        .service("Service")
        .query_pending_refund(actor(USER1))
        .query()
        .unwrap();
    let user2_refund = f
        .program
        .service("Service")
        .query_pending_refund(actor(USER2))
        .query()
        .unwrap();
    assert_eq!(user1_refund, BET_5_VARA * 8_500 / 10_000);
    assert_eq!(user2_refund, BET_10_VARA * 8_500 / 10_000);
}

// ── Test 22: cancel_match from Proposed state works ─────────────────────────

#[tokio::test]
async fn cancel_match_from_proposed_state_works() {
    let f = Fixture::new().await;
    let match_id = setup_phase_and_match(&f).await;

    f.as_actor(USER1)
        .service("Service")
        .place_bet(match_id, Score { home: 1, away: 0 }, None)
        .with_value(BET_5_VARA)
        .await
        .unwrap();

    propose(&f, match_id, Score { home: 2, away: 1 }).await;

    // Cancel from Proposed (no challenge-window restriction here).
    f.program
        .service("Service")
        .cancel_match(match_id)
        .await
        .expect("cancel from Proposed should succeed");

    let m = f
        .program
        .service("Service")
        .query_match(match_id)
        .query()
        .unwrap()
        .unwrap();
    assert!(matches!(m.result, ResultStatus::Cancelled));

    // USER1 can pull their refund.
    f.as_actor(USER1)
        .service("Service")
        .claim_refund()
        .await
        .expect("USER1 should claim refund");
}

// ── Test 23: cancel_match access control ────────────────────────────────────

#[tokio::test]
async fn cancel_match_non_admin_fails() {
    let f = Fixture::new().await;
    let match_id = setup_phase_and_match(&f).await;

    let err = f
        .as_actor(STRANGER)
        .service("Service")
        .cancel_match(match_id)
        .await;
    assert!(err.is_err(), "non-admin should not cancel match");

    // Operator also rejected — only admin can cancel.
    f.program
        .service("Service")
        .add_operator(actor(OPERATOR))
        .await
        .unwrap();
    let err = f
        .as_actor(OPERATOR)
        .service("Service")
        .cancel_match(match_id)
        .await;
    assert!(err.is_err(), "operator should not cancel match");
}

// ── Test 24: cancel_match after Finalized fails ─────────────────────────────

#[tokio::test]
async fn cancel_match_after_finalized_fails() {
    let f = Fixture::new().await;
    let match_id = setup_phase_and_match(&f).await;

    propose_and_finalize(&f, match_id, Score { home: 2, away: 1 }).await;

    let err = f
        .program
        .service("Service")
        .cancel_match(match_id)
        .await;
    assert!(err.is_err(), "cannot cancel a finalized match");
}

// ── Test 25: cancel_match twice fails ───────────────────────────────────────

#[tokio::test]
async fn cancel_match_double_fails() {
    let f = Fixture::new().await;
    let match_id = setup_phase_and_match(&f).await;

    f.program
        .service("Service")
        .cancel_match(match_id)
        .await
        .unwrap();
    let err = f
        .program
        .service("Service")
        .cancel_match(match_id)
        .await;
    assert!(err.is_err(), "cannot cancel twice");
}

// ── Test 26: claim_refund happy path zeroes pending_refund ──────────────────

#[tokio::test]
async fn claim_refund_happy_path() {
    let f = Fixture::new().await;
    let match_id = setup_phase_and_match(&f).await;

    f.as_actor(USER1)
        .service("Service")
        .place_bet(match_id, Score { home: 1, away: 0 }, None)
        .with_value(BET_5_VARA)
        .await
        .unwrap();

    f.program
        .service("Service")
        .cancel_match(match_id)
        .await
        .unwrap();

    let pending_before = f
        .program
        .service("Service")
        .query_pending_refund(actor(USER1))
        .query()
        .unwrap();
    assert_eq!(pending_before, BET_5_VARA * 8_500 / 10_000);

    f.as_actor(USER1)
        .service("Service")
        .claim_refund()
        .await
        .expect("USER1 should claim refund");

    let pending_after = f
        .program
        .service("Service")
        .query_pending_refund(actor(USER1))
        .query()
        .unwrap();
    assert_eq!(pending_after, 0, "pending_refund cleared after claim");
}

// ── Test 27: claim_refund without pending fails ─────────────────────────────

#[tokio::test]
async fn claim_refund_without_pending_fails() {
    let f = Fixture::new().await;

    let err = f
        .as_actor(USER1)
        .service("Service")
        .claim_refund()
        .await;
    assert!(err.is_err(), "claim_refund with no pending refund should fail");
}

// ── Test 28: claim_refund double-claim fails ────────────────────────────────

#[tokio::test]
async fn claim_refund_double_fails() {
    let f = Fixture::new().await;
    let match_id = setup_phase_and_match(&f).await;

    f.as_actor(USER1)
        .service("Service")
        .place_bet(match_id, Score { home: 1, away: 0 }, None)
        .with_value(BET_5_VARA)
        .await
        .unwrap();

    f.program
        .service("Service")
        .cancel_match(match_id)
        .await
        .unwrap();

    f.as_actor(USER1)
        .service("Service")
        .claim_refund()
        .await
        .unwrap();

    let err = f
        .as_actor(USER1)
        .service("Service")
        .claim_refund()
        .await;
    assert!(err.is_err(), "double claim_refund should fail");
}

// ── Test 29: cancelled match blocks claim_match_reward ──────────────────────

#[tokio::test]
async fn cancelled_match_blocks_claim_match_reward() {
    let f = Fixture::new().await;
    let match_id = setup_phase_and_match(&f).await;

    f.as_actor(USER1)
        .service("Service")
        .place_bet(match_id, Score { home: 1, away: 0 }, None)
        .with_value(BET_5_VARA)
        .await
        .unwrap();

    f.program
        .service("Service")
        .cancel_match(match_id)
        .await
        .unwrap();

    let err = f
        .as_actor(USER1)
        .service("Service")
        .claim_match_reward(match_id)
        .await;
    assert!(
        err.is_err(),
        "claim_match_reward should fail for cancelled match (path goes via no-rewards or cancelled arm)"
    );
}

// ── Test 30: cancelled match blocks finalize_result ─────────────────────────

#[tokio::test]
async fn cancelled_match_blocks_finalize_result() {
    let f = Fixture::new().await;
    let match_id = setup_phase_and_match(&f).await;

    f.program
        .service("Service")
        .cancel_match(match_id)
        .await
        .unwrap();

    let err = f
        .program
        .service("Service")
        .finalize_result(match_id)
        .await;
    assert!(err.is_err(), "finalize_result should fail on cancelled match");
}

// ── Test 31: refunds accumulate across multiple cancelled matches ──────────

#[tokio::test]
async fn cancel_match_accumulates_refund_across_matches() {
    let f = Fixture::new().await;

    f.program
        .service("Service")
        .register_phase(GROUP_PHASE.to_string(), 0, u64::MAX, 1)
        .await
        .unwrap();
    f.program
        .service("Service")
        .register_match(
            GROUP_PHASE.to_string(),
            HOME_TEAM.to_string(),
            AWAY_TEAM.to_string(),
            KICK_OFF,
        )
        .await
        .unwrap();
    f.program
        .service("Service")
        .register_match(
            GROUP_PHASE.to_string(),
            "France".to_string(),
            "Spain".to_string(),
            KICK_OFF,
        )
        .await
        .unwrap();

    let match1 = 1u64;
    let match2 = 2u64;

    f.as_actor(USER1)
        .service("Service")
        .place_bet(match1, Score { home: 1, away: 0 }, None)
        .with_value(BET_5_VARA)
        .await
        .unwrap();
    f.as_actor(USER1)
        .service("Service")
        .place_bet(match2, Score { home: 2, away: 0 }, None)
        .with_value(BET_10_VARA)
        .await
        .unwrap();

    f.program
        .service("Service")
        .cancel_match(match1)
        .await
        .unwrap();
    f.program
        .service("Service")
        .cancel_match(match2)
        .await
        .unwrap();

    let refund = f
        .program
        .service("Service")
        .query_pending_refund(actor(USER1))
        .query()
        .unwrap();
    let expected = (BET_5_VARA + BET_10_VARA) * 8_500 / 10_000;
    assert_eq!(refund, expected, "refunds should accumulate across cancelled matches");
}

// ── Test 32: finalize_final_prize_pool requires settlement on cancelled too ─

/// Confirms that a Cancelled match satisfies the loop in finalize_final_prize_pool
/// because cancel_match sets settlement_prepared=true and dust_swept=true.
/// We don't drive the full final-prize lifecycle here (needs R32 + podium);
/// we just assert that querying the cancelled match shows the right flags.
#[tokio::test]
async fn cancelled_match_passes_finalize_prize_pool_checks() {
    let f = Fixture::new().await;
    let match_id = setup_phase_and_match(&f).await;

    f.as_actor(USER1)
        .service("Service")
        .place_bet(match_id, Score { home: 1, away: 0 }, None)
        .with_value(BET_5_VARA)
        .await
        .unwrap();

    f.program
        .service("Service")
        .cancel_match(match_id)
        .await
        .unwrap();

    let m = f
        .program
        .service("Service")
        .query_match(match_id)
        .query()
        .unwrap()
        .unwrap();

    // The three flags finalize_final_prize_pool inspects per match:
    assert!(matches!(m.result, ResultStatus::Cancelled));
    assert!(m.settlement_prepared);
    assert!(m.dust_swept);
}
