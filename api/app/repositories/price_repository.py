
import logging

from supabase import Client

from app.schemas.prices import PriceSource, VaraPriceRecord

logger = logging.getLogger(__name__)

_TABLE = "vara_prices"


class PriceRepository:
    def __init__(self, client: Client) -> None:
        self._db = client

    async def save(self, record: VaraPriceRecord) -> None:
        """Persist a price snapshot. Errors are logged, not raised."""
        try:
            self._db.table(_TABLE).insert({
                "usd_price": record.usd_price,
                "source": record.source.value,
                "fetched_at": record.fetched_at.isoformat(),
            }).execute()
            logger.debug("Price persisted to Supabase: $%.6f", record.usd_price)
        except Exception as exc:  # noqa: BLE001
            # Non-fatal — the app works without DB writes
            logger.error("Failed to persist price to Supabase: %s", exc)

    async def get_latest(self) -> VaraPriceRecord | None:
        """Return the most recently stored price, or None."""
        try:
            result = (
                self._db.table(_TABLE)
                .select("usd_price, source, fetched_at")
                .order("fetched_at", desc=True)
                .limit(1)
                .execute()
            )
            rows = result.data
            if not rows:
                return None
            row = rows[0]
            return VaraPriceRecord(
                usd_price=float(row["usd_price"]),
                source=PriceSource(row["source"]),
                fetched_at=row["fetched_at"],
            )
        except Exception as exc:  # noqa: BLE001
            logger.error("Failed to read latest price from Supabase: %s", exc)
            return None

    async def get_history(self, limit: int = 100) -> list[VaraPriceRecord]:
        """Return the last `limit` price records ordered newest-first."""
        try:
            result = (
                self._db.table(_TABLE)
                .select("usd_price, source, fetched_at")
                .order("fetched_at", desc=True)
                .limit(limit)
                .execute()
            )
            return [
                VaraPriceRecord(
                    usd_price=float(r["usd_price"]),
                    source=PriceSource(r["source"]),
                    fetched_at=r["fetched_at"],
                )
                for r in result.data
            ]
        except Exception as exc:  # noqa: BLE001
            logger.error("Failed to read price history from Supabase: %s", exc)
            return []
