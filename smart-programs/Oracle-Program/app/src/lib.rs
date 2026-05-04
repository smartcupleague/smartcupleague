#![no_std]

use sails_rs::{cell::RefCell, prelude::*};
pub mod services;

use services::service::Service;
use services::state::OracleState;

pub struct Program {
    state: RefCell<OracleState>,
}

#[program]
impl Program {
    pub fn new(admin: ActorId) -> Self {
        // Constructors must return Self and cannot propagate Result on Gear.
        // Panic here is the correct fail-fast pattern: a zero-address admin
        // would permanently brick the oracle with no recovery path.
        assert!(admin != ActorId::zero(), "admin cannot be the zero address");
        Self {
            state: RefCell::new(OracleState::new(admin)),
        }
    }

    pub fn service(&self) -> Service<'_> {
        Service::new(&self.state)
    }
}
