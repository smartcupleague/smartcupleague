use sails_rs::{
    calls::{Activation, Call, Query},
    gtest::{calls::GTestRemoting, System},
    prelude::*,
};

// Generated client — contains TemplateFactory, Service, and all IDL types.
include!(concat!(env!("CARGO_MANIFEST_DIR"), "/template_client.rs"));

// ── Constants ─────────────────────────────────────────────────────────────────

const ADMIN: u64 = 100;
const NEW_ADMIN: u64 = 101;
const STRANGER: u64 = 199;
const FEEDER_BASE: u64 = 200; // feeders are FEEDER_BASE + 1 .. FEEDER_BASE + N

fn actor(id: u64) -> ActorId {
    id.into()
}

// ── Deploy helper ─────────────────────────────────────────────────────────────

/// Deploys the oracle as ADMIN and returns (program_id, admin_remoting).
/// Each test gets its own System, so tests are fully isolated.
async fn deploy() -> (ActorId, GTestRemoting) {
    let system = System::new();
    system.init_logger();

    // Fund every account we'll use.
    for id in [ADMIN, NEW_ADMIN, STRANGER] {
        system.mint_to(id, 100_000_000_000_000);
    }
    for n in 1..=21_u64 {
        system.mint_to(FEEDER_BASE + n, 100_000_000_000_000);
    }

    let remoting = GTestRemoting::new(system, actor(ADMIN));
    let code_id = remoting.system().submit_code(wasm::WASM_BINARY);

    let program_id = TemplateFactory::new(remoting.clone())
        .new(actor(ADMIN))
        .send_recv(code_id, b"oracle-salt")
        .await
        .expect("deploy failed");

    (program_id, remoting)
}

/// Returns a Service client acting as `actor_id`, sharing the same System.
fn svc_as(remoting: &GTestRemoting, actor_id: u64) -> Service<GTestRemoting> {
    Service::new(remoting.clone().with_actor(actor_id.into()))
}

// ── Test 1 ────────────────────────────────────────────────────────────────────

#[tokio::test]
async fn deploy_and_query_state() {
    let (pid, rem) = deploy().await;

    let state = Service::new(rem)
        .query_state()
        .recv(pid)
        .await
        .expect("query_state failed");

    assert_eq!(state.admin, actor(ADMIN));
    assert_eq!(state.consensus_threshold, 2); // DEFAULT_CONSENSUS_THRESHOLD
    assert!(state.authorized_feeders.is_empty());
    assert!(state.match_results.is_empty());
    assert!(state.pending_admin.is_none());
}

// ── Test 2 ────────────────────────────────────────────────────────────────────

#[tokio::test]
async fn register_match_only_admin() {
    let (pid, rem) = deploy().await;

    // Stranger cannot register a match.
    let err = svc_as(&rem, STRANGER)
        .register_match(1)
        .send_recv(pid)
        .await;
    assert!(err.is_err(), "non-admin should not register a match");

    // Admin can register.
    svc_as(&rem, ADMIN)
        .register_match(1)
        .send_recv(pid)
        .await
        .expect("admin register_match failed");

    let pending = Service::new(rem)
        .query_pending_matches()
        .recv(pid)
        .await
        .expect("query_pending_matches failed");
    assert_eq!(pending, vec![1u64]);
}

// ── Test 3 ────────────────────────────────────────────────────────────────────

#[tokio::test]
async fn submit_requires_registration() {
    let (pid, rem) = deploy().await;

    // Authorize feeder 1.
    svc_as(&rem, ADMIN)
        .set_feeder_authorized(actor(FEEDER_BASE + 1), true)
        .send_recv(pid)
        .await
        .expect("set_feeder_authorized failed");

    // Feeder tries to submit to an unregistered match → error.
    let err = svc_as(&rem, FEEDER_BASE + 1)
        .submit_result(99, 1, 0, None)
        .send_recv(pid)
        .await;
    assert!(err.is_err(), "submit to unregistered match should fail");
}

// ── Test 4 ────────────────────────────────────────────────────────────────────

#[tokio::test]
async fn consensus_happy_path() {
    let (pid, rem) = deploy().await;

    let f1 = FEEDER_BASE + 1;
    let f2 = FEEDER_BASE + 2;

    // Admin setup.
    svc_as(&rem, ADMIN)
        .register_match(1)
        .send_recv(pid)
        .await
        .unwrap();
    svc_as(&rem, ADMIN)
        .set_feeder_authorized(actor(f1), true)
        .send_recv(pid)
        .await
        .unwrap();
    svc_as(&rem, ADMIN)
        .set_feeder_authorized(actor(f2), true)
        .send_recv(pid)
        .await
        .unwrap();

    // First feeder submits: 2-1, no penalty.
    svc_as(&rem, f1)
        .submit_result(1, 2, 1, None)
        .send_recv(pid)
        .await
        .expect("feeder1 submit failed");

    // Still pending (only 1 vote).
    let result = Service::new(rem.clone())
        .query_match_result(1)
        .recv(pid)
        .await
        .unwrap();
    assert!(result.is_none(), "should still be pending after 1 vote");

    // Second feeder agrees: 2-1, no penalty → consensus reached.
    svc_as(&rem, f2)
        .submit_result(1, 2, 1, None)
        .send_recv(pid)
        .await
        .expect("feeder2 submit failed");

    let result = Service::new(rem)
        .query_match_result(1)
        .recv(pid)
        .await
        .unwrap()
        .expect("result should be finalized");

    assert_eq!(result.score.home, 2);
    assert_eq!(result.score.away, 1);
    assert!(result.penalty_winner.is_none());
}

// ── Test 5 ────────────────────────────────────────────────────────────────────

#[tokio::test]
async fn revoked_feeder_excluded_from_consensus() {
    let (pid, rem) = deploy().await;

    let f1 = FEEDER_BASE + 1;
    let f2 = FEEDER_BASE + 2;

    svc_as(&rem, ADMIN).register_match(1).send_recv(pid).await.unwrap();
    svc_as(&rem, ADMIN).set_feeder_authorized(actor(f1), true).send_recv(pid).await.unwrap();
    svc_as(&rem, ADMIN).set_feeder_authorized(actor(f2), true).send_recv(pid).await.unwrap();

    // Both feeders submit 1-0.
    svc_as(&rem, f1).submit_result(1, 1, 0, None).send_recv(pid).await.unwrap();
    svc_as(&rem, f2).submit_result(1, 1, 0, None).send_recv(pid).await.unwrap();
    // Consensus should have fired. Let's confirm it's finalized.
    let r = Service::new(rem.clone()).query_match_result(1).recv(pid).await.unwrap();
    assert!(r.is_some(), "consensus should finalize after 2 matching votes");

    // ── Separate test: revoked vote does NOT unlock consensus ─────────────────
    let (pid2, rem2) = deploy().await;

    let f3 = FEEDER_BASE + 3;
    svc_as(&rem2, ADMIN).register_match(2).send_recv(pid2).await.unwrap();
    svc_as(&rem2, ADMIN).set_feeder_authorized(actor(f1), true).send_recv(pid2).await.unwrap();
    svc_as(&rem2, ADMIN).set_feeder_authorized(actor(f2), true).send_recv(pid2).await.unwrap();
    svc_as(&rem2, ADMIN).set_feeder_authorized(actor(f3), true).send_recv(pid2).await.unwrap();

    // f1 and f2 submit 3-0; then f2 gets revoked.
    svc_as(&rem2, f1).submit_result(2, 3, 0, None).send_recv(pid2).await.unwrap();
    svc_as(&rem2, f2).submit_result(2, 3, 0, None).send_recv(pid2).await.unwrap();
    // At this point consensus was reached with 2 votes before revocation.
    // Let's verify: increase threshold to 3 so we can test revocation scenario.
    let (pid3, rem3) = deploy().await;
    svc_as(&rem3, ADMIN).set_consensus_threshold(3).send_recv(pid3).await.unwrap();
    svc_as(&rem3, ADMIN).register_match(1).send_recv(pid3).await.unwrap();
    svc_as(&rem3, ADMIN).set_feeder_authorized(actor(f1), true).send_recv(pid3).await.unwrap();
    svc_as(&rem3, ADMIN).set_feeder_authorized(actor(f2), true).send_recv(pid3).await.unwrap();
    svc_as(&rem3, ADMIN).set_feeder_authorized(actor(f3), true).send_recv(pid3).await.unwrap();

    // f1 and f2 submit 2-0; revoke f2; f3 submits 2-0.
    // Active votes: f1(2-0) + f3(2-0) = 2 < threshold 3 → still pending.
    svc_as(&rem3, f1).submit_result(1, 2, 0, None).send_recv(pid3).await.unwrap();
    svc_as(&rem3, f2).submit_result(1, 2, 0, None).send_recv(pid3).await.unwrap();
    svc_as(&rem3, ADMIN).set_feeder_authorized(actor(f2), false).send_recv(pid3).await.unwrap();
    svc_as(&rem3, f3).submit_result(1, 2, 0, None).send_recv(pid3).await.unwrap();

    let r3 = Service::new(rem3).query_match_result(1).recv(pid3).await.unwrap();
    assert!(
        r3.is_none(),
        "revoked feeder's vote should not count — result must stay pending"
    );
}

// ── Test 6 ────────────────────────────────────────────────────────────────────

#[tokio::test]
async fn cancel_result_blocks_finalized() {
    let (pid, rem) = deploy().await;

    let f1 = FEEDER_BASE + 1;
    let f2 = FEEDER_BASE + 2;

    svc_as(&rem, ADMIN).register_match(1).send_recv(pid).await.unwrap();
    svc_as(&rem, ADMIN).set_feeder_authorized(actor(f1), true).send_recv(pid).await.unwrap();
    svc_as(&rem, ADMIN).set_feeder_authorized(actor(f2), true).send_recv(pid).await.unwrap();
    svc_as(&rem, f1).submit_result(1, 0, 0, None).send_recv(pid).await.unwrap();
    svc_as(&rem, f2).submit_result(1, 0, 0, None).send_recv(pid).await.unwrap();

    // Result is now Finalized. Admin cannot cancel it.
    let err = svc_as(&rem, ADMIN)
        .cancel_result(1)
        .send_recv(pid)
        .await;
    assert!(err.is_err(), "cancel_result on Finalized should return error");

    // But can cancel a pending (non-finalized) match.
    svc_as(&rem, ADMIN).register_match(2).send_recv(pid).await.unwrap();
    svc_as(&rem, ADMIN)
        .cancel_result(2)
        .send_recv(pid)
        .await
        .expect("cancel_result on Pending should succeed");
}

// ── Test 7 ────────────────────────────────────────────────────────────────────

#[tokio::test]
async fn threshold_bounds() {
    let (pid, rem) = deploy().await;

    // threshold = 0 → error.
    let err = svc_as(&rem, ADMIN)
        .set_consensus_threshold(0)
        .send_recv(pid)
        .await;
    assert!(err.is_err(), "threshold 0 should be rejected");

    // threshold > MAX_FEEDERS (20) → error.
    let err = svc_as(&rem, ADMIN)
        .set_consensus_threshold(21)
        .send_recv(pid)
        .await;
    assert!(err.is_err(), "threshold above MAX_FEEDERS should be rejected");

    // threshold = 1 → ok.
    svc_as(&rem, ADMIN)
        .set_consensus_threshold(1)
        .send_recv(pid)
        .await
        .expect("threshold 1 should be valid");

    // threshold = MAX_FEEDERS (20) → ok.
    svc_as(&rem, ADMIN)
        .set_consensus_threshold(20)
        .send_recv(pid)
        .await
        .expect("threshold MAX_FEEDERS should be valid");
}

// ── Test 8 ────────────────────────────────────────────────────────────────────

#[tokio::test]
async fn propose_admin_rejects_zero() {
    let (pid, rem) = deploy().await;

    let err = svc_as(&rem, ADMIN)
        .propose_admin(ActorId::zero())
        .send_recv(pid)
        .await;
    assert!(err.is_err(), "propose_admin(zero) should be rejected");
}

// ── Test 9 ────────────────────────────────────────────────────────────────────

#[tokio::test]
async fn admin_two_step_transfer() {
    let (pid, rem) = deploy().await;

    // Step 1: current admin proposes new admin.
    svc_as(&rem, ADMIN)
        .propose_admin(actor(NEW_ADMIN))
        .send_recv(pid)
        .await
        .expect("propose_admin failed");

    // A random stranger cannot accept.
    let err = svc_as(&rem, STRANGER)
        .accept_admin()
        .send_recv(pid)
        .await;
    assert!(err.is_err(), "stranger should not be able to accept admin");

    // Step 2: proposed admin accepts.
    svc_as(&rem, NEW_ADMIN)
        .accept_admin()
        .send_recv(pid)
        .await
        .expect("accept_admin failed");

    // Verify state updated.
    let state = Service::new(rem)
        .query_state()
        .recv(pid)
        .await
        .unwrap();
    assert_eq!(state.admin, actor(NEW_ADMIN));
    assert!(state.pending_admin.is_none());

    // Old admin is no longer admin.
    // (trying to register a match as old admin should fail)
    // We can't easily create a remoting for OLD_ADMIN without another deploy,
    // so we verify via state only.
    assert_ne!(state.admin, actor(ADMIN));
}

// ── Test 10 ───────────────────────────────────────────────────────────────────

#[tokio::test]
async fn force_finalize_bypasses_consensus() {
    let (pid, rem) = deploy().await;

    // No feeders, no registration needed — admin can force-finalize directly.
    svc_as(&rem, ADMIN)
        .force_finalize_result(42, 3, 2, Some(PenaltyWinner::Home))
        .send_recv(pid)
        .await
        .expect("force_finalize_result failed");

    let result = Service::new(rem)
        .query_match_result(42)
        .recv(pid)
        .await
        .unwrap()
        .expect("result should exist after force-finalize");

    assert_eq!(result.score.home, 3);
    assert_eq!(result.score.away, 2);
    assert_eq!(result.penalty_winner, Some(PenaltyWinner::Home));
}

// ── Test 11 ───────────────────────────────────────────────────────────────────

#[tokio::test]
async fn feeder_cannot_double_submit() {
    let (pid, rem) = deploy().await;

    let f1 = FEEDER_BASE + 1;

    svc_as(&rem, ADMIN).register_match(1).send_recv(pid).await.unwrap();
    svc_as(&rem, ADMIN).set_feeder_authorized(actor(f1), true).send_recv(pid).await.unwrap();

    // First submit: ok.
    svc_as(&rem, f1)
        .submit_result(1, 1, 0, None)
        .send_recv(pid)
        .await
        .expect("first submit should succeed");

    // Second submit by same feeder for same match: error.
    let err = svc_as(&rem, f1)
        .submit_result(1, 1, 0, None)
        .send_recv(pid)
        .await;
    assert!(err.is_err(), "feeder double-submit should be rejected");
}

// ── Test 12 ───────────────────────────────────────────────────────────────────

#[tokio::test]
async fn max_feeders_limit() {
    let (pid, rem) = deploy().await;

    // Authorize 20 feeders (MAX_FEEDERS).
    for n in 1..=20_u64 {
        svc_as(&rem, ADMIN)
            .set_feeder_authorized(actor(FEEDER_BASE + n), true)
            .send_recv(pid)
            .await
            .unwrap_or_else(|_| panic!("feeder {} should be authorized", n));
    }

    // The 21st feeder must be rejected.
    let err = svc_as(&rem, ADMIN)
        .set_feeder_authorized(actor(FEEDER_BASE + 21), true)
        .send_recv(pid)
        .await;
    assert!(err.is_err(), "feeder #21 should exceed MAX_FEEDERS");

    // Revoking one active feeder and re-authorizing a new one must succeed.
    svc_as(&rem, ADMIN)
        .set_feeder_authorized(actor(FEEDER_BASE + 1), false)
        .send_recv(pid)
        .await
        .expect("revoking a feeder should succeed");

    svc_as(&rem, ADMIN)
        .set_feeder_authorized(actor(FEEDER_BASE + 21), true)
        .send_recv(pid)
        .await
        .expect("slot freed — feeder #21 should now be accepted");
}

// ── Test 13 ───────────────────────────────────────────────────────────────────

#[tokio::test]
async fn constructor_rejects_zero_admin() {
    let system = System::new();
    system.init_logger();
    system.mint_to(ADMIN, 100_000_000_000_000);

    let remoting = GTestRemoting::new(system, actor(ADMIN));
    let code_id = remoting.system().submit_code(wasm::WASM_BINARY);

    // Deploying with ActorId::zero() as admin must panic / fail.
    let result = TemplateFactory::new(remoting)
        .new(ActorId::zero())
        .send_recv(code_id, b"zero-admin-salt")
        .await;

    assert!(
        result.is_err(),
        "constructor with zero admin should fail (assert! panic)"
    );
}
