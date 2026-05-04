
from typing import Annotated

from fastapi import APIRouter, Depends, Request

from app.schemas.leaderboard import (
    AllMatchPoolsResponse,
    MatchPoolStats,
    RecordBetRequest,
    RecordBetResponse,
    RecordClaimRequest,
    RecordClaimResponse,
)
from app.services.leaderboard_service import LeaderboardService

router = APIRouter(prefix="/stats", tags=["stats"])


def _get_leaderboard_service(request: Request) -> LeaderboardService:
    raise NotImplementedError("Override via app.dependency_overrides")


@router.post(
    "/record-bet",
    response_model=RecordBetResponse,
    summary="Record a bet placement",
    description=(
        "Called by the frontend immediately after a successful placeBet transaction. "
        "Idempotent — duplicate calls for the same wallet+match are silently ignored."
    ),
)
async def record_bet(
    body: RecordBetRequest,
    svc: Annotated[LeaderboardService, Depends(_get_leaderboard_service)],
) -> RecordBetResponse:
    ok, msg = await svc.record_bet(
        wallet_address=body.wallet_address,
        match_id=body.match_id,
        amount_planck=body.amount_planck,
        predicted_outcome=body.predicted_outcome.value,
    )
    return RecordBetResponse(
        recorded=ok,
        wallet_address=body.wallet_address,
        match_id=body.match_id,
        message=msg,
    )


@router.post(
    "/record-claim",
    response_model=RecordClaimResponse,
    summary="Record a reward claim",
    description=(
        "Called by the frontend immediately after a successful claimMatchReward transaction. "
        "amount_planck is the balance delta observed on-chain. "
        "Idempotent — duplicate calls for the same wallet+match are silently ignored."
    ),
)
async def record_claim(
    body: RecordClaimRequest,
    svc: Annotated[LeaderboardService, Depends(_get_leaderboard_service)],
) -> RecordClaimResponse:
    ok, msg = await svc.record_claim(
        wallet_address=body.wallet_address,
        match_id=body.match_id,
        amount_planck=body.amount_planck,
        is_exact=body.is_exact,
    )
    return RecordClaimResponse(
        recorded=ok,
        wallet_address=body.wallet_address,
        match_id=body.match_id,
        message=msg,
    )


@router.get(
    "/pools",
    response_model=AllMatchPoolsResponse,
    summary="Get pool distribution for all matches",
    description="Returns home/draw/away bet distribution for every match that has at least one prediction recorded.",
)
async def get_all_pools(
    svc: Annotated[LeaderboardService, Depends(_get_leaderboard_service)],
) -> AllMatchPoolsResponse:
    pools = await svc.get_all_pool_stats()
    return AllMatchPoolsResponse(pools=pools, total=len(pools))


@router.get(
    "/pools/{match_id}",
    response_model=MatchPoolStats,
    summary="Get pool distribution for a single match",
)
async def get_pool(
    match_id: str,
    svc: Annotated[LeaderboardService, Depends(_get_leaderboard_service)],
) -> MatchPoolStats:
    pool = await svc.get_pool_stats(match_id)
    if pool is None:
        # Return a zeroed record instead of 404 — UI handles "no data" gracefully
        return MatchPoolStats(
            match_id=match_id,
            home_bets=0, draw_bets=0, away_bets=0,
            home_planck="0", draw_planck="0", away_planck="0",
            total_bets=0, total_planck="0",
        )
    return pool
