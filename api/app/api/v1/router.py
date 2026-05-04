from fastapi import APIRouter

from app.api.v1.endpoints import health, leaderboard, prices, profiles, stats

router = APIRouter(prefix="/v1")

router.include_router(health.router)
router.include_router(prices.router)
router.include_router(stats.router)
router.include_router(leaderboard.router)
router.include_router(profiles.router)
