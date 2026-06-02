use sails_rs::prelude::*;

#[derive(Debug, Clone, Encode, Decode, TypeInfo, PartialEq, Eq)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub struct FinalPrizeClaimStatus {
    pub wallet: ActorId,
    pub final_prize_finalized: bool,
    pub eligible: bool,
    pub amount_claimable: u128,
    pub already_claimed: bool,
    pub points: u32,
}

#[derive(Debug, Clone, Copy, Encode, Decode, TypeInfo, PartialEq, Eq)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub struct Score {
    pub home: u8,
    pub away: u8,
}

#[derive(Debug, Clone, Copy, Encode, Decode, TypeInfo, PartialEq, Eq)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub enum PenaltyWinner {
    Home,
    Away,
}

#[derive(Debug, Clone, Encode, Decode, TypeInfo, PartialEq, Eq)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub enum ResultStatus {
    Unresolved,
    Proposed {
        score: Score,
        penalty_winner: Option<PenaltyWinner>,
        oracle: ActorId,
        proposed_at: u64,
    },
    Finalized {
        score: Score,
        penalty_winner: Option<PenaltyWinner>,
    },
    Cancelled,
}

#[derive(Debug, Clone, Encode, Decode, TypeInfo, PartialEq, Eq)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub struct WalletClaimStatus {
    pub wallet: ActorId,
    pub amount_claimable: u128,
    pub already_claimed: bool,
}

#[derive(Debug, Clone, Encode, Decode, TypeInfo)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub struct PhaseConfig {
    pub name: String,
    pub start_time: u64,
    pub end_time: u64,
    pub points_weight: u32,
}

#[derive(Debug, Clone, Encode, Decode, TypeInfo)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub struct Match {
    pub match_id: u64,
    pub phase: String,
    pub home: String,
    pub away: String,
    pub kick_off: u64,
    pub result: ResultStatus,
    pub match_prize_pool: u128,
    pub has_bets: bool,
    pub participants: Vec<ActorId>,
    pub total_winner_stake: u128,
    pub total_claimed: u128,
    pub settlement_prepared: bool,
    pub dust_swept: bool,
    pub finalized_at: Option<u64>,
}

#[derive(Debug, Clone, Encode, Decode, TypeInfo)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub struct Bet {
    pub user: ActorId,
    pub match_id: u64,
    pub score: Score,
    pub penalty_winner: Option<PenaltyWinner>,
    pub stake_in_match_pool: u128,
    pub freebet_principal: u128,
    pub claimed: bool,
}

#[derive(Debug, Clone, Encode, Decode, TypeInfo, PartialEq, Eq)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub struct UserBetRecord {
    pub match_id: u64,
    pub score: Score,
    pub penalty_winner: Option<PenaltyWinner>,
    pub stake_in_match_pool: u128,
    pub freebet_principal: u128,
}

#[derive(Debug, Clone, Encode, Decode, TypeInfo, PartialEq, Eq)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub struct UserBetView {
    pub match_id: u64,
    pub score: Score,
    pub penalty_winner: Option<PenaltyWinner>,
    pub stake_in_match_pool: u128,
    pub freebet_principal: u128,
    pub claimed: bool,
}

#[derive(Debug, Clone, Encode, Decode, TypeInfo, PartialEq, Eq)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub struct PodiumPick {
    pub champion: String,
    pub runner_up: String,
    pub third_place: String,
}

#[derive(Debug, Clone, Encode, Decode, TypeInfo, PartialEq, Eq)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub struct PodiumResult {
    pub champion: String,
    pub runner_up: String,
    pub third_place: String,
}
