"""
Price endpoints — /api/v1/prices
"""
from datetime import timezone
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.core.config import Settings, get_settings
from app.schemas.prices import PriceHistoryResponse, VaraPriceResponse
from app.services.price_service import PriceService

router = APIRouter(prefix="/prices", tags=["prices"])


def _get_price_service(
    settings: Annotated[Settings, Depends(get_settings)],
) -> PriceService:
    """
    Resolves PriceService from the app state injected at startup.
    The instance lives on app.state so the in-memory cache persists
    across requests.
    """
    from fastapi import Request

    # We import Request lazily to avoid a circular import at module level
    # The service is stored on app.state by the lifespan handler in main.py
    raise NotImplementedError("Override this with app.state injection")


# The actual dependency is patched in main.py via app.dependency_overrides
# to inject the singleton PriceService from app.state.


@router.get(
    "/vara",
    response_model=VaraPriceResponse,
    summary="Get current VARA/USD price",
    description=(
        "Returns the current VARA token price in USD. "
        "Data is sourced from CoinGecko and cached for "
        f"the configured TTL (default 5 minutes). "
        "Falls back to the last database record if CoinGecko is unreachable."
    ),
)
async def get_vara_price(
    price_service: Annotated[PriceService, Depends(_get_price_service)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> VaraPriceResponse:
    record = await price_service.get_vara_price()
    return VaraPriceResponse(
        token="VARA",
        usd=record.usd_price,
        source=record.source,
        fetched_at=record.fetched_at,
        cache_ttl_seconds=settings.PRICE_CACHE_TTL_SECONDS,
    )


@router.get(
    "/vara/history",
    response_model=PriceHistoryResponse,
    summary="Get VARA price history",
    description="Returns historical VARA/USD price snapshots stored in Supabase.",
)
async def get_vara_price_history(
    price_service: Annotated[PriceService, Depends(_get_price_service)],
    limit: int = Query(default=100, ge=1, le=1000, description="Max records to return"),
) -> PriceHistoryResponse:
    records = await price_service.get_price_history(limit=limit)
    return PriceHistoryResponse(token="VARA", records=records, total=len(records))
