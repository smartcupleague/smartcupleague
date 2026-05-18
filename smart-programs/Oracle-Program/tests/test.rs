use oracle_program::{
    client::{
        service::Service as OracleSvc, // trait — needed for method dispatch
        OracleCtors, OracleProgram,
        PenaltyWinner,
    },
    WASM_BINARY,
};
use sails_rs::{
    client::{GearEnv, GtestEnv},
    gtest::System,
    prelude::*,
};

mod fixture;
#[allow(dead_code)]
mod utils;

use fixture::{actor, Fixture, ADMIN, FEEDER_BASE, NEW_ADMIN, OPERATOR, STRANGER};
use utils::KICK_OFF;

// ── Test 1 ────────────────────────────────────────────────────────────────────

#[tokio::test]
async fn deploy_and_query_state() {
    let f = Fixture::new().await;

    let state = f.oracle.service("Service").query_state().query().unwrap();

    assert_eq!(state.admin, actor(ADMIN));
    assert_eq!(state.consensus_threshold, 2); // DEFAULT_CONSENSUS_THRESHOLD
    assert!(state.authorized_feeders.is_empty());
    assert!(state.match_results.is_empty());
    assert!(state.pending_admin.is_none());
}

// ── Test 2 ────────────────────────────────────────────────────────────────────

#[tokio::test]
async fn register_match_only_admin() {
    let f = Fixture::new().await;

    // Stranger cannot register a match.
    let err = f.as_actor(STRANGER).service("Service")
        .register_match(1, "GROUP_STAGE".to_string(), "Home".to_string(), "Away".to_string(), KICK_OFF)
        .await;
    assert!(err.is_err(), "non-admin should not register a match");

    // Admin can register.
    f.oracle.service("Service")
        .register_match(1, "GROUP_STAGE".to_string(), "Home".to_string(), "Away".to_string(), KICK_OFF)
        .await.unwrap();

    let pending = f.oracle.service("Service").query_pending_matches().query().unwrap();
    assert_eq!(pending, vec![1u64]);
}

// ── Test 3 ────────────────────────────────────────────────────────────────────

#[tokio::test]
async fn submit_requires_registration() {
    let f = Fixture::new().await;

    // Authorize feeder 1.
    f.oracle
        .service("Service")
        .set_feeder_authorized(actor(FEEDER_BASE + 1), true)
        .await
        .unwrap();

    // Feeder tries to submit to an unregistered match → error.
    let err = f
        .as_actor(FEEDER_BASE + 1)
        .service("Service")
        .submit_result(99, 1, 0, None)
        .await;
    assert!(err.is_err(), "submit to unregistered match should fail");
}

// ── Test 4 ────────────────────────────────────────────────────────────────────

#[tokio::test]
async fn consensus_happy_path() {
    let f = Fixture::new().await;
    let f1 = FEEDER_BASE + 1;
    let f2 = FEEDER_BASE + 2;

    f.oracle.service("Service")
        .register_match(1, "GROUP_STAGE".to_string(), "Brazil".to_string(), "France".to_string(), KICK_OFF)
        .await.unwrap();
    f.oracle.service("Service").set_feeder_authorized(actor(f1), true).await.unwrap();
    f.oracle.service("Service").set_feeder_authorized(actor(f2), true).await.unwrap();

    // First feeder submits: 2-1, no penalty.
    f.as_actor(f1).service("Service").submit_result(1, 2, 1, None).await.unwrap();

    // Still pending (only 1 vote).
    let result = f.oracle.service("Service").query_match_result(1).query().unwrap();
    assert!(result.is_none(), "should still be pending after 1 vote");

    // Second feeder agrees → consensus reached.
    f.as_actor(f2).service("Service").submit_result(1, 2, 1, None).await.unwrap();

    let result = f
        .oracle
        .service("Service")
        .query_match_result(1)
        .query()
        .unwrap()
        .expect("result should be finalized");

    assert_eq!(result.score.home, 2);
    assert_eq!(result.score.away, 1);
    assert!(result.penalty_winner.is_none());
}

// ── Test 5 ────────────────────────────────────────────────────────────────────

#[tokio::test]
async fn revoked_feeder_excluded_from_consensus() {
    // Single fixture — two parts use different match IDs to avoid a second System::new().
    let f = Fixture::new().await;
    let f1 = FEEDER_BASE + 1;
    let f2 = FEEDER_BASE + 2;
    let f3 = FEEDER_BASE + 3;

    f.oracle.service("Service").set_feeder_authorized(actor(f1), true).await.unwrap();
    f.oracle.service("Service").set_feeder_authorized(actor(f2), true).await.unwrap();
    f.oracle.service("Service").set_feeder_authorized(actor(f3), true).await.unwrap();

    // Part 1 (match 1): normal 2-vote consensus finalizes with default threshold=2.
    f.oracle.service("Service")
        .register_match(1, "GROUP_STAGE".to_string(), "Home".to_string(), "Away".to_string(), KICK_OFF)
        .await.unwrap();
    f.as_actor(f1).service("Service").submit_result(1, 1, 0, None).await.unwrap();
    f.as_actor(f2).service("Service").submit_result(1, 1, 0, None).await.unwrap();

    let r = f.oracle.service("Service").query_match_result(1).query().unwrap();
    assert!(r.is_some(), "consensus should finalize after 2 matching votes");

    // Part 2 (match 2): raise threshold to 3, revoke f2 after they vote.
    // Active votes: f1(2-0) + f3(2-0) = 2 < threshold 3 → still pending.
    f.oracle.service("Service").set_consensus_threshold(3).await.unwrap();
    f.oracle.service("Service")
        .register_match(2, "GROUP_STAGE".to_string(), "Home".to_string(), "Away".to_string(), KICK_OFF)
        .await.unwrap();
    f.as_actor(f1).service("Service").submit_result(2, 2, 0, None).await.unwrap();
    f.as_actor(f2).service("Service").submit_result(2, 2, 0, None).await.unwrap();
    f.oracle.service("Service").set_feeder_authorized(actor(f2), false).await.unwrap();
    f.as_actor(f3).service("Service").submit_result(2, 2, 0, None).await.unwrap();

    let r = f.oracle.service("Service").query_match_result(2).query().unwrap();
    assert!(
        r.is_none(),
        "revoked feeder's vote should not count — result must stay pending"
    );
}

// ── Test 6 ────────────────────────────────────────────────────────────────────

#[tokio::test]
async fn cancel_result_blocks_finalized() {
    let f = Fixture::new().await;
    let f1 = FEEDER_BASE + 1;
    let f2 = FEEDER_BASE + 2;

    f.oracle.service("Service")
        .register_match(1, "GROUP_STAGE".to_string(), "Home".to_string(), "Away".to_string(), KICK_OFF)
        .await.unwrap();
    f.oracle.service("Service").set_feeder_authorized(actor(f1), true).await.unwrap();
    f.oracle.service("Service").set_feeder_authorized(actor(f2), true).await.unwrap();
    f.as_actor(f1).service("Service").submit_result(1, 0, 0, None).await.unwrap();
    f.as_actor(f2).service("Service").submit_result(1, 0, 0, None).await.unwrap();

    // Result is now Finalized — admin cannot cancel it.
    let err = f.oracle.service("Service").cancel_result(1).await;
    assert!(err.is_err(), "cancel_result on Finalized should return error");

    // But can cancel a Pending match.
    f.oracle.service("Service")
        .register_match(2, "GROUP_STAGE".to_string(), "Home".to_string(), "Away".to_string(), KICK_OFF)
        .await.unwrap();
    f.oracle.service("Service").cancel_result(2).await.expect("cancel_result on Pending should succeed");
}

// ── Test 7 ────────────────────────────────────────────────────────────────────

#[tokio::test]
async fn threshold_bounds() {
    let f = Fixture::new().await;

    // threshold = 0 → error.
    let err = f.oracle.service("Service").set_consensus_threshold(0).await;
    assert!(err.is_err(), "threshold 0 should be rejected");

    // threshold > MAX_FEEDERS (20) → error.
    let err = f.oracle.service("Service").set_consensus_threshold(21).await;
    assert!(err.is_err(), "threshold above MAX_FEEDERS should be rejected");

    // threshold = 1 → ok.
    f.oracle.service("Service").set_consensus_threshold(1).await.expect("threshold 1 should be valid");

    // threshold = MAX_FEEDERS (20) → ok.
    f.oracle.service("Service").set_consensus_threshold(20).await.expect("threshold MAX_FEEDERS should be valid");
}

// ── Test 8 ────────────────────────────────────────────────────────────────────

#[tokio::test]
async fn propose_admin_rejects_zero() {
    let f = Fixture::new().await;

    let err = f.oracle.service("Service").propose_admin(ActorId::zero()).await;
    assert!(err.is_err(), "propose_admin(zero) should be rejected");
}

// ── Test 9 ────────────────────────────────────────────────────────────────────

#[tokio::test]
async fn admin_two_step_transfer() {
    let f = Fixture::new().await;

    // Step 1: current admin proposes new admin.
    f.oracle.service("Service").propose_admin(actor(NEW_ADMIN)).await.expect("propose_admin failed");

    // A stranger cannot accept.
    let err = f.as_actor(STRANGER).service("Service").accept_admin().await;
    assert!(err.is_err(), "stranger should not be able to accept admin");

    // Step 2: proposed admin accepts.
    f.as_actor(NEW_ADMIN).service("Service").accept_admin().await.expect("accept_admin failed");

    let state = f.oracle.service("Service").query_state().query().unwrap();
    assert_eq!(state.admin, actor(NEW_ADMIN));
    assert!(state.pending_admin.is_none());
    assert_ne!(state.admin, actor(ADMIN));
}

// ── Test 10 ───────────────────────────────────────────────────────────────────

#[tokio::test]
async fn force_finalize_bypasses_consensus() {
    let f = Fixture::new().await;

    f.oracle
        .service("Service")
        .force_finalize_result(42, 3, 2, Some(PenaltyWinner::Home))
        .await
        .expect("force_finalize_result failed");

    let result = f
        .oracle
        .service("Service")
        .query_match_result(42)
        .query()
        .unwrap()
        .expect("result should exist after force-finalize");

    assert_eq!(result.score.home, 3);
    assert_eq!(result.score.away, 2);
    assert_eq!(result.penalty_winner, Some(PenaltyWinner::Home));
}

// ── Test 11 ───────────────────────────────────────────────────────────────────

#[tokio::test]
async fn feeder_cannot_double_submit() {
    let f = Fixture::new().await;
    let f1 = FEEDER_BASE + 1;

    f.oracle.service("Service")
        .register_match(1, "GROUP_STAGE".to_string(), "Home".to_string(), "Away".to_string(), KICK_OFF)
        .await.unwrap();
    f.oracle.service("Service").set_feeder_authorized(actor(f1), true).await.unwrap();

    // First submit: ok.
    f.as_actor(f1).service("Service").submit_result(1, 1, 0, None).await.expect("first submit should succeed");

    // Second submit by same feeder for same match: error.
    let err = f.as_actor(f1).service("Service").submit_result(1, 1, 0, None).await;
    assert!(err.is_err(), "feeder double-submit should be rejected");
}

// ── Test 12 ───────────────────────────────────────────────────────────────────

#[tokio::test]
async fn max_feeders_limit() {
    let f = Fixture::new().await;

    // Authorize 20 feeders (MAX_FEEDERS).
    for n in 1..=20_u64 {
        f.oracle
            .service("Service")
            .set_feeder_authorized(actor(FEEDER_BASE + n), true)
            .await
            .expect(&format!("feeder {} should be authorized", n));
    }

    // The 21st feeder must be rejected.
    let err = f.oracle.service("Service").set_feeder_authorized(actor(FEEDER_BASE + 21), true).await;
    assert!(err.is_err(), "feeder #21 should exceed MAX_FEEDERS");

    // Revoking one frees a slot.
    f.oracle
        .service("Service")
        .set_feeder_authorized(actor(FEEDER_BASE + 1), false)
        .await
        .expect("revoking a feeder should succeed");

    f.oracle
        .service("Service")
        .set_feeder_authorized(actor(FEEDER_BASE + 21), true)
        .await
        .expect("slot freed — feeder #21 should now be accepted");
}

// ── Test 13 ───────────────────────────────────────────────────────────────────

#[tokio::test]
async fn operator_management_and_permissions() {
    let f = Fixture::new().await;

    // Initially no operators.
    let state = f.oracle.service("Service").query_state().query().unwrap();
    assert!(state.operators.is_empty());

    // Zero address rejected.
    let err = f.oracle.service("Service").add_operator(ActorId::zero()).await;
    assert!(err.is_err(), "add_operator(zero) should be rejected");

    // Stranger cannot add operator.
    let err = f.as_actor(STRANGER).service("Service").add_operator(actor(OPERATOR)).await;
    assert!(err.is_err(), "non-admin should not add operator");

    // Admin adds OPERATOR.
    f.oracle
        .service("Service")
        .add_operator(actor(OPERATOR))
        .await
        .expect("add_operator should succeed");

    let state = f.oracle.service("Service").query_state().query().unwrap();
    assert!(state.operators.contains(&actor(OPERATOR)));
    assert_eq!(state.operators.len(), 1);

    // Duplicate add rejected.
    let err = f.oracle.service("Service").add_operator(actor(OPERATOR)).await;
    assert!(err.is_err(), "duplicate add_operator should be rejected");

    // Operator can register a match.
    f.as_actor(OPERATOR)
        .service("Service")
        .register_match(10, "QUARTER_FINALS".to_string(), "Spain".to_string(), "Germany".to_string(), KICK_OFF)
        .await
        .expect("operator should register match");

    let pending = f.oracle.service("Service").query_pending_matches().query().unwrap();
    assert!(pending.contains(&10u64), "match 10 should be pending after operator registration");

    // Operator can force-finalize a result.
    f.as_actor(OPERATOR)
        .service("Service")
        .force_finalize_result(10, 2, 1, None)
        .await
        .expect("operator should force-finalize result");

    let result = f
        .oracle
        .service("Service")
        .query_match_result(10)
        .query()
        .unwrap()
        .expect("result should exist after operator force-finalize");
    assert_eq!(result.score.home, 2);
    assert_eq!(result.score.away, 1);

    // Operator cannot call admin-only functions.
    let err = f
        .as_actor(OPERATOR)
        .service("Service")
        .set_feeder_authorized(actor(FEEDER_BASE + 1), true)
        .await;
    assert!(err.is_err(), "operator should not authorize feeders");

    let err = f
        .as_actor(OPERATOR)
        .service("Service")
        .set_consensus_threshold(1)
        .await;
    assert!(err.is_err(), "operator should not change consensus threshold");

    let err = f
        .as_actor(OPERATOR)
        .service("Service")
        .add_operator(actor(STRANGER))
        .await;
    assert!(err.is_err(), "operator should not add other operators");

    // Stranger still cannot register even after operator is added.
    let err = f.as_actor(STRANGER).service("Service")
        .register_match(99, "GROUP_STAGE".to_string(), "Home".to_string(), "Away".to_string(), KICK_OFF)
        .await;
    assert!(err.is_err(), "stranger should not register match");

    // Admin removes OPERATOR.
    f.oracle
        .service("Service")
        .remove_operator(actor(OPERATOR))
        .await
        .expect("admin should remove operator");

    let state = f.oracle.service("Service").query_state().query().unwrap();
    assert!(!state.operators.contains(&actor(OPERATOR)));
    assert_eq!(state.operators.len(), 0);

    // Removed operator can no longer register.
    let err = f.as_actor(OPERATOR).service("Service")
        .register_match(20, "GROUP_STAGE".to_string(), "Home".to_string(), "Away".to_string(), KICK_OFF)
        .await;
    assert!(err.is_err(), "removed operator should not register match");
}

// ── Test 14 ───────────────────────────────────────────────────────────────────

#[tokio::test]
async fn constructor_rejects_zero_admin() {
    let system = System::new();
    system.init_logger();
    system.mint_to(ADMIN, 100_000_000_000_000);

    let code_id = system.submit_code(WASM_BINARY);
    let env = GtestEnv::new(system, actor(ADMIN));

    let result = env
        .deploy::<OracleProgram>(code_id, b"zero-admin-salt".to_vec())
        .new(ActorId::zero())
        .await;

    assert!(result.is_err(), "constructor with zero admin should fail");
}

// ── Test 15 ───────────────────────────────────────────────────────────────────

#[tokio::test]
async fn price_feed_initial_state_is_zero() {
    let f = Fixture::new().await;

    let (price, updated_at) = f
        .oracle
        .service("Service")
        .query_vara_usd_price()
        .query()
        .unwrap();

    assert_eq!(price, 0, "price should be 0 before any feed");
    assert_eq!(updated_at, 0, "timestamp should be 0 before any feed");
}

// ── Test 16 ───────────────────────────────────────────────────────────────────

#[tokio::test]
async fn feeder_can_set_and_query_price() {
    let f = Fixture::new().await;
    let feeder = FEEDER_BASE + 1;

    f.oracle
        .service("Service")
        .set_feeder_authorized(actor(feeder), true)
        .await
        .unwrap();

    // Real testnet price: ~$0.000749 per VARA = 749 micro-USD
    f.as_actor(feeder)
        .service("Service")
        .set_vara_usd_price(749)
        .await
        .expect("authorized feeder should set price");

    let (price, _updated_at) = f
        .oracle
        .service("Service")
        .query_vara_usd_price()
        .query()
        .unwrap();

    assert_eq!(price, 749);
}

// ── Test 17 ───────────────────────────────────────────────────────────────────

#[tokio::test]
async fn price_feed_rejects_out_of_range() {
    let f = Fixture::new().await;
    let feeder = FEEDER_BASE + 1;

    f.oracle
        .service("Service")
        .set_feeder_authorized(actor(feeder), true)
        .await
        .unwrap();

    // Zero is below the [1, 100_000_000] range.
    let err = f.as_actor(feeder).service("Service").set_vara_usd_price(0).await;
    assert!(err.is_err(), "price=0 should be rejected (below range)");

    // 100_000_001 is above $100 per VARA.
    let err = f
        .as_actor(feeder)
        .service("Service")
        .set_vara_usd_price(100_000_001)
        .await;
    assert!(err.is_err(), "price above max should be rejected");
}

// ── Test 18 ───────────────────────────────────────────────────────────────────

#[tokio::test]
async fn unauthorized_cannot_set_price() {
    let f = Fixture::new().await;

    // STRANGER is not an authorized feeder.
    let err = f
        .as_actor(STRANGER)
        .service("Service")
        .set_vara_usd_price(749)
        .await;
    assert!(err.is_err(), "non-feeder should not set price");
}

// ── Test 19 ───────────────────────────────────────────────────────────────────

#[tokio::test]
async fn price_feed_boundary_values_accepted() {
    let f = Fixture::new().await;
    let feeder = FEEDER_BASE + 1;

    f.oracle
        .service("Service")
        .set_feeder_authorized(actor(feeder), true)
        .await
        .unwrap();

    // Lower bound: $0.000001 per VARA = 1 micro-USD
    f.as_actor(feeder)
        .service("Service")
        .set_vara_usd_price(1)
        .await
        .expect("price=1 (lower boundary) should be accepted");

    let (price, _) = f.oracle.service("Service").query_vara_usd_price().query().unwrap();
    assert_eq!(price, 1);

    // Upper bound: $100 per VARA = 100_000_000 micro-USD
    f.as_actor(feeder)
        .service("Service")
        .set_vara_usd_price(100_000_000)
        .await
        .expect("price=100_000_000 (upper boundary) should be accepted");

    let (price, _) = f.oracle.service("Service").query_vara_usd_price().query().unwrap();
    assert_eq!(price, 100_000_000);
}
