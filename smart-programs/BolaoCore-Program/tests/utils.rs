pub const ONE_VARA: u128 = 1_000_000_000_000;
pub const MIN_BET: u128 = 3 * ONE_VARA; // mirrors MIN_BET_PLANCK in constants.rs
pub const BET_5_VARA: u128 = 5 * ONE_VARA;
pub const BET_10_VARA: u128 = 10 * ONE_VARA;

/// Far-future kick-off time. gtest uses the real Unix timestamp in milliseconds
/// (currently ~1.75 × 10¹²), so KICK_OFF must exceed that. Using year ~2286.
pub const KICK_OFF: u64 = 9_999_999_999_999;

pub const GROUP_PHASE: &str = "Group Stage";
pub const KNOCKOUT_PHASE: &str = "Round of 16";
pub const HOME_TEAM: &str = "Brazil";
pub const AWAY_TEAM: &str = "Germany";

/// Blocks to advance to expire the 24h optimistic challenge window.
/// gtest runs at 1 block = 1 000 ms, so 24 h = 86 400 blocks.
pub const CHALLENGE_WINDOW_BLOCKS: u32 = 86_400;

/// Blocks to advance to expire the 72h claim deadline.
/// 72 h = 259 200 blocks at 1 block/s.
pub const CLAIM_DEADLINE_BLOCKS: u32 = 259_200;
