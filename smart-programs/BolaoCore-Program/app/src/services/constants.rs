pub const PROTOCOL_FEE_BPS: u128 = 500; // 5%
pub const FINAL_PRIZE_BPS: u128 = 1_000; // 10%
pub const BPS_DENOMINATOR: u128 = 10_000;
pub const BET_CLOSE_WINDOW_SECONDS: u64 = 600; // 10 minutes
pub const FINAL_PRIZE_TOP5_BPS: [u128; 5] = [4_500, 2_500, 1_500, 1_000, 500];

// ── Security constants ────────────────────────────────────────────────────────

/// Minimum bet: 3 VARA expressed in planck (10^12 per VARA).
pub const MIN_BET_PLANCK: u128 = 3_000_000_000_000;

/// Maximum byte length for phase names to prevent memory bloat. 
pub const MAX_PHASE_NAME_LEN: usize = 64;

/// Maximum points_weight per phase to prevent u32 saturation in the leaderboard. 
pub const MAX_POINTS_WEIGHT: u32 = 20;

/// Maximum byte length for team and pick names to prevent storage bloat and gas DoS.
pub const MAX_TEAM_NAME_LEN: usize = 50;

/// Optimistic execution: window during which admin can cancel an oracle proposal.
pub const CHALLENGE_WINDOW_MS: u64 = 120_000; //2 minutos // 86_400_000; = 24 hours // 4 hours(Final)

/// Claim window: time winners have to claim their match reward after finalization.
pub const CLAIM_DEADLINE_MS: u64 = 240_000; //4 minutos // 259_200_000;= 72 hours // 48 hours(Final)
