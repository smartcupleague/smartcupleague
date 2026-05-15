
from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class PredictedOutcome(str, Enum):
    home = "home"
    draw = "draw"
    away = "away"


# ── Inbound (requests) ────────────────────────────────────────────────────────

class RecordBetRequest(BaseModel):
    wallet_address: str = Field(..., description="User's decoded wallet hex address")
    match_id: str = Field(..., description="Match ID from the smart contract")
    amount_planck: str = Field(default="0", description="Gross bet amount in planck (12 decimal VARA)")
    match_pool_amount_planck: Optional[str] = Field(
        default=None,
        description="85% match-pool amount used by contract payout math, in planck",
    )
    predicted_outcome: PredictedOutcome = Field(..., description="Predicted match outcome")


class RecordClaimRequest(BaseModel):
    wallet_address: str = Field(..., description="User's decoded wallet hex address")
    match_id: str = Field(..., description="Match ID from the smart contract")
    amount_planck: str = Field(default="0", description="Claimed reward amount in planck")
    is_exact: bool = Field(default=False, description="Whether the prediction was an exact score match")


# ── Outbound (responses) ──────────────────────────────────────────────────────

class RecordBetResponse(BaseModel):
    recorded: bool
    wallet_address: str
    match_id: str
    message: str


class RecordClaimResponse(BaseModel):
    recorded: bool
    wallet_address: str
    match_id: str
    message: str


class LeaderboardEntry(BaseModel):
    wallet_address: str
    display_name: Optional[str] = None
    matches_count: int
    exact_count: int
    outcome_count: int
    total_claimed_planck: str  # Large integer as string to avoid float precision loss
    updated_at: Optional[datetime] = None


class LeaderboardResponse(BaseModel):
    rows: list[LeaderboardEntry]
    total: int


class MatchPoolStats(BaseModel):
    match_id: str
    home_bets: int
    draw_bets: int
    away_bets: int
    home_planck: str
    draw_planck: str
    away_planck: str
    total_bets: int
    total_planck: str


class AllMatchPoolsResponse(BaseModel):
    pools: list[MatchPoolStats]
    total: int
