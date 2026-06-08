use dao_program::{
    client::{DaoCtors, DaoProgram},
    WASM_BINARY,
};
use sails_rs::{
    client::{Actor, GearEnv, GtestEnv},
    gtest::System,
    prelude::*,
};

// ── Actor IDs ─────────────────────────────────────────────────────────────────
pub const OWNER: u64 = 100;
pub const NEW_OWNER: u64 = 101;
pub const STRANGER: u64 = 199;
pub const VOTER_A: u64 = 201;
pub const VOTER_B: u64 = 202;
pub const VOTER_C: u64 = 203;
/// Placeholder ActorId used as bolao_program when no real BolaoCore is needed.
pub const MOCK_BOLAO: u64 = 300;

pub fn actor(id: u64) -> ActorId {
    id.into()
}

pub struct Fixture {
    pub env: GtestEnv,
    pub program: Actor<DaoProgram, GtestEnv>,
}

impl Fixture {
    pub async fn new() -> Self {
        let system = System::new();
        system.init_logger();

        for id in [
            OWNER, NEW_OWNER, STRANGER, VOTER_A, VOTER_B, VOTER_C, MOCK_BOLAO,
        ] {
            system.mint_to(id, 10_000_000_000_000_000);
        }

        let code_id = system.submit_code(WASM_BINARY);
        let env = GtestEnv::new(system, actor(OWNER));

        let program = env
            .deploy::<DaoProgram>(code_id, b"dao-salt".to_vec())
            .new(actor(MOCK_BOLAO))
            .await
            .unwrap();

        Fixture { env, program }
    }

    /// Returns an Actor whose signing key is `id`.
    pub fn as_actor(&self, id: u64) -> Actor<DaoProgram, GtestEnv> {
        let env = self.env.clone().with_actor_id(id.into());
        Actor::new(env, self.program.id())
    }

    /// Advance the simulated block clock.
    /// 1 block = 1 000 ms in gtest. 24 h = 86 400 blocks.
    pub fn spend_blocks(&self, blocks: u32) {
        self.env.system().run_scheduled_tasks(blocks);
    }
}
