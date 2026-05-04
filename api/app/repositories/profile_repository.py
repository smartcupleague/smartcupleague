import logging
from typing import Optional

from supabase import Client

logger = logging.getLogger(__name__)


class ProfileRepository:
    def __init__(self, supabase: Client) -> None:
        self._db = supabase

    async def get_profile(self, wallet_address: str) -> Optional[dict]:
        try:
            res = (
                self._db.table("wallet_profiles")
                .select("wallet_address, display_name, updated_at")
                .eq("wallet_address", wallet_address.lower())
                .limit(1)
                .execute()
            )
            rows = res.data or []
            return rows[0] if rows else None
        except Exception as exc:
            logger.error("get_profile failed wallet=%s: %s", wallet_address, exc)
            return None

    async def upsert_profile(self, wallet_address: str, display_name: str) -> Optional[dict]:
        try:
            res = (
                self._db.table("wallet_profiles")
                .upsert(
                    {
                        "wallet_address": wallet_address.lower(),
                        "display_name": display_name,
                        "updated_at": "now()",
                    },
                    on_conflict="wallet_address",
                )
                .execute()
            )
            rows = res.data or []
            return rows[0] if rows else None
        except Exception as exc:
            logger.error("upsert_profile failed wallet=%s: %s", wallet_address, exc)
            return None
