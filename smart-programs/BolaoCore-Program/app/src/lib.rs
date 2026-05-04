
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

    pub fn service(&self) -> Service {
        Service::new()
    }
}
