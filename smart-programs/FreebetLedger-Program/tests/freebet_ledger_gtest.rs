use futures::executor::block_on;
use gtest::System;
use sails_rs::{
    client::{GtestEnv, Program as _},
    prelude::*,
};
use smartcup_freebet_ledger::WASM_BINARY as FREEBET_LEDGER_WASM_BINARY;
use smartcup_freebet_ledger_client::{
    freebet_ledger::FreebetLedger as FreebetLedgerService, FreebetLedger, FreebetLedgerCtors,
    FreebetLedgerInit, FreebetLedgerProgram, Score,
};

const ADMIN: u64 = 1;
const USER: u64 = 2;
const BOLAO: u64 = 3;
const STRANGER: u64 = 4;
const NEW_ADMIN: u64 = 5;
const TEST_BALANCE: u128 = 200_000_000_000_000;

struct Harness {
    env: GtestEnv,
    ledger: sails_rs::client::Actor<FreebetLedgerProgram, GtestEnv>,
}

impl Harness {
    fn new() -> Self {
        let system = System::new();
        system.mint_to(ADMIN, TEST_BALANCE);
        system.mint_to(USER, TEST_BALANCE);
        system.mint_to(BOLAO, TEST_BALANCE);
        system.mint_to(STRANGER, TEST_BALANCE);
        system.mint_to(NEW_ADMIN, TEST_BALANCE);

        let ledger_code_id = system.submit_code(FREEBET_LEDGER_WASM_BINARY);
        let env = GtestEnv::new(system, ADMIN.into());

        let ledger = block_on(
            FreebetLedgerProgram::deploy(ledger_code_id, b"smartcup-freebet-ledger".to_vec())
                .with_env(&env)
                .new(FreebetLedgerInit {
                    admin: ADMIN.into(),
                }),
        )
        .expect("ledger deploy");

        Self { env, ledger }
    }

    fn grant(&self, grant_id: &str, amount: u128) -> u128 {
        block_on(
            self.ledger
                .freebet_ledger()
                .grant(USER.into(), grant_id.into(), "campaign reward".into())
                .with_actor_id(ADMIN.into())
                .with_value(amount),
        )
        .expect("grant")
    }

    fn authorize_bolao(&self) {
        block_on(
            self.ledger
                .freebet_ledger()
                .authorize_bet_program(BOLAO.into())
                .with_actor_id(ADMIN.into()),
        )
        .expect("authorize bolao");
    }

    fn balance_of(&self, user: u64) -> u128 {
        self.ledger
            .freebet_ledger()
            .balance_of(user.into())
            .query()
            .expect("ledger balance")
    }
}

fn score() -> Score {
    Score { home: 2, away: 1 }
}

#[test]
fn multiple_admins_can_manage_ledger() {
    let harness = Harness::new();

    assert_eq!(
        harness
            .ledger
            .freebet_ledger()
            .admins()
            .query()
            .expect("admins"),
        vec![ADMIN.into()]
    );

    let stranger_add = block_on(
        harness
            .ledger
            .freebet_ledger()
            .add_admin(NEW_ADMIN.into())
            .with_actor_id(STRANGER.into()),
    )
    .is_err();
    assert!(stranger_add);

    block_on(
        harness
            .ledger
            .freebet_ledger()
            .add_admin(NEW_ADMIN.into())
            .with_actor_id(ADMIN.into()),
    )
    .expect("add admin");

    block_on(
        harness
            .ledger
            .freebet_ledger()
            .authorize_bet_program(BOLAO.into())
            .with_actor_id(NEW_ADMIN.into()),
    )
    .expect("new admin can authorize");

    block_on(
        harness
            .ledger
            .freebet_ledger()
            .remove_admin(ADMIN.into())
            .with_actor_id(NEW_ADMIN.into()),
    )
    .expect("remove original admin");

    let removed_admin_grant = block_on(
        harness
            .ledger
            .freebet_ledger()
            .grant(
                USER.into(),
                "task:x:user:admin-removed".into(),
                "campaign reward".into(),
            )
            .with_actor_id(ADMIN.into())
            .with_value(1_000),
    )
    .is_err();
    assert!(removed_admin_grant);

    block_on(
        harness
            .ledger
            .freebet_ledger()
            .grant(
                USER.into(),
                "task:x:user:new-admin".into(),
                "campaign reward".into(),
            )
            .with_actor_id(NEW_ADMIN.into())
            .with_value(1_000),
    )
    .expect("new admin can grant");
}

#[test]
fn withdraw_surplus_vara_does_not_touch_user_liability() {
    let harness = Harness::new();

    block_on(
        harness
            .ledger
            .freebet_ledger()
            .authorize_bet_program(BOLAO.into())
            .with_actor_id(ADMIN.into())
            .with_value(1_000),
    )
    .expect("fund surplus");
    harness.grant("task:x:user:withdraw", 1_500);

    assert_eq!(
        harness
            .ledger
            .freebet_ledger()
            .total_liability()
            .query()
            .expect("liability"),
        1_500
    );
    assert_eq!(
        harness
            .ledger
            .freebet_ledger()
            .surplus_vara()
            .query()
            .expect("surplus"),
        1_000
    );

    let too_much = block_on(
        harness
            .ledger
            .freebet_ledger()
            .withdraw_surplus_vara(STRANGER.into(), 1_001)
            .with_actor_id(ADMIN.into()),
    )
    .is_err();
    assert!(too_much);

    block_on(
        harness
            .ledger
            .freebet_ledger()
            .withdraw_surplus_vara(STRANGER.into(), 600)
            .with_actor_id(ADMIN.into()),
    )
    .expect("withdraw surplus");

    assert_eq!(
        harness
            .ledger
            .freebet_ledger()
            .total_liability()
            .query()
            .expect("liability after withdraw"),
        1_500
    );
    assert_eq!(
        harness
            .ledger
            .freebet_ledger()
            .surplus_vara()
            .query()
            .expect("surplus after withdraw"),
        400
    );
}

#[test]
fn force_withdraw_vara_can_bypass_user_liability() {
    let harness = Harness::new();
    harness.grant("task:x:user:force-withdraw", 1_500);

    assert_eq!(
        harness
            .ledger
            .freebet_ledger()
            .surplus_vara()
            .query()
            .expect("surplus"),
        0
    );

    let surplus_attempt = block_on(
        harness
            .ledger
            .freebet_ledger()
            .withdraw_surplus_vara(STRANGER.into(), 1)
            .with_actor_id(ADMIN.into()),
    )
    .is_err();
    assert!(surplus_attempt, "freebet liability is not surplus");

    let ledger_before = harness.env.system().balance_of(harness.ledger.id());
    assert!(
        ledger_before >= 1_000,
        "ledger should hold backing VARA before force-withdraw"
    );
    block_on(
        harness
            .ledger
            .freebet_ledger()
            .force_withdraw_vara(STRANGER.into(), 1_000)
            .with_actor_id(ADMIN.into()),
    )
    .expect("admin can force-withdraw backed liability");
    let ledger_after = harness.env.system().balance_of(harness.ledger.id());
    assert_eq!(ledger_after, ledger_before - 1_000);
    assert_eq!(harness.balance_of(USER), 1_500);

    let non_admin = block_on(
        harness
            .ledger
            .freebet_ledger()
            .force_withdraw_vara(STRANGER.into(), 1)
            .with_actor_id(STRANGER.into()),
    )
    .is_err();
    assert!(non_admin, "non-admin must not force-withdraw");
}

#[test]
fn grant_is_backed_by_native_vara_and_idempotent() {
    let harness = Harness::new();
    let initial_ledger_native = harness.env.system().balance_of(harness.ledger.id());

    let balance = harness.grant("task:x:user:1", 1_500);
    assert_eq!(balance, 1_500);
    assert_eq!(harness.balance_of(USER), 1_500);
    assert_eq!(
        harness.env.system().balance_of(harness.ledger.id()),
        initial_ledger_native + 1_500
    );

    let duplicate = block_on(
        harness
            .ledger
            .freebet_ledger()
            .grant(
                USER.into(),
                "task:x:user:1".into(),
                "campaign reward".into(),
            )
            .with_actor_id(ADMIN.into())
            .with_value(1_500),
    )
    .is_err();
    assert!(duplicate);
    assert_eq!(harness.balance_of(USER), 1_500);
}

#[test]
fn non_admin_cannot_grant_or_authorize_programs() {
    let harness = Harness::new();

    let grant_failed = block_on(
        harness
            .ledger
            .freebet_ledger()
            .grant(
                USER.into(),
                "task:x:user:2".into(),
                "campaign reward".into(),
            )
            .with_actor_id(STRANGER.into())
            .with_value(1_000),
    )
    .is_err();
    assert!(grant_failed);

    let authorize_failed = block_on(
        harness
            .ledger
            .freebet_ledger()
            .authorize_bet_program(BOLAO.into())
            .with_actor_id(STRANGER.into()),
    )
    .is_err();
    assert!(authorize_failed);
}

#[test]
fn unauthorized_program_cannot_receive_freebet_spend() {
    let harness = Harness::new();
    harness.grant("task:x:user:3", 1_000);

    let failed = block_on(
        harness
            .ledger
            .freebet_ledger()
            .spend_freebet(BOLAO.into(), 7, 1_000, score(), None)
            .with_actor_id(USER.into()),
    )
    .is_err();
    assert!(failed);
    assert_eq!(harness.balance_of(USER), 1_000);
}

#[test]
fn failed_downstream_spend_restores_ledger_balance() {
    let harness = Harness::new();
    harness.authorize_bolao();
    harness.grant("task:x:user:4", 1_000);

    let spent = block_on(
        harness
            .ledger
            .freebet_ledger()
            .spend_freebet(BOLAO.into(), 7, 1_000, score(), None)
            .with_actor_id(USER.into()),
    )
    .expect("failed downstream spend should commit refund");

    assert_eq!(spent, 0);
    assert_eq!(harness.balance_of(USER), 1_000);
    assert_eq!(
        harness
            .ledger
            .freebet_ledger()
            .get_pending_spend_count()
            .query()
            .expect("pending count"),
        0
    );
}

#[test]
fn authorized_bet_program_can_return_freebet_to_user_balance() {
    let harness = Harness::new();
    harness.authorize_bolao();

    let balance = block_on(
        harness
            .ledger
            .freebet_ledger()
            .return_freebet(USER.into(), 7)
            .with_actor_id(BOLAO.into())
            .with_value(600),
    )
    .expect("return freebet");

    assert_eq!(balance, 600);
    assert_eq!(harness.balance_of(USER), 600);
}
