use oracle_program::{
    client::{OracleCtors, OracleProgram},
    WASM_BINARY,
};
use sails_rs::{
    client::{Actor, GearEnv, GtestEnv},
    gtest::System,
    prelude::*,
};

pub const ADMIN: u64 = 100;
pub const NEW_ADMIN: u64 = 101;
pub const OPERATOR: u64 = 102;
pub const STRANGER: u64 = 199;
/// Feeders are FEEDER_BASE + 1 .. FEEDER_BASE + N
pub const FEEDER_BASE: u64 = 200;

pub fn actor(id: u64) -> ActorId {
    id.into()
}

pub struct Fixture {
    pub env: GtestEnv,
    pub oracle: Actor<OracleProgram, GtestEnv>,
}

impl Fixture {
    pub async fn new() -> Self {
        let system = System::new();
        system.init_logger();

        for id in [ADMIN, NEW_ADMIN, OPERATOR, STRANGER] {
            system.mint_to(id, 100_000_000_000_000);
        }
        for n in 1..=21_u64 {
            system.mint_to(FEEDER_BASE + n, 100_000_000_000_000);
        }

        let code_id = system.submit_code(WASM_BINARY);
        let env = GtestEnv::new(system, actor(ADMIN));

        let oracle = env
            .deploy::<OracleProgram>(code_id, b"oracle-salt".to_vec())
            .new(actor(ADMIN))
            .await
            .unwrap();

        Fixture { env, oracle }
    }

    /// Returns an oracle Actor with the signer set to `id`.
    pub fn as_actor(&self, id: u64) -> Actor<OracleProgram, GtestEnv> {
        let env = self.env.clone().with_actor_id(id.into());
        Actor::new(env, self.oracle.id())
    }
}
