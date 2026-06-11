"""
SmartCup League — FastAPI application entry point.

Startup sequence:
1. Load settings (validates all required env vars immediately)
2. Create Supabase client
3. Instantiate PriceService + LeaderboardService singletons
4. Override FastAPI dependencies so all routes receive the same singletons
5. Register exception handlers
6. Mount CORS middleware
7. Include API router
"""
import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.api.v1.endpoints.leaderboard import _get_leaderboard_service as _get_lb_svc_leaderboard
from app.api.v1.endpoints.prices import _get_price_service
from app.api.v1.endpoints.profiles import _get_profile_repository
from app.api.v1.endpoints.stats import _get_leaderboard_service as _get_lb_svc_stats
from app.core.config import get_settings
from app.core.dependencies import get_supabase
from app.core.exceptions import (
    PriceFetchError,
    PriceUnavailableError,
    price_fetch_error_handler,
    price_unavailable_handler,
)
from app.repositories.leaderboard_repository import LeaderboardRepository
from app.repositories.price_repository import PriceRepository
from app.repositories.profile_repository import ProfileRepository
from app.services.leaderboard_service import LeaderboardService
from app.services.price_service import PriceService

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """
    Runs once at startup and once at shutdown.
    Creates long-lived singletons stored on app.state.
    """
    settings = get_settings()
    logger.info("Starting %s v%s", settings.APP_NAME, settings.APP_VERSION)

    supabase = get_supabase(settings)

    # ── Price service ──────────────────────────────────────────────────────
    price_repo = PriceRepository(supabase)
    price_service = PriceService(settings=settings, repository=price_repo)
    app.state.price_service = price_service

    try:
        record = await price_service.get_vara_price()
        logger.info("Startup price warm-up: VARA = $%.6f USD", record.usd_price)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Startup price warm-up failed (non-fatal): %s", exc)

    # ── Leaderboard service ────────────────────────────────────────────────
    lb_repo = LeaderboardRepository(supabase)
    lb_service = LeaderboardService(repository=lb_repo, indexer_graphql_url=settings.INDEXER_GRAPHQL_URL)
    app.state.leaderboard_service = lb_service
    logger.info("LeaderboardService ready")

    # ── Profile repository ─────────────────────────────────────────────────
    profile_repo = ProfileRepository(supabase)
    app.state.profile_repository = profile_repo
    logger.info("ProfileRepository ready")

    yield

    logger.info("Shutting down %s", settings.APP_NAME)


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title=settings.APP_NAME,
        version=settings.APP_VERSION,
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
        lifespan=lifespan,
    )

    # ── CORS ──────────────────────────────────────────────────────────────
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins_list,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "OPTIONS"],
        allow_headers=["*"],
    )

    # ── Exception handlers ────────────────────────────────────────────────
    app.add_exception_handler(PriceFetchError, price_fetch_error_handler)
    app.add_exception_handler(PriceUnavailableError, price_unavailable_handler)

    # ── Dependency overrides: inject singletons from app.state ────────────
    def _price_service_from_state(request: Request) -> PriceService:
        return request.app.state.price_service

    def _lb_service_from_state(request: Request) -> LeaderboardService:
        return request.app.state.leaderboard_service

    def _profile_repo_from_state(request: Request) -> ProfileRepository:
        return request.app.state.profile_repository

    app.dependency_overrides[_get_price_service] = _price_service_from_state
    app.dependency_overrides[_get_lb_svc_stats] = _lb_service_from_state
    app.dependency_overrides[_get_lb_svc_leaderboard] = _lb_service_from_state
    app.dependency_overrides[_get_profile_repository] = _profile_repo_from_state

    # ── Routes ────────────────────────────────────────────────────────────
    app.include_router(api_router)

    return app


app = create_app()
