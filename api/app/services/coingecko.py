import logging
from datetime import datetime, timezone

import httpx

from app.core.config import Settings
from app.core.exceptions import PriceFetchError
from app.schemas.prices import PriceSource, VaraPriceRecord

logger = logging.getLogger(__name__)

# CoinGecko free-tier rate limit: ~30 req/min
_REQUEST_TIMEOUT_SECONDS = 10


async def fetch_vara_price(settings: Settings) -> VaraPriceRecord:
    """
    Calls CoinGecko simple/price endpoint and returns a VaraPriceRecord.
    Raises PriceFetchError on any failure.
    """
    url = f"{settings.COINGECKO_BASE_URL}/simple/price"
    params = {
        "ids": settings.VARA_TOKEN_ID,
        "vs_currencies": "usd",
    }
    headers: dict[str, str] = {"Accept": "application/json"}

    # Pro API key — only sent if configured
    if settings.COINGECKO_API_KEY:
        headers["x-cg-pro-api-key"] = settings.COINGECKO_API_KEY

    logger.info("Fetching VARA price from CoinGecko [token=%s]", settings.VARA_TOKEN_ID)

    try:
        async with httpx.AsyncClient(timeout=_REQUEST_TIMEOUT_SECONDS) as client:
            response = await client.get(url, params=params, headers=headers)
            response.raise_for_status()
    except httpx.TimeoutException as exc:
        raise PriceFetchError(f"CoinGecko request timed out: {exc}") from exc
    except httpx.HTTPStatusError as exc:
        raise PriceFetchError(
            f"CoinGecko returned HTTP {exc.response.status_code}"
        ) from exc
    except httpx.RequestError as exc:
        raise PriceFetchError(f"Network error reaching CoinGecko: {exc}") from exc

    payload = response.json()

    try:
        usd_price: float = payload[settings.VARA_TOKEN_ID]["usd"]
    except (KeyError, TypeError) as exc:
        raise PriceFetchError(
            f"Unexpected CoinGecko response shape: {payload}"
        ) from exc

    logger.info("VARA price fetched: $%.6f USD", usd_price)

    return VaraPriceRecord(
        usd_price=usd_price,
        source=PriceSource.COINGECKO,
        fetched_at=datetime.now(tz=timezone.utc),
    )
