from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field


class PriceSource(str, Enum):
    COINGECKO = "coingecko"
    CACHE = "cache"
    DATABASE = "database"
    MANUAL = "manual"


class VaraPriceResponse(BaseModel):
    """Public price response returned by the API."""

    token: str = Field(default="VARA", description="Token symbol")
    usd: float = Field(description="Current price in USD")
    source: PriceSource = Field(description="Where this price was fetched from")
    fetched_at: datetime = Field(description="When this price was obtained")
    cache_ttl_seconds: int = Field(
        description="Seconds until this price may be stale",
        ge=0,
    )

    model_config = {"json_schema_extra": {"example": {
        "token": "VARA",
        "usd": 0.0312,
        "source": "coingecko",
        "fetched_at": "2026-04-01T12:00:00Z",
        "cache_ttl_seconds": 300,
    }}}


class VaraPriceRecord(BaseModel):
    """Internal model for DB persistence."""

    usd_price: float
    source: PriceSource
    fetched_at: datetime


class PriceHistoryResponse(BaseModel):
    """List of historical price snapshots."""

    token: str = "VARA"
    records: list[VaraPriceRecord]
    total: int
