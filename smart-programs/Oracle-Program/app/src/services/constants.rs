/// Default number of matching feeder submissions required to auto-finalize a result.
/// Configurable at runtime by the admin via `set_consensus_threshold`.
pub const DEFAULT_CONSENSUS_THRESHOLD: u8 = 2;

/// Maximum number of authorized feeders — prevents unbounded HashMap growth.
pub const MAX_FEEDERS: usize = 20;

/// Maximum match_id accepted — prevents unbounded state growth.
pub const MAX_MATCH_ID: u64 = 10_000;
