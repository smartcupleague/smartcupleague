
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone

from app.core.config import Settings
from app.core.exceptions import PriceFetchError, PriceUnavailableError
from app.repositories.price_repository import PriceRepository
from app.schemas.prices import PriceSource, VaraPriceRecord
from app.services.coingecko import fetch_vara_price

logger = logging.getLogger(__name__)


@dataclass
class _CacheEntry:
    record: VaraPriceRecord
    cached_at: datetime = field(default_factory=lambda: datetime.now(tz=timezone.utc))


class PriceService:
    """
    Stateful service — one instance per app lifetime (created in lifespan).
    Inject via Depends(get_price_service).
    """

    def __init__(self, settings: Settings, repository: PriceRepository) -> None:
        self._settings = settings
        self._repo = repository
        self._cache: _CacheEntry | None = None

    # ── Public API ────────────────────────────────────────────────────────

    async def get_vara_price(self) -> VaraPriceRecord:
        """
        Returns the current VARA/USD price.
        Tries live → DB → stale cache, in that order.
        """
        if self._is_cache_fresh():
            logger.debug("Serving VARA price from in-memory cache")
            assert self._cache is not None
            return VaraPriceRecord(
                usd_price=self._cache.record.usd_price,
                source=PriceSource.CACHE,
                fetched_at=self._cache.record.fetched_at,
            )

        # Attempt live fetch
        try:
            record = await fetch_vara_price(self._settings)
            self._set_cache(record)
            await self._repo.save(record)          # fire-and-forget persistence
            return record
        except PriceFetchError as exc:
            logger.warning("CoinGecko fetch failed: %s — falling back to DB", exc)

        # Fallback: last known price from Supabase
        db_record = await self._repo.get_latest()
        if db_record:
            logger.info("Serving VARA price from Supabase (stale fallback)")
            stale = VaraPriceRecord(
                usd_price=db_record.usd_price,
                source=PriceSource.DATABASE,
                fetched_at=db_record.fetched_at,
            )
            self._set_cache(stale)
            return stale

        # Last resort: stale in-memory cache (even if expired)
        if self._cache:
            logger.warning("Serving expired in-memory cache as last resort")
            return VaraPriceRecord(
                usd_price=self._cache.record.usd_price,
                source=PriceSource.CACHE,
                fetched_at=self._cache.record.fetched_at,
            )

        raise PriceUnavailableError("No price data available from any source")

    async def get_price_history(self, limit: int = 100) -> list[VaraPriceRecord]:
        return await self._repo.get_history(limit=limit)

    # ── Internal helpers ──────────────────────────────────────────────────

    def _is_cache_fresh(self) -> bool:
        if not self._cache:
            return False
        age = (datetime.now(tz=timezone.utc) - self._cache.cached_at).total_seconds()
        return age < self._settings.PRICE_CACHE_TTL_SECONDS

    def _set_cache(self, record: VaraPriceRecord) -> None:
        self._cache = _CacheEntry(record=record)
