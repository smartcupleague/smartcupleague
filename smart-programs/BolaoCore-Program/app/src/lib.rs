#![no_std]

use sails_rs::prelude::*;
pub mod services;

use services::service::Service;

pub struct Program;

#[program]
impl Program {
    pub fn new(admin: ActorId, treasury: ActorId) -> Self {
        Service::seed(admin, treasury);
        Self
    }

    /// Deploy in importer mode: migration_sealed=false.
    /// All user-facing writes are blocked until seal_migration() is called.
    pub fn new_as_importer(admin: ActorId, treasury: ActorId) -> Self {
        Service::seed_as_importer(admin, treasury);
        Self
    }

    pub fn service(&self) -> Service {
        Service::new()
    }
}
