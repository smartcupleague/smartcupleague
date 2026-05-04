"""
Leaderboard endpoint — /api/v1/leaderboard
"""
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request

from app.schemas.leaderboard import LeaderboardResponse
from app.services.leaderboard_service import LeaderboardService

router = APIRouter(prefix="/leaderboard", tags=["leaderboard"])


def _get_leaderboard_service(request: Request) -> LeaderboardService:
    raise NotImplementedError("Override via app.dependency_overrides")


@router.get(
    "",
    response_model=LeaderboardResponse,
    summary="Get global leaderboard",
    description=(
        "Returns per-wallet stats: matches predicted, exact score predictions, "
        "and total VARA claimed (in planck units). "
        "Sort by total_claimed_planck desc. Points come from the on-chain contract."
    ),
)
async def get_leaderboard(
    svc: Annotated[LeaderboardService, Depends(_get_leaderboard_service)],
    limit: int = Query(default=500, ge=1, le=2000, description="Max rows to return"),
) -> LeaderboardResponse:
    rows = await svc.get_leaderboard(limit=limit)
    return LeaderboardResponse(rows=rows, total=len(rows))
