use dao_program::client::service::Service as DaoSvc;
use dao_program::client::{IoDaoState, ProposalKind, ProposalStatus, VoteChoice};
use sails_rs::prelude::*;

mod fixture;
mod utils;

use fixture::{actor, Fixture, MOCK_BOLAO, NEW_OWNER, OWNER, STRANGER, VOTER_A, VOTER_B, VOTER_C};
use utils::VOTING_PERIOD_BLOCKS;

// ── Test 1: deploy ─────────────────────────────────────────────────────────────

#[tokio::test]
async fn multiple_admins_can_manage_and_withdraw_vara() {
    let f = Fixture::new().await;

    assert_eq!(
        f.program
            .service("Service")
            .query_state()
            .query()
            .unwrap()
            .admins,
        vec![actor(OWNER)]
    );

    let stranger_add = f
        .as_actor(STRANGER)
        .service("Service")
        .add_admin(actor(NEW_OWNER))
        .await;
    assert!(stranger_add.is_err(), "stranger should not add admins");

    f.program
        .service("Service")
        .add_admin(actor(NEW_OWNER))
        .await
        .expect("owner should add admin");

    f.as_actor(NEW_OWNER)
        .service("Service")
        .set_bolao_program(actor(NEW_OWNER))
        .with_value(2_000)
        .await
        .expect("new admin should manage DAO and fund contract");

    let program_balance = f.env.system().balance_of(f.program.id());
    assert!(program_balance >= 2_000);

    f.as_actor(NEW_OWNER)
        .service("Service")
        .withdraw_vara(actor(STRANGER), 700)
        .await
        .expect("admin should withdraw DAO balance");

    assert_eq!(
        f.env.system().balance_of(f.program.id()),
        program_balance - 700
    );

    f.as_actor(NEW_OWNER)
        .service("Service")
        .remove_admin(actor(OWNER))
        .await
        .expect("new admin should remove original owner");

    let state = f.program.service("Service").query_state().query().unwrap();
    assert_eq!(state.owner, actor(NEW_OWNER));

    let removed_owner_call = f
        .program
        .service("Service")
        .set_bolao_program(actor(MOCK_BOLAO))
        .await;
    assert!(
        removed_owner_call.is_err(),
        "removed owner should lose admin access"
    );

    let remove_last = f
        .as_actor(NEW_OWNER)
        .service("Service")
        .remove_admin(actor(NEW_OWNER))
        .await;
    assert!(remove_last.is_err(), "last admin cannot be removed");
}

#[tokio::test]
async fn deploy_and_query_state() {
    let f = Fixture::new().await;

    let state: IoDaoState = f.program.service("Service").query_state().query().unwrap();

    assert_eq!(state.owner, actor(OWNER));
    assert_eq!(state.bolao_program, actor(MOCK_BOLAO));
    assert_eq!(state.proposal_count, 0);
    assert_eq!(state.quorum_bps, 2_000);
    assert_eq!(state.voting_period, 86_400_000);
    assert!(!state.bolao_code_registered);
    assert_eq!(state.bolao_instance_count, 0);
}

// ── Test 2: access control — owner-only methods ────────────────────────────────

#[tokio::test]
async fn owner_only_set_bolao_program() {
    let f = Fixture::new().await;

    // Stranger cannot change bolao_program.
    let err = f
        .as_actor(STRANGER)
        .service("Service")
        .set_bolao_program(actor(STRANGER))
        .await;
    assert!(err.is_err(), "non-owner should not change bolao_program");

    // Owner can change it.
    f.program
        .service("Service")
        .set_bolao_program(actor(NEW_OWNER))
        .await
        .expect("owner should update bolao_program");

    let state = f.program.service("Service").query_state().query().unwrap();
    assert_eq!(state.bolao_program, actor(NEW_OWNER));
}

#[tokio::test]
async fn owner_only_set_owner() {
    let f = Fixture::new().await;

    // Stranger cannot transfer ownership.
    let err = f
        .as_actor(STRANGER)
        .service("Service")
        .set_owner(actor(STRANGER))
        .await;
    assert!(err.is_err(), "non-owner should not transfer ownership");

    // Zero address rejected.
    let err = f
        .program
        .service("Service")
        .set_owner(ActorId::zero())
        .await;
    assert!(err.is_err(), "zero address should be rejected");

    // Owner transfers to NEW_OWNER.
    f.program
        .service("Service")
        .set_owner(actor(NEW_OWNER))
        .await
        .expect("owner should transfer ownership");

    let state = f.program.service("Service").query_state().query().unwrap();
    assert_eq!(state.owner, actor(NEW_OWNER));
}

#[tokio::test]
async fn owner_only_register_bolao_code() {
    let f = Fixture::new().await;

    let code = [1u8; 32];

    // Stranger cannot register code.
    let err = f
        .as_actor(STRANGER)
        .service("Service")
        .register_bolao_code(code)
        .await;
    assert!(err.is_err(), "non-owner should not register code");

    // Owner registers code.
    f.program
        .service("Service")
        .register_bolao_code(code)
        .await
        .expect("owner should register bolao code");

    let state = f.program.service("Service").query_state().query().unwrap();
    assert!(state.bolao_code_registered);
}

// ── Test 3: create_proposal ────────────────────────────────────────────────────

#[tokio::test]
async fn create_proposal_happy_path() {
    let f = Fixture::new().await;

    f.as_actor(VOTER_A)
        .service("Service")
        .create_proposal(
            ProposalKind::SetQuorum {
                new_quorum_bps: 3_000,
            },
            "Raise quorum to 30%".to_string(),
        )
        .await
        .expect("any caller should create a proposal");

    let state = f.program.service("Service").query_state().query().unwrap();
    assert_eq!(state.proposal_count, 1);

    let p = f
        .program
        .service("Service")
        .query_proposal(1)
        .query()
        .unwrap()
        .expect("proposal 1 should exist");

    assert_eq!(p.id, 1);
    assert_eq!(p.proposer, actor(VOTER_A));
    assert!(matches!(p.status, ProposalStatus::Active));
    assert!(!p.executed);
}

#[tokio::test]
async fn create_proposal_description_too_long() {
    let f = Fixture::new().await;

    let long_desc = "x".repeat(513);
    let err = f
        .program
        .service("Service")
        .create_proposal(
            ProposalKind::SetQuorum {
                new_quorum_bps: 1_000,
            },
            long_desc,
        )
        .await;
    assert!(err.is_err(), "description > 512 bytes should be rejected");
}

// ── Test 4: vote ───────────────────────────────────────────────────────────────

#[tokio::test]
async fn vote_happy_path() {
    let f = Fixture::new().await;

    f.program
        .service("Service")
        .create_proposal(
            ProposalKind::SetQuorum {
                new_quorum_bps: 1_000,
            },
            "Test vote".to_string(),
        )
        .await
        .unwrap();

    f.as_actor(VOTER_A)
        .service("Service")
        .vote(1, VoteChoice::Yes)
        .await
        .expect("VOTER_A should vote Yes");

    f.as_actor(VOTER_B)
        .service("Service")
        .vote(1, VoteChoice::No)
        .await
        .expect("VOTER_B should vote No");

    f.as_actor(VOTER_C)
        .service("Service")
        .vote(1, VoteChoice::Abstain)
        .await
        .expect("VOTER_C should abstain");

    let p = f
        .program
        .service("Service")
        .query_proposal(1)
        .query()
        .unwrap()
        .unwrap();
    assert_eq!(p.yes, 1);
    assert_eq!(p.no, 1);
    assert_eq!(p.abstain, 1);
}

#[tokio::test]
async fn vote_double_vote_rejected() {
    let f = Fixture::new().await;

    f.program
        .service("Service")
        .create_proposal(
            ProposalKind::SetQuorum {
                new_quorum_bps: 1_000,
            },
            "Double vote test".to_string(),
        )
        .await
        .unwrap();

    f.as_actor(VOTER_A)
        .service("Service")
        .vote(1, VoteChoice::Yes)
        .await
        .unwrap();

    let err = f
        .as_actor(VOTER_A)
        .service("Service")
        .vote(1, VoteChoice::No)
        .await;
    assert!(err.is_err(), "double vote should be rejected");
}

// ── Test 5: finalize_proposal ──────────────────────────────────────────────────

#[tokio::test]
async fn finalize_sets_succeeded_when_yes_wins() {
    let f = Fixture::new().await;

    // quorum_bps = 0 → quorum always met (useful to avoid large vote counts in tests)
    f.program
        .service("Service")
        .create_proposal(
            ProposalKind::SetQuorum { new_quorum_bps: 0 },
            "Set quorum to 0".to_string(),
        )
        .await
        .unwrap();
    // Set to 0 so finalize uses quorum=0 for this proposal
    // (quorum_bps check uses the CURRENT quorum, not the proposal's)
    // We need to vote enough to meet the current 20% quorum for the finalize test.
    // Simpler: use another proposal. For this test, use SetQuorum{0} to skip quorum.
    // Actually quorum check uses state.quorum_bps at finalize time.
    // Since default is 2000, we need ≥ max(2, 2000/1000) = 2 votes to pass quorum.
    f.as_actor(VOTER_A)
        .service("Service")
        .vote(1, VoteChoice::Yes)
        .await
        .unwrap();
    f.as_actor(VOTER_B)
        .service("Service")
        .vote(1, VoteChoice::Yes)
        .await
        .unwrap();

    // Advance past the 24h voting period (86 400 s = 86 400 blocks at 1 block/s).
    f.spend_blocks(VOTING_PERIOD_BLOCKS + 1);

    f.program
        .service("Service")
        .finalize_proposal(1)
        .await
        .expect("finalize should succeed after voting ends");

    let p = f
        .program
        .service("Service")
        .query_proposal(1)
        .query()
        .unwrap()
        .unwrap();
    assert!(
        matches!(p.status, ProposalStatus::Succeeded),
        "proposal with yes > no and quorum met should be Succeeded"
    );
}

#[tokio::test]
async fn finalize_sets_defeated_when_quorum_not_met() {
    let f = Fixture::new().await;

    f.program
        .service("Service")
        .create_proposal(
            ProposalKind::SetVotingPeriod {
                new_voting_period: 1_000,
            },
            "Quorum test".to_string(),
        )
        .await
        .unwrap();

    // Only 1 vote — default quorum requires ≥ 2.
    f.as_actor(VOTER_A)
        .service("Service")
        .vote(1, VoteChoice::Yes)
        .await
        .unwrap();

    f.spend_blocks(VOTING_PERIOD_BLOCKS + 1);

    f.program
        .service("Service")
        .finalize_proposal(1)
        .await
        .unwrap();

    let p = f
        .program
        .service("Service")
        .query_proposal(1)
        .query()
        .unwrap()
        .unwrap();
    assert!(
        matches!(p.status, ProposalStatus::Defeated),
        "proposal with insufficient votes should be Defeated"
    );
}

// ── Test 6: execute — DAO governance params ────────────────────────────────────

#[tokio::test]
async fn execute_set_quorum_proposal() {
    let f = Fixture::new().await;

    f.program
        .service("Service")
        .create_proposal(
            ProposalKind::SetQuorum {
                new_quorum_bps: 5_000,
            },
            "Raise quorum".to_string(),
        )
        .await
        .unwrap();

    // Cast 3 Yes votes to comfortably exceed quorum.
    for voter in [VOTER_A, VOTER_B, VOTER_C] {
        f.as_actor(voter)
            .service("Service")
            .vote(1, VoteChoice::Yes)
            .await
            .unwrap();
    }

    f.spend_blocks(VOTING_PERIOD_BLOCKS + 1);

    f.program
        .service("Service")
        .execute(1)
        .await
        .expect("execute should succeed");

    let state = f.program.service("Service").query_state().query().unwrap();
    assert_eq!(
        state.quorum_bps, 5_000,
        "quorum_bps should be updated to 5000"
    );

    let p = f
        .program
        .service("Service")
        .query_proposal(1)
        .query()
        .unwrap()
        .unwrap();
    assert!(matches!(p.status, ProposalStatus::Executed));
    assert!(p.executed);
}

#[tokio::test]
async fn execute_set_voting_period_proposal() {
    let f = Fixture::new().await;

    let new_period: u64 = 3_600_000; // 1 hour
    f.program
        .service("Service")
        .create_proposal(
            ProposalKind::SetVotingPeriod {
                new_voting_period: new_period,
            },
            "Shorten voting period".to_string(),
        )
        .await
        .unwrap();

    for voter in [VOTER_A, VOTER_B, VOTER_C] {
        f.as_actor(voter)
            .service("Service")
            .vote(1, VoteChoice::Yes)
            .await
            .unwrap();
    }

    f.spend_blocks(VOTING_PERIOD_BLOCKS + 1);

    f.program
        .service("Service")
        .execute(1)
        .await
        .expect("execute should succeed");

    let state = f.program.service("Service").query_state().query().unwrap();
    assert_eq!(state.voting_period, new_period);
}

#[tokio::test]
async fn execute_set_default_bolao_proposal() {
    let f = Fixture::new().await;

    let new_bolao = actor(NEW_OWNER);
    f.program
        .service("Service")
        .create_proposal(
            ProposalKind::SetDefaultBolao { new_bolao },
            "Switch default bolao".to_string(),
        )
        .await
        .unwrap();

    for voter in [VOTER_A, VOTER_B, VOTER_C] {
        f.as_actor(voter)
            .service("Service")
            .vote(1, VoteChoice::Yes)
            .await
            .unwrap();
    }

    f.spend_blocks(VOTING_PERIOD_BLOCKS + 1);
    f.program
        .service("Service")
        .execute(1)
        .await
        .expect("execute should succeed");

    let state = f.program.service("Service").query_state().query().unwrap();
    assert_eq!(state.bolao_program, new_bolao);
}

// ── Test 7: execute — active proposal panics ───────────────────────────────────

#[tokio::test]
async fn execute_while_active_panics() {
    let f = Fixture::new().await;

    f.program
        .service("Service")
        .create_proposal(
            ProposalKind::SetQuorum {
                new_quorum_bps: 1_000,
            },
            "Still voting".to_string(),
        )
        .await
        .unwrap();

    // Don't advance blocks — voting is still in progress.
    let err = f.program.service("Service").execute(1).await;
    assert!(err.is_err(), "execute while voting in progress should fail");
}

// ── Test 8: execute — double execute panics ────────────────────────────────────

#[tokio::test]
async fn execute_double_execute_panics() {
    let f = Fixture::new().await;

    f.program
        .service("Service")
        .create_proposal(
            ProposalKind::SetQuorum {
                new_quorum_bps: 100,
            },
            "Execute twice test".to_string(),
        )
        .await
        .unwrap();

    for voter in [VOTER_A, VOTER_B, VOTER_C] {
        f.as_actor(voter)
            .service("Service")
            .vote(1, VoteChoice::Yes)
            .await
            .unwrap();
    }
    f.spend_blocks(VOTING_PERIOD_BLOCKS + 1);

    f.program
        .service("Service")
        .execute(1)
        .await
        .expect("first execute should succeed");

    let err = f.program.service("Service").execute(1).await;
    assert!(err.is_err(), "second execute should fail");
}

// ── Test 9: query helpers ──────────────────────────────────────────────────────

#[tokio::test]
async fn query_proposals_and_votes() {
    let f = Fixture::new().await;

    f.program
        .service("Service")
        .create_proposal(
            ProposalKind::SetQuorum {
                new_quorum_bps: 1_000,
            },
            "Proposal A".to_string(),
        )
        .await
        .unwrap();
    f.program
        .service("Service")
        .create_proposal(
            ProposalKind::SetVotingPeriod {
                new_voting_period: 1_000,
            },
            "Proposal B".to_string(),
        )
        .await
        .unwrap();

    let all = f
        .program
        .service("Service")
        .query_proposals()
        .query()
        .unwrap();
    assert_eq!(all.len(), 2);

    f.as_actor(VOTER_A)
        .service("Service")
        .vote(1, VoteChoice::Yes)
        .await
        .unwrap();

    let v = f
        .program
        .service("Service")
        .query_vote(1, actor(VOTER_A))
        .query()
        .unwrap();
    assert_eq!(v, Some(VoteChoice::Yes));

    let no_vote = f
        .program
        .service("Service")
        .query_vote(1, actor(STRANGER))
        .query()
        .unwrap();
    assert_eq!(no_vote, None);
}

// ── Test 10: query_bolao_instances starts empty ────────────────────────────────

#[tokio::test]
async fn bolao_instances_starts_empty() {
    let f = Fixture::new().await;

    let instances = f
        .program
        .service("Service")
        .query_bolao_instances()
        .query()
        .unwrap();
    assert!(instances.is_empty());
}

// ── Test 11: deploy_bolao requires registered code ─────────────────────────────

#[tokio::test]
async fn deploy_bolao_without_code_panics() {
    let f = Fixture::new().await;

    // No code registered — should fail immediately.
    let err = f
        .program
        .service("Service")
        .deploy_bolao(actor(OWNER), b"salt".to_vec(), 5_000_000_000)
        .await;
    assert!(
        err.is_err(),
        "deploy_bolao without registered code should fail"
    );
}

// ── Test 12: execute — CancelMatchResult dispatches to bolao_program ───────────

#[tokio::test]
async fn execute_cancel_match_result_proposal() {
    let f = Fixture::new().await;

    let match_id: u64 = 42;
    f.program
        .service("Service")
        .create_proposal(
            ProposalKind::CancelMatchResult { match_id },
            "Cancel oracle result for match 42".to_string(),
        )
        .await
        .expect("any caller should create a CancelMatchResult proposal");

    let state = f.program.service("Service").query_state().query().unwrap();
    assert_eq!(state.proposal_count, 1);

    // Cast 3 Yes votes to comfortably exceed the default 20% quorum.
    for voter in [VOTER_A, VOTER_B, VOTER_C] {
        f.as_actor(voter)
            .service("Service")
            .vote(1, VoteChoice::Yes)
            .await
            .unwrap();
    }

    f.spend_blocks(VOTING_PERIOD_BLOCKS + 1);

    f.program
        .service("Service")
        .execute(1)
        .await
        .expect("execute CancelMatchResult should succeed and dispatch to bolao_program");

    let p = f
        .program
        .service("Service")
        .query_proposal(1)
        .query()
        .unwrap()
        .unwrap();
    assert!(
        matches!(p.status, ProposalStatus::Executed),
        "CancelMatchResult proposal should reach Executed status"
    );
    assert!(p.executed);
}
