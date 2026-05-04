#![no_std]

use sails_rs::prelude::*;
pub mod services;

use services::service::Service;

pub struct Program;

#[program]
impl Program {
    /// Initialise the DAO.
    ///
    /// `bolao_program` — The BolaoCore program that governance proposals will
    /// dispatch to by default. Can be updated later via set_bolao_program() or
    /// a SetDefaultBolao governance proposal.
    pub fn new(bolao_program: ActorId) -> Self {
        Service::seed(bolao_program);
        Self
    }

    pub fn service(&self) -> Service {
        Service::new()
    }
}
