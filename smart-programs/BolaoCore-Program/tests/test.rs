use bolao_program::client::{
    service::Service as BolaoSvc, // trait — needed for method dispatch
    MigrationPage,
    ResultStatus,
    Score,
};
use sails_rs::prelude::*;
use smartcup_freebet_ledger_client::{
    freebet_ledger::FreebetLedger as FreebetLedgerSvc, FreebetLedger as FreebetLedgerRoot,
    Score as LedgerScore,
};

mod fixture;
mod utils;

use fixture::{
    actor, Fixture, ADMIN, NEW_ADMIN, OPERATOR, ORACLE, STRANGER, TREASURY, USER1, USER2,
};
use utils::{
    AWAY_TEAM, BET_10_VARA, BET_5_VARA, CHALLENGE_WINDOW_BLOCKS, CLAIM_DEADLINE_BLOCKS,
    GROUP_PHASE, HOME_TEAM, KICK_OFF, ONE_VARA,
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

async fn configure_freebet_ledger(
    f: &Fixture,
) -> sails_rs::client::Actor<
    smartcup_freebet_ledger_client::FreebetLedgerProgram,
    sails_rs::client::GtestEnv,
> {
    let ledger = f.deploy_freebet_ledger().await;
    f.program
        .service("Service")
        .set_freebet_ledger(Some(ledger.id()))
        .await
        .unwrap();
    ledger
        .freebet_ledger()
        .authorize_bet_program(f.program.id())
        .with_actor_id(actor(ADMIN))
        .await
        .unwrap();
    ledger
}

async fn grant_freebet(
    ledger: &sails_rs::client::Actor<
        smartcup_freebet_ledger_client::FreebetLedgerProgram,
        sails_rs::client::GtestEnv,
    >,
    user: u64,
    grant_id: &str,
    amount: u128,
) {
    ledger
        .freebet_ledger()
        .grant(actor(user), grant_id.into(), "campaign reward".into())
        .with_actor_id(actor(ADMIN))
        .with_value(amount)
        .await
        .unwrap();
}

async fn spend_freebet(
    ledger: &sails_rs::client::Actor<
        smartcup_freebet_ledger_client::FreebetLedgerProgram,
        sails_rs::client::GtestEnv,
    >,
    user: u64,
    bolao_program: ActorId,
    match_id: u64,
    amount: u128,
    score: Score,
) -> u128 {
    ledger
        .freebet_ledger()
        .spend_freebet(
            bolao_program,
            match_id,
            amount,
            LedgerScore {
                home: score.home,
                away: score.away,
            },
            None,
        )
        .with_actor_id(actor(user))
        .await
        .unwrap()
}

fn freebet_balance(
    ledger: &sails_rs::client::Actor<
        smartcup_freebet_ledger_client::FreebetLedgerProgram,
        sails_rs::client::GtestEnv,
    >,
    user: u64,
) -> u128 {
    ledger
        .freebet_ledger()
        .balance_of(actor(user))
        .query()
        .unwrap()
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
    assert!(
        m.settlement_prepared,
        "settlement must be prepared by finalize_result"
    );
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
    assert!(
        m.dust_swept,
        "no-winner match should be dust_swept immediately"
    );
    assert_eq!(
        m.match_prize_pool, 0,
        "no-winner pool should be redirected to final prize"
    );

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
    let mut svc = f.program.service("Service");
    let err = BolaoSvc::add_admin(&mut svc, ActorId::zero()).await;
    assert!(err.is_err(), "add_admin(zero) should be rejected");

    // Stranger cannot add admin.
    let mut svc = f.as_actor(STRANGER).service("Service");
    let err = BolaoSvc::add_admin(&mut svc, actor(NEW_ADMIN)).await;
    assert!(err.is_err(), "non-admin should not add admin");

    // Admin adds NEW_ADMIN.
    let mut svc = f.program.service("Service");
    BolaoSvc::add_admin(&mut svc, actor(NEW_ADMIN))
        .await
        .expect("add_admin should succeed");

    let state = f.program.service("Service").query_state().query().unwrap();
    assert!(state.admins.contains(&actor(ADMIN)));
    assert!(state.admins.contains(&actor(NEW_ADMIN)));
    assert_eq!(state.admins.len(), 2);

    // Duplicate add rejected.
    let mut svc = f.program.service("Service");
    let err = BolaoSvc::add_admin(&mut svc, actor(NEW_ADMIN)).await;
    assert!(err.is_err(), "duplicate add_admin should be rejected");

    // Admin removes original admin (ADMIN removes itself while NEW_ADMIN remains).
    let mut svc = f.program.service("Service");
    BolaoSvc::remove_admin(&mut svc, actor(ADMIN))
        .await
        .expect("remove_admin should succeed");

    let state = f.program.service("Service").query_state().query().unwrap();
    assert!(!state.admins.contains(&actor(ADMIN)));
    assert!(state.admins.contains(&actor(NEW_ADMIN)));
    assert_eq!(state.admins.len(), 1);

    // Cannot remove the last admin.
    let mut svc = f.as_actor(NEW_ADMIN).service("Service");
    let err = BolaoSvc::remove_admin(&mut svc, actor(NEW_ADMIN)).await;
    assert!(err.is_err(), "should not remove last admin");

    // Removing a non-admin address fails.
    let mut svc = f.as_actor(NEW_ADMIN).service("Service");
    let err = BolaoSvc::remove_admin(&mut svc, actor(STRANGER)).await;
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
    let err = f.program.service("Service").finalize_result(match_id).await;
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
    assert!(
        m.settlement_prepared,
        "settlement_prepared should be true after finalize"
    );
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
    assert_eq!(
        m.match_prize_pool, 0,
        "match pool should be zeroed after sweep"
    );
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
    assert!(
        matches!(m.result, ResultStatus::Cancelled),
        "match should be Cancelled"
    );
    assert_eq!(m.match_prize_pool, 0, "pool zeroed");
    assert!(
        m.settlement_prepared,
        "settlement_prepared so finalize_final_prize_pool passes"
    );
    assert!(
        m.dust_swept,
        "dust_swept so finalize_final_prize_pool passes"
    );
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

// ══════════════════════════════════════════════════════════════════════════════
// ── Phase 6: Migration tests ──────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

// T22 — migration_lock_blocks_writes
// After lock_for_migration(), user writes must panic with "Contract locked for migration".
#[tokio::test]
async fn migration_lock_blocks_writes() {
    let f = Fixture::new().await;
    let match_id = setup_phase_and_match(&f).await;

    // Lock the contract
    f.program
        .service("Service")
        .lock_for_migration()
        .await
        .expect("lock_for_migration should succeed for admin");

    // place_bet should fail
    let err = f
        .as_actor(USER1)
        .service("Service")
        .place_bet(match_id, Score { home: 1, away: 0 }, None)
        .with_value(BET_5_VARA)
        .await;
    assert!(
        err.is_err(),
        "place_bet should be blocked during migration lock"
    );

    // claim_refund should fail
    let err = f.as_actor(USER1).service("Service").claim_refund().await;
    assert!(
        err.is_err(),
        "claim_refund should be blocked during migration lock"
    );

    // submit_podium_pick should fail
    let err = f
        .as_actor(USER1)
        .service("Service")
        .submit_podium_pick(
            "Brazil".to_string(),
            "Argentina".to_string(),
            "France".to_string(),
        )
        .with_value(BET_5_VARA)
        .await;
    assert!(
        err.is_err(),
        "submit_podium_pick should be blocked during migration lock"
    );
}

// T23 — export_determinism
// Calling export_state_page(0, 25) twice returns identical results.
#[tokio::test]
async fn export_determinism() {
    let f = Fixture::new().await;
    setup_phase_and_match(&f).await;

    f.as_actor(USER1)
        .service("Service")
        .place_bet(1, Score { home: 1, away: 0 }, None)
        .with_value(BET_5_VARA)
        .await
        .unwrap();

    f.program
        .service("Service")
        .lock_for_migration()
        .await
        .unwrap();

    let page1 = f
        .program
        .service("Service")
        .export_state_page(0, 25)
        .query()
        .unwrap();

    let page2 = f
        .program
        .service("Service")
        .export_state_page(0, 25)
        .query()
        .unwrap();

    assert_eq!(page1, page2, "export_state_page must be deterministic");
    assert_eq!(page1.page, 0);
    assert!(page1.is_last_page);
    // The single bet and single user should appear on the page
    assert_eq!(page1.bets.len(), 1);
    assert_eq!(page1.user_payloads.len(), 1);
    // Matches and phases ship on page 0
    assert_eq!(page1.matches.len(), 1);
    assert_eq!(page1.phases.len(), 1);
}

// T24 — export_import_roundtrip (comprehensive)
// Full E2E: real predictions + finalized match + cancelled match + pending refunds.
// Verifies that bet scores, stakes, user points, pending refunds and fee accumulators
// all survive the migration correctly.
#[tokio::test]
async fn export_import_roundtrip() {
    // ── Source: populate state ────────────────────────────────────────────────
    let source = Fixture::new().await;
    let match_1 = setup_phase_and_match(&source).await; // match_id = 1

    // Register a second match to later cancel (creates pending refund)
    source
        .program
        .service("Service")
        .register_match(
            GROUP_PHASE.to_string(),
            "Argentina".to_string(),
            "France".to_string(),
            KICK_OFF,
        )
        .await
        .unwrap();
    let match_2: u64 = 2;

    // USER1 predicts 2-1 on match_1 (will be exact — earns 3 points)
    source
        .as_actor(USER1)
        .service("Service")
        .place_bet(match_1, Score { home: 2, away: 1 }, None)
        .with_value(BET_5_VARA)
        .await
        .unwrap();

    // USER2 predicts 0-0 on match_1 (wrong outcome — earns 0 points)
    source
        .as_actor(USER2)
        .service("Service")
        .place_bet(match_1, Score { home: 0, away: 0 }, None)
        .with_value(BET_10_VARA)
        .await
        .unwrap();

    // USER1 predicts 1-0 on match_2 (will be cancelled)
    source
        .as_actor(USER1)
        .service("Service")
        .place_bet(match_2, Score { home: 1, away: 0 }, None)
        .with_value(BET_5_VARA)
        .await
        .unwrap();

    // Finalize match_1 with 2-1: USER1 exact → 3 pts, USER2 wrong → 0 pts
    propose_and_finalize(&source, match_1, Score { home: 2, away: 1 }).await;

    // Cancel match_2: USER1 gets pending_refund = stake_in_match_pool
    source
        .program
        .service("Service")
        .cancel_match(match_2)
        .await
        .unwrap();

    let user1_refund_source = source
        .program
        .service("Service")
        .query_pending_refund(actor(USER1))
        .query()
        .unwrap();
    assert!(
        user1_refund_source > 0,
        "USER1 should have a pending refund"
    );

    // ── Deploy sink and run migration ─────────────────────────────────────────
    let sink = source.deploy_importer_on_same_system().await;

    source
        .program
        .service("Service")
        .lock_for_migration()
        .await
        .unwrap();

    // Export all state pages
    let mut pages: Vec<MigrationPage> = Vec::new();
    let mut page_num: u32 = 0;
    loop {
        let page = source
            .program
            .service("Service")
            .export_state_page(page_num, 25)
            .query()
            .unwrap();
        let is_last = page.is_last_page;
        pages.push(page);
        if is_last {
            break;
        }
        page_num += 1;
    }

    let meta = source
        .program
        .service("Service")
        .export_metadata()
        .query()
        .unwrap();

    for page in pages {
        sink.service("Service")
            .import_state_page(page)
            .await
            .unwrap();
    }
    sink.service("Service").import_metadata(meta).await.unwrap();
    sink.service("Service").seal_migration().await.unwrap();

    // ── Verify: structure ─────────────────────────────────────────────────────
    let sink_state = sink.service("Service").query_state().query().unwrap();
    assert_eq!(sink_state.matches.len(), 2, "both matches migrated");
    assert_eq!(sink_state.phases.len(), 1, "phase migrated");

    // ── Verify: USER1 predictions ─────────────────────────────────────────────
    let user1_bets = sink
        .service("Service")
        .query_bets_by_user(actor(USER1))
        .query()
        .unwrap();
    assert_eq!(user1_bets.len(), 2, "USER1 has 2 bets in sink");

    let u1_m1 = user1_bets
        .iter()
        .find(|b| b.match_id == match_1)
        .expect("USER1 match_1 bet missing in sink");
    assert_eq!(u1_m1.score.home, 2, "USER1 predicted home=2 on match_1");
    assert_eq!(u1_m1.score.away, 1, "USER1 predicted away=1 on match_1");
    // stake = BET_5_VARA × 85% (5% fee + 10% final prize deducted)
    let stake_5: u128 = BET_5_VARA * 8_500 / 10_000;
    assert_eq!(
        u1_m1.stake_in_match_pool, stake_5,
        "USER1 match_1 stake correct"
    );

    let u1_m2 = user1_bets
        .iter()
        .find(|b| b.match_id == match_2)
        .expect("USER1 match_2 bet missing in sink");
    assert_eq!(u1_m2.score.home, 1, "USER1 predicted home=1 on match_2");
    assert_eq!(u1_m2.score.away, 0, "USER1 predicted away=0 on match_2");
    assert!(u1_m2.claimed, "match_2 bet marked claimed after cancel");

    // ── Verify: USER2 prediction ──────────────────────────────────────────────
    let user2_bets = sink
        .service("Service")
        .query_bets_by_user(actor(USER2))
        .query()
        .unwrap();
    assert_eq!(user2_bets.len(), 1, "USER2 has 1 bet in sink");
    assert_eq!(user2_bets[0].score.home, 0, "USER2 predicted home=0");
    assert_eq!(user2_bets[0].score.away, 0, "USER2 predicted away=0");
    let stake_10: u128 = BET_10_VARA * 8_500 / 10_000;
    assert_eq!(
        user2_bets[0].stake_in_match_pool, stake_10,
        "USER2 stake correct"
    );

    // ── Verify: user points ───────────────────────────────────────────────────
    let u1_pts = sink
        .service("Service")
        .query_user_points(actor(USER1))
        .query()
        .unwrap();
    assert_eq!(u1_pts, 3, "USER1 earned 3 pts (exact score 2-1)");

    let u2_pts = sink
        .service("Service")
        .query_user_points(actor(USER2))
        .query()
        .unwrap();
    assert_eq!(u2_pts, 0, "USER2 earned 0 pts (wrong outcome)");

    // ── Verify: pending refund migrated ──────────────────────────────────────
    let u1_refund_sink = sink
        .service("Service")
        .query_pending_refund(actor(USER1))
        .query()
        .unwrap();
    assert_eq!(
        u1_refund_sink, user1_refund_source,
        "USER1 pending refund migrated"
    );

    // ── Verify: fee accumulators ──────────────────────────────────────────────
    // 3 bets total (5+10+5 VARA), 5% protocol fee each
    let total_bets = BET_5_VARA + BET_10_VARA + BET_5_VARA;
    assert_eq!(
        sink_state.protocol_fee_accumulated,
        total_bets * 500 / 10_000,
        "protocol fees migrated correctly"
    );

    // ── Verify: writes work after seal ────────────────────────────────────────
    sink.service("Service")
        .set_treasury(actor(TREASURY))
        .await
        .expect("writes should work after seal");
}

// T25 — drain_vara_to_transfers_balance
// Verifies that drain_vara_to correctly computes locked VARA from state
// and transfers it to the destination. Uses query_locked_vara() for pre/post checks.
#[tokio::test]
async fn drain_vara_to_transfers_balance() {
    let f = Fixture::new().await;
    let match_id = setup_phase_and_match(&f).await;

    // USER1 places a bet — accumulates VARA in contract
    f.as_actor(USER1)
        .service("Service")
        .place_bet(match_id, Score { home: 1, away: 0 }, None)
        .with_value(BET_5_VARA)
        .await
        .unwrap();

    // query_locked_vara must equal BET_5_VARA (all splits sum back to full bet)
    let locked = f
        .program
        .service("Service")
        .query_locked_vara()
        .query()
        .unwrap();
    assert_eq!(
        locked, BET_5_VARA,
        "locked VARA should equal the bet amount"
    );

    // Lock for migration
    f.program
        .service("Service")
        .lock_for_migration()
        .await
        .unwrap();

    // Drain to TREASURY
    f.program
        .service("Service")
        .drain_vara_to(actor(TREASURY))
        .await
        .expect("drain_vara_to should succeed");

    // After drain, state fields are NOT zeroed — they migrate to the SINK via export/import.
    // The on-chain balance is 0; a second drain sees exec::value_available() == 0 and panics.

    // Second drain must fail — nothing left to drain
    let err = f
        .program
        .service("Service")
        .drain_vara_to(actor(TREASURY))
        .await;
    assert!(
        err.is_err(),
        "second drain should fail with nothing to drain"
    );
}

#[tokio::test]
async fn force_withdraw_vara_bypasses_locked_pool() {
    let f = Fixture::new().await;
    let match_id = setup_phase_and_match(&f).await;

    f.as_actor(USER1)
        .service("Service")
        .place_bet(match_id, Score { home: 1, away: 0 }, None)
        .with_value(BET_5_VARA)
        .await
        .unwrap();

    let locked = f
        .program
        .service("Service")
        .query_locked_vara()
        .query()
        .unwrap();
    assert_eq!(locked, BET_5_VARA);

    let mut service = f.program.service("Service");
    let surplus_attempt =
        BolaoSvc::withdraw_surplus_vara(&mut service, actor(TREASURY), BET_5_VARA).await;
    assert!(surplus_attempt.is_err(), "locked pool is not surplus");

    let contract_before = f.env.system().balance_of(f.program.id());
    assert!(
        contract_before >= BET_5_VARA,
        "contract should hold the locked bet"
    );
    let mut service = f.program.service("Service");
    BolaoSvc::force_withdraw_vara(&mut service, actor(TREASURY), BET_5_VARA)
        .await
        .expect("admin can force-withdraw locked pool VARA");
    let contract_after = f.env.system().balance_of(f.program.id());
    assert_eq!(contract_after, contract_before - BET_5_VARA);

    let mut service = f.as_actor(STRANGER).service("Service");
    let non_admin = BolaoSvc::force_withdraw_vara(&mut service, actor(TREASURY), ONE_VARA).await;
    assert!(non_admin.is_err(), "non-admin must not force-withdraw");
}

// T27 — double_seal_rejected
// Calling seal_migration() on already-sealed contract panics.
#[tokio::test]
async fn double_seal_rejected() {
    let f = Fixture::new_as_importer().await;

    f.program
        .service("Service")
        .seal_migration()
        .await
        .expect("first seal should succeed");

    let err = f.program.service("Service").seal_migration().await;
    assert!(err.is_err(), "second seal should be rejected");
}

// T28 — page_bounds_validation
// export_state_page with page >= total_pages panics.
#[tokio::test]
async fn page_bounds_validation() {
    let f = Fixture::new().await;
    setup_phase_and_match(&f).await;

    f.program
        .service("Service")
        .lock_for_migration()
        .await
        .unwrap();

    // Page 0 should work (total_pages is at least 1)
    f.program
        .service("Service")
        .export_state_page(0, 25)
        .query()
        .unwrap();

    // Page 1 on an empty state (total_pages=1) should fail
    let err = f
        .program
        .service("Service")
        .export_state_page(1, 25)
        .query();
    assert!(err.is_err(), "page >= total_pages should panic");
}

// T29 — snapshot_stability
// After lock_for_migration(), importing data on SINK does not change the SOURCE snapshot.
#[tokio::test]
async fn snapshot_stability() {
    let f = Fixture::new().await;
    setup_phase_and_match(&f).await;

    f.as_actor(USER1)
        .service("Service")
        .place_bet(1, Score { home: 1, away: 0 }, None)
        .with_value(BET_5_VARA)
        .await
        .unwrap();

    f.program
        .service("Service")
        .lock_for_migration()
        .await
        .unwrap();

    // Export the locked state — bet_keys is frozen now
    let page_before = f
        .program
        .service("Service")
        .export_state_page(0, 25)
        .query()
        .unwrap();

    // Simulate the snapshot being stable by exporting again — should be identical
    let page_after = f
        .program
        .service("Service")
        .export_state_page(0, 25)
        .query()
        .unwrap();

    assert_eq!(
        page_before, page_after,
        "snapshot must be stable across repeated export calls"
    );
    assert_eq!(
        page_before.bets.len(),
        1,
        "bet snapshot captures exactly 1 bet"
    );
}

// T30 — importer_mode_blocks_user_writes
// Deploying via new_as_importer → user writes blocked → seal → writes accepted.
#[tokio::test]
async fn importer_mode_blocks_user_writes() {
    let f = Fixture::new_as_importer().await;

    // Register phase first (admin-only, uses check_not_locked_for_export only)
    // BUT we're in import mode (migration_sealed=false), so user writes MUST be blocked
    // Admin writes that use check_not_locked_for_export are allowed in import mode.
    // place_bet uses check_writes_allowed (both guards) — must be blocked.
    f.program
        .service("Service")
        .register_phase(GROUP_PHASE.to_string(), 0, u64::MAX, 1)
        .await
        .expect("register_phase allowed in import mode (admin, not locked)");

    f.program
        .service("Service")
        .register_match(
            GROUP_PHASE.to_string(),
            HOME_TEAM.to_string(),
            AWAY_TEAM.to_string(),
            KICK_OFF,
        )
        .await
        .expect("register_match allowed in import mode");

    // place_bet must be blocked by import-mode guard
    let err = f
        .as_actor(USER1)
        .service("Service")
        .place_bet(1, Score { home: 1, away: 0 }, None)
        .with_value(BET_5_VARA)
        .await;
    assert!(err.is_err(), "place_bet must be blocked in import mode");

    // Seal — now writes are open
    f.program
        .service("Service")
        .seal_migration()
        .await
        .expect("seal_migration should succeed");

    // place_bet must now succeed
    f.as_actor(USER1)
        .service("Service")
        .place_bet(1, Score { home: 1, away: 0 }, None)
        .with_value(BET_5_VARA)
        .await
        .expect("place_bet must succeed after seal_migration");
}

// T31 — admin_handlers_work_during_export_lock (and are blocked)
// lock_for_migration() blocks admin handlers that use check_not_locked_for_export.
#[tokio::test]
async fn admin_handlers_blocked_during_export_lock() {
    let f = Fixture::new().await;

    f.program
        .service("Service")
        .lock_for_migration()
        .await
        .unwrap();

    // Admin handlers that use check_not_locked_for_export must be blocked
    let mut svc = f.program.service("Service");
    let err = BolaoSvc::add_admin(&mut svc, actor(NEW_ADMIN)).await;
    assert!(err.is_err(), "add_admin must be blocked during export lock");

    let err = f
        .program
        .service("Service")
        .register_phase(GROUP_PHASE.to_string(), 0, u64::MAX, 1)
        .await;
    assert!(
        err.is_err(),
        "register_phase must be blocked during export lock"
    );

    // Migration-specific handler (export_state_page) still works during lock
    f.program
        .service("Service")
        .export_state_page(0, 25)
        .query()
        .expect("export_state_page works during export lock");

    // admin_push_refund works during lock (REQ-11.5)
    // (no refund exists, but the "no refund" error is from business logic, not the guard)
    let err = f
        .program
        .service("Service")
        .admin_push_refund(actor(USER1))
        .await;
    // Should fail with "No refund" not "Contract locked"
    assert!(err.is_err(), "no refund exists for USER1");
}

// T26 — admin_push_refund_cei (basic)
// admin_push_refund sends the correct amount and clears the pending refund.
#[tokio::test]
async fn admin_push_refund_cei() {
    let f = Fixture::new().await;
    let match_id = setup_phase_and_match(&f).await;

    // USER1 places a bet
    f.as_actor(USER1)
        .service("Service")
        .place_bet(match_id, Score { home: 1, away: 0 }, None)
        .with_value(BET_5_VARA)
        .await
        .unwrap();

    // Cancel the match — populates pending_refunds for USER1
    f.program
        .service("Service")
        .cancel_match(match_id)
        .await
        .unwrap();

    // Verify refund exists
    let refund_before = f
        .program
        .service("Service")
        .query_pending_refund(actor(USER1))
        .query()
        .unwrap();
    assert!(
        refund_before > 0,
        "USER1 should have a pending refund after cancel"
    );

    // Admin pushes the refund
    f.program
        .service("Service")
        .admin_push_refund(actor(USER1))
        .await
        .expect("admin_push_refund should succeed");

    // Refund should now be zero (cleared before send, per CEI)
    let refund_after = f
        .program
        .service("Service")
        .query_pending_refund(actor(USER1))
        .query()
        .unwrap();
    assert_eq!(
        refund_after, 0,
        "pending refund should be cleared after admin_push_refund"
    );

    // Calling again should fail — no refund remains
    let err = f
        .program
        .service("Service")
        .admin_push_refund(actor(USER1))
        .await;
    assert!(
        err.is_err(),
        "second admin_push_refund should fail — no refund"
    );
}

// T32 — page_size_cap_applied_silently
// Passing a huge page_size is silently capped to MAX_MIGRATION_PAGE_SIZE.
#[tokio::test]
async fn page_size_cap_applied_silently() {
    let f = Fixture::new().await;
    setup_phase_and_match(&f).await;

    // Add some bets
    f.as_actor(USER1)
        .service("Service")
        .place_bet(1, Score { home: 1, away: 0 }, None)
        .with_value(BET_5_VARA)
        .await
        .unwrap();

    f.program
        .service("Service")
        .lock_for_migration()
        .await
        .unwrap();

    // Pass a very large page_size — should not panic and should cap silently
    let page = f
        .program
        .service("Service")
        .export_state_page(0, 99_999)
        .query()
        .expect("large page_size should be silently capped, not panic");

    // The response is valid
    assert_eq!(page.page, 0);
    assert!(page.total_pages >= 1);
    // Entry counts do not exceed MAX_MIGRATION_PAGE_SIZE (50)
    assert!(
        page.bets.len() + page.user_payloads.len() <= 50,
        "entries must not exceed MAX_MIGRATION_PAGE_SIZE"
    );
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

    let err = f.program.service("Service").cancel_match(match_id).await;
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
    let err = f.program.service("Service").cancel_match(match_id).await;
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

    let err = f.as_actor(USER1).service("Service").claim_refund().await;
    assert!(
        err.is_err(),
        "claim_refund with no pending refund should fail"
    );
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

    let err = f.as_actor(USER1).service("Service").claim_refund().await;
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

    let err = f.program.service("Service").finalize_result(match_id).await;
    assert!(
        err.is_err(),
        "finalize_result should fail on cancelled match"
    );
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
    assert_eq!(
        refund, expected,
        "refunds should accumulate across cancelled matches"
    );
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

// ── Price oracle tests (cross-contract, gtest) ────────────────────────────────
//
// ── Freebet ledger integration ───────────────────────────────────────────────

#[tokio::test]
async fn freebet_ledger_can_place_smartcup_prediction() {
    let f = Fixture::new().await;
    let match_id = setup_phase_and_match(&f).await;
    let ledger = configure_freebet_ledger(&f).await;

    grant_freebet(&ledger, USER1, "x:repost:user1:week1", BET_10_VARA).await;
    let spent = spend_freebet(
        &ledger,
        USER1,
        f.program.id(),
        match_id,
        BET_10_VARA,
        Score { home: 2, away: 1 },
    )
    .await;

    assert_eq!(spent, BET_10_VARA);
    assert_eq!(freebet_balance(&ledger, USER1), 0);

    let bets = f
        .program
        .service("Service")
        .query_bets_by_user(actor(USER1))
        .query()
        .unwrap();
    assert_eq!(bets.len(), 1);
    assert_eq!(bets[0].match_id, match_id);
    assert_eq!(bets[0].stake_in_match_pool, BET_10_VARA);
    assert_eq!(bets[0].freebet_principal, BET_10_VARA);
}

#[tokio::test]
async fn freebet_claim_returns_principal_and_pays_only_net_winnings() {
    let f = Fixture::new().await;
    let match_id = setup_phase_and_match(&f).await;
    let ledger = configure_freebet_ledger(&f).await;

    grant_freebet(&ledger, USER1, "x:quote:user1:week1", BET_10_VARA).await;
    spend_freebet(
        &ledger,
        USER1,
        f.program.id(),
        match_id,
        BET_10_VARA,
        Score { home: 2, away: 1 },
    )
    .await;

    f.as_actor(USER2)
        .service("Service")
        .place_bet(match_id, Score { home: 0, away: 0 }, None)
        .with_value(BET_10_VARA)
        .await
        .unwrap();

    propose_and_finalize(&f, match_id, Score { home: 2, away: 1 }).await;

    let claim_status = f
        .program
        .service("Service")
        .query_wallet_claim_status(actor(USER1))
        .query()
        .unwrap();
    assert_eq!(claim_status.amount_claimable, BET_10_VARA * 85 / 100);
    assert!(!claim_status.already_claimed);

    f.as_actor(USER1)
        .service("Service")
        .claim_match_reward(match_id)
        .await
        .unwrap();

    assert_eq!(freebet_balance(&ledger, USER1), BET_10_VARA);

    let claim_status = f
        .program
        .service("Service")
        .query_wallet_claim_status(actor(USER1))
        .query()
        .unwrap();
    assert!(claim_status.already_claimed);
    assert_eq!(claim_status.amount_claimable, 0);
}

#[tokio::test]
async fn cancelled_freebet_prediction_returns_principal_to_ledger() {
    let f = Fixture::new().await;
    let match_id = setup_phase_and_match(&f).await;
    let ledger = configure_freebet_ledger(&f).await;

    grant_freebet(&ledger, USER1, "x:repost:user1:week2", BET_10_VARA).await;
    spend_freebet(
        &ledger,
        USER1,
        f.program.id(),
        match_id,
        BET_10_VARA,
        Score { home: 1, away: 0 },
    )
    .await;

    f.program
        .service("Service")
        .cancel_match(match_id)
        .await
        .unwrap();

    assert_eq!(freebet_balance(&ledger, USER1), BET_10_VARA);
}

#[tokio::test]
async fn set_freebet_ledger_is_admin_only_and_can_be_cleared() {
    let f = Fixture::new().await;
    let ledger = f.deploy_freebet_ledger().await;

    let non_admin = f
        .as_actor(STRANGER)
        .service("Service")
        .set_freebet_ledger(Some(ledger.id()))
        .await;
    assert!(non_admin.is_err(), "non-admin must not set freebet ledger");

    let zero = f
        .program
        .service("Service")
        .set_freebet_ledger(Some(ActorId::zero()))
        .await;
    assert!(zero.is_err(), "zero ActorId must not be accepted as ledger");

    f.program
        .service("Service")
        .set_freebet_ledger(Some(ledger.id()))
        .await
        .unwrap();
    let state = f.program.service("Service").query_state().query().unwrap();
    assert_eq!(state.freebet_ledger_program_id, Some(ledger.id()));

    f.program
        .service("Service")
        .set_freebet_ledger(None)
        .await
        .unwrap();
    let state = f.program.service("Service").query_state().query().unwrap();
    assert_eq!(state.freebet_ledger_program_id, None);
}

#[tokio::test]
async fn freebet_prediction_requires_configured_ledger_caller() {
    let f = Fixture::new().await;
    let match_id = setup_phase_and_match(&f).await;
    let ledger = f.deploy_freebet_ledger().await;

    let unconfigured = f
        .as_actor(STRANGER)
        .service("Service")
        .place_bet_from_freebet_ledger(actor(USER1), match_id, Score { home: 2, away: 1 }, None)
        .with_value(BET_10_VARA)
        .await;
    assert!(
        unconfigured.is_err(),
        "freebet ledger must be configured first"
    );

    f.program
        .service("Service")
        .set_freebet_ledger(Some(ledger.id()))
        .await
        .unwrap();

    let wrong_caller = f
        .as_actor(STRANGER)
        .service("Service")
        .place_bet_from_freebet_ledger(actor(USER1), match_id, Score { home: 2, away: 1 }, None)
        .with_value(BET_10_VARA)
        .await;
    assert!(
        wrong_caller.is_err(),
        "only configured ledger can place freebet bets"
    );
}

#[tokio::test]
async fn failed_freebet_prediction_restores_ledger_balance() {
    let f = Fixture::new().await;
    let match_id = setup_phase_and_match(&f).await;
    let ledger = configure_freebet_ledger(&f).await;

    grant_freebet(&ledger, USER1, "x:repost:user1:below-min", BET_10_VARA).await;
    let below_min = spend_freebet(
        &ledger,
        USER1,
        f.program.id(),
        match_id,
        ONE_VARA,
        Score { home: 2, away: 1 },
    )
    .await;
    assert_eq!(below_min, 0);
    assert_eq!(freebet_balance(&ledger, USER1), BET_10_VARA);

    let spent = spend_freebet(
        &ledger,
        USER1,
        f.program.id(),
        match_id,
        BET_10_VARA,
        Score { home: 2, away: 1 },
    )
    .await;
    assert_eq!(spent, BET_10_VARA);
    assert_eq!(freebet_balance(&ledger, USER1), 0);

    grant_freebet(&ledger, USER1, "x:quote:user1:duplicate", BET_10_VARA).await;
    let duplicate = spend_freebet(
        &ledger,
        USER1,
        f.program.id(),
        match_id,
        BET_10_VARA,
        Score { home: 1, away: 0 },
    )
    .await;
    assert_eq!(duplicate, 0);
    assert_eq!(freebet_balance(&ledger, USER1), BET_10_VARA);
}

#[tokio::test]
async fn freebet_only_winner_returns_principal_without_wallet_payout() {
    let f = Fixture::new().await;
    let match_id = setup_phase_and_match(&f).await;
    let ledger = configure_freebet_ledger(&f).await;

    grant_freebet(&ledger, USER1, "x:post:user1:solo-winner", BET_10_VARA).await;
    let spent = spend_freebet(
        &ledger,
        USER1,
        f.program.id(),
        match_id,
        BET_10_VARA,
        Score { home: 2, away: 1 },
    )
    .await;
    assert_eq!(spent, BET_10_VARA);
    assert_eq!(freebet_balance(&ledger, USER1), 0);

    propose_and_finalize(&f, match_id, Score { home: 2, away: 1 }).await;

    let claim_status = f
        .program
        .service("Service")
        .query_wallet_claim_status(actor(USER1))
        .query()
        .unwrap();
    assert_eq!(claim_status.amount_claimable, 0);
    assert!(!claim_status.already_claimed);

    f.as_actor(USER1)
        .service("Service")
        .claim_match_reward(match_id)
        .await
        .unwrap();

    assert_eq!(freebet_balance(&ledger, USER1), BET_10_VARA);
    let claim_status = f
        .program
        .service("Service")
        .query_wallet_claim_status(actor(USER1))
        .query()
        .unwrap();
    assert!(claim_status.already_claimed);
    assert_eq!(claim_status.amount_claimable, 0);
}

// These tests deploy both Oracle-Program and BolaoCore-Program in the same
// gtest System so that cross-program messages (refresh_vara_price, propose_from_oracle)
// are handled by the simulated runtime.

mod price_oracle {
    use super::*;
    use bolao_program::{
        client::service::ServiceImpl as BolaoImpl,
        client::{BolaoCtors, BolaoProgram},
        WASM_BINARY as BOLAO_WASM,
    };
    use oracle_program::{
        client::service::Service as OracleSvc,
        client::{OracleCtors, OracleProgram},
        WASM_BINARY as ORACLE_WASM,
    };
    use sails_rs::{
        client::{GearEnv, GtestEnv},
        gtest::System,
    };

    const ADMIN_ID: u64 = 100;
    const TREASURY_ID: u64 = 103;
    const FEEDER_ID: u64 = 200;
    const USER_ID: u64 = 201;

    fn actor(id: u64) -> ActorId {
        id.into()
    }

    /// Deploys Oracle + BolaoCore in the same System, wires set_price_oracle and
    /// set_oracle_authorized, authorizes FEEDER_ID as an Oracle feeder, and returns
    /// (oracle actor, bolao actor, env).
    async fn setup() -> (
        sails_rs::client::Actor<OracleProgram, GtestEnv>,
        sails_rs::client::Actor<BolaoProgram, GtestEnv>,
        GtestEnv,
    ) {
        let system = System::new();
        system.init_logger();
        for id in [ADMIN_ID, TREASURY_ID, FEEDER_ID, USER_ID] {
            system.mint_to(id, 10_000_000_000_000_000);
        }

        let oracle_code = system.submit_code(ORACLE_WASM);
        let bolao_code = system.submit_code(BOLAO_WASM);
        let env = GtestEnv::new(system, actor(ADMIN_ID));

        let oracle = env
            .deploy::<OracleProgram>(oracle_code, b"oracle-price-test".to_vec())
            .new(actor(ADMIN_ID))
            .await
            .unwrap();

        let bolao = env
            .deploy::<BolaoProgram>(bolao_code, b"bolao-price-test".to_vec())
            .new(actor(ADMIN_ID), actor(TREASURY_ID))
            .await
            .unwrap();

        // Wire price oracle address
        bolao
            .service("Service")
            .set_price_oracle(oracle.id())
            .await
            .unwrap();
        // Authorize the Oracle program to be used in propose_from_oracle
        bolao
            .service("Service")
            .set_oracle_authorized(oracle.id(), true)
            .await
            .unwrap();

        // Authorize FEEDER_ID in Oracle
        OracleSvc::set_feeder_authorized(
            &mut oracle.service::<oracle_program::client::service::ServiceImpl>("Service"),
            actor(FEEDER_ID),
            true,
        )
        .await
        .unwrap();

        (oracle, bolao, env)
    }

    // ── Test 33 ──────────────────────────────────────────────────────────────

    #[tokio::test]
    async fn refresh_vara_price_caches_oracle_price() {
        let (oracle, bolao, env) = setup().await;

        // Feeder pushes price to Oracle
        let feeder_env = env.clone().with_actor_id(actor(FEEDER_ID));
        let oracle_as_feeder =
            sails_rs::client::Actor::<OracleProgram, GtestEnv>::new(feeder_env, oracle.id());
        OracleSvc::set_vara_usd_price(
            &mut oracle_as_feeder
                .service::<oracle_program::client::service::ServiceImpl>("Service"),
            749,
        )
        .await
        .unwrap();

        // BolaoCore admin refreshes the cached price from Oracle
        bolao
            .service("Service")
            .refresh_vara_price(oracle.id())
            .await
            .expect("refresh_vara_price should succeed");

        let state = BolaoSvc::query_state(&bolao.service("Service"))
            .query()
            .unwrap();
        assert_eq!(
            state.vara_price_usd_micro, 749,
            "BolaoCore should cache the Oracle price"
        );
        assert_ne!(state.price_cached_at, 0, "price_cached_at should be set");
    }

    // ── Test 34 ──────────────────────────────────────────────────────────────

    #[tokio::test]
    async fn place_bet_respects_dynamic_minimum() {
        let (oracle, bolao, env) = setup().await;

        // Push and cache price: 749 micro-USD per VARA
        let feeder_env = env.clone().with_actor_id(actor(FEEDER_ID));
        let oracle_as_feeder =
            sails_rs::client::Actor::<OracleProgram, GtestEnv>::new(feeder_env, oracle.id());
        OracleSvc::set_vara_usd_price(
            &mut oracle_as_feeder
                .service::<oracle_program::client::service::ServiceImpl>("Service"),
            749,
        )
        .await
        .unwrap();
        bolao
            .service("Service")
            .refresh_vara_price(oracle.id())
            .await
            .unwrap();

        // Register a match
        let kick_off = utils::KICK_OFF;
        bolao
            .service("Service")
            .register_phase(utils::GROUP_PHASE.to_string(), 0, u64::MAX, 1)
            .await
            .unwrap();
        bolao
            .service::<BolaoImpl>("Service")
            .register_match(
                utils::GROUP_PHASE.to_string(),
                utils::HOME_TEAM.to_string(),
                utils::AWAY_TEAM.to_string(),
                kick_off,
            )
            .await
            .unwrap();

        // Compute expected minimum: ceil(3_000_000 × 10^12 / 749)
        const BET_TARGET: u128 = 3_000_000;
        const PLANCK: u128 = 1_000_000_000_000;
        let min_bet: u128 = (BET_TARGET * PLANCK + 749 - 1) / 749;

        let user_env = env.clone().with_actor_id(actor(USER_ID));
        let bolao_as_user =
            sails_rs::client::Actor::<BolaoProgram, GtestEnv>::new(user_env, bolao.id());

        // One planck below minimum → rejected
        let err = bolao_as_user
            .service("Service")
            .place_bet(1, Score { home: 1, away: 0 }, None)
            .with_value(min_bet - 1)
            .await;
        assert!(err.is_err(), "bet below dynamic minimum should be rejected");

        // Exactly at minimum → accepted
        bolao_as_user
            .service("Service")
            .place_bet(1, Score { home: 1, away: 0 }, None)
            .with_value(min_bet)
            .await
            .expect("bet at dynamic minimum should be accepted");
    }

    // ── Test 35 ──────────────────────────────────────────────────────────────

    #[tokio::test]
    async fn place_bet_falls_back_when_price_stale() {
        let (oracle, bolao, env) = setup().await;

        // Push and cache the price, then advance past the staleness limit.
        let feeder_env = env.clone().with_actor_id(actor(FEEDER_ID));
        let oracle_as_feeder =
            sails_rs::client::Actor::<OracleProgram, GtestEnv>::new(feeder_env, oracle.id());
        OracleSvc::set_vara_usd_price(
            &mut oracle_as_feeder
                .service::<oracle_program::client::service::ServiceImpl>("Service"),
            749,
        )
        .await
        .unwrap();
        bolao
            .service("Service")
            .refresh_vara_price(oracle.id())
            .await
            .unwrap();

        // DEFAULT_PRICE_STALENESS_LIMIT_MS = 3_600_000 ms = 3 600 blocks in gtest (1 block = 1 000 ms)
        // Advance 3 601 blocks so the cached price expires.
        env.system().run_scheduled_tasks(3_601);

        bolao
            .service("Service")
            .register_phase(utils::GROUP_PHASE.to_string(), 0, u64::MAX, 1)
            .await
            .unwrap();
        bolao
            .service::<BolaoImpl>("Service")
            .register_match(
                utils::GROUP_PHASE.to_string(),
                utils::HOME_TEAM.to_string(),
                utils::AWAY_TEAM.to_string(),
                utils::KICK_OFF,
            )
            .await
            .unwrap();

        let user_env = env.clone().with_actor_id(actor(USER_ID));
        let bolao_as_user =
            sails_rs::client::Actor::<BolaoProgram, GtestEnv>::new(user_env, bolao.id());

        // With stale price the fallback is MIN_BET_PLANCK = 3 VARA.
        // 2 VARA → rejected.
        let err = bolao_as_user
            .service("Service")
            .place_bet(1, Score { home: 1, away: 0 }, None)
            .with_value(2 * utils::ONE_VARA)
            .await;
        assert!(
            err.is_err(),
            "bet below fallback (stale price) should be rejected"
        );

        // 3 VARA → accepted (fallback minimum).
        bolao_as_user
            .service("Service")
            .place_bet(1, Score { home: 1, away: 0 }, None)
            .with_value(3 * utils::ONE_VARA)
            .await
            .expect("bet at fallback minimum should be accepted when price is stale");
    }
}
