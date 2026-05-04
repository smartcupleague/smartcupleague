from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse


class PriceFetchError(Exception):
    """Raised when CoinGecko cannot be reached or returns unexpected data."""


class PriceUnavailableError(Exception):
    """Raised when no price data is available (no cache, no DB, no live)."""


# ── FastAPI exception handlers ─────────────────────────────────────────────

async def price_fetch_error_handler(
    request: Request, exc: PriceFetchError
) -> JSONResponse:
    return JSONResponse(
        status_code=502,
        content={"detail": f"Upstream price service error: {exc}"},
    )


async def price_unavailable_handler(
    request: Request, exc: PriceUnavailableError
) -> JSONResponse:
    return JSONResponse(
        status_code=503,
        content={"detail": "Price data is temporarily unavailable. Try again shortly."},
    )
