/// Default quorum: 20% of total voters must participate for a proposal to be valid.
pub const DEFAULT_QUORUM_BPS: u16 = 2_000;

/// Default voting period: 24 hours in milliseconds.
pub const DEFAULT_VOTING_PERIOD_MS: u64 = 86_400_000;

/// Gas reserved for initialising a new BolaoCore instance via the factory.
/// Adjust upward if BolaoCore's init message grows.
pub const DEFAULT_BOLAO_DEPLOY_GAS: u64 = 10_000_000_000;

/// Maximum UTF-8 byte length for a proposal description.
pub const MAX_DESCRIPTION_LEN: usize = 512;
