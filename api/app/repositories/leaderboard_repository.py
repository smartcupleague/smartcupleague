
import logging
from typing import Optional

from supabase import Client

logger = logging.getLogger(__name__)


class LeaderboardRepository:
    def __init__(self, supabase: Client) -> None:
        self._db = supabase

    # ── Write: prediction_events ──────────────────────────────────────────────

    async def record_bet(
        self,
        wallet_address: str,
        match_id: str,
        amount_planck: str,
        predicted_outcome: str,
    ) -> bool:
        """
        Insert a prediction event.
        Returns True on success, False if already recorded (duplicate) or error.
        Idempotent: duplicate (wallet, match_id) is silently ignored.
        """
        try:
            self._db.table("prediction_events").upsert(
                {
                    "wallet_address": wallet_address.lower(),
                    "match_id": str(match_id),
                    "amount_planck": int(amount_planck or "0"),
                    "predicted_outcome": predicted_outcome,
                },
                on_conflict="wallet_address,match_id",
                ignore_duplicates=True,
            ).execute()
            return True
        except Exception as exc:
            logger.error("record_bet failed wallet=%s match=%s: %s", wallet_address, match_id, exc)
            return False

    # ── Write: claim_events ───────────────────────────────────────────────────

    async def record_claim(
        self,
        wallet_address: str,
        match_id: str,
        amount_planck: str,
        is_exact: bool,
    ) -> bool:
        """
        Insert a claim event.
        Idempotent: duplicate (wallet, match_id) is silently ignored.
        """
        try:
            self._db.table("claim_events").upsert(
                {
                    "wallet_address": wallet_address.lower(),
                    "match_id": str(match_id),
                    "amount_planck": int(amount_planck or "0"),
                    "is_exact": is_exact,
                },
                on_conflict="wallet_address,match_id",
                ignore_duplicates=True,
            ).execute()
            return True
        except Exception as exc:
            logger.error("record_claim failed wallet=%s match=%s: %s", wallet_address, match_id, exc)
            return False

    # ── Read: user_leaderboard_stats (view) ───────────────────────────────────

    async def get_leaderboard(self, limit: int = 500) -> list[dict]:
        """Return all rows from the user_leaderboard_stats view."""
        try:
            res = (
                self._db.table("user_leaderboard_stats")
                .select("*")
                .order("total_claimed_planck", desc=True)
                .limit(limit)
                .execute()
            )
            return res.data or []
        except Exception as exc:
            logger.error("get_leaderboard failed: %s", exc)
            return []

    # ── Read: match_pool_stats (view) ─────────────────────────────────────────

    async def get_pool_stats(self, match_id: str) -> Optional[dict]:
        """Return pool distribution for a single match."""
        try:
            res = (
                self._db.table("match_pool_stats")
                .select("*")
                .eq("match_id", str(match_id))
                .limit(1)
                .execute()
            )
            rows = res.data or []
            return rows[0] if rows else None
        except Exception as exc:
            logger.error("get_pool_stats failed match=%s: %s", match_id, exc)
            return None

    async def get_all_pool_stats(self) -> list[dict]:
        """Return pool distribution for all matches."""
        try:
            res = (
                self._db.table("match_pool_stats")
                .select("*")
                .order("match_id")
                .execute()
            )
            return res.data or []
        except Exception as exc:
            logger.error("get_all_pool_stats failed: %s", exc)
            return []
