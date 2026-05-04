
import logging

from app.repositories.leaderboard_repository import LeaderboardRepository
from app.schemas.leaderboard import (
    LeaderboardEntry,
    MatchPoolStats,
)

logger = logging.getLogger(__name__)

_ZERO = "0"


def _safe_str(val) -> str:
    """Convert a DB numeric value to string, default '0'."""
    if val is None:
        return _ZERO
    return str(int(val))


class LeaderboardService:
    def __init__(self, repository: LeaderboardRepository) -> None:
        self._repo = repository

    # ── Commands ──────────────────────────────────────────────────────────────

    async def record_bet(
        self,
        wallet_address: str,
        match_id: str,
        amount_planck: str,
        predicted_outcome: str,
    ) -> tuple[bool, str]:
        """
        Record a bet placement.
        Returns (success: bool, message: str).
        """
        wallet = wallet_address.strip().lower()
        if not wallet:
            return False, "wallet_address is required"

        ok = await self._repo.record_bet(wallet, match_id, amount_planck, predicted_outcome)
        if ok:
            logger.info("Bet recorded wallet=%s match=%s outcome=%s", wallet, match_id, predicted_outcome)
            return True, "Bet recorded"
        return False, "Already recorded or DB error (idempotent)"

    async def record_claim(
        self,
        wallet_address: str,
        match_id: str,
        amount_planck: str,
        is_exact: bool,
    ) -> tuple[bool, str]:
        """
        Record a reward claim.
        Returns (success: bool, message: str).
        """
        wallet = wallet_address.strip().lower()
        if not wallet:
            return False, "wallet_address is required"

        ok = await self._repo.record_claim(wallet, match_id, amount_planck, is_exact)
        if ok:
            logger.info("Claim recorded wallet=%s match=%s amount=%s exact=%s", wallet, match_id, amount_planck, is_exact)
            return True, "Claim recorded"
        return False, "Already recorded or DB error (idempotent)"

    # ── Queries ───────────────────────────────────────────────────────────────

    async def get_leaderboard(self, limit: int = 500) -> list[LeaderboardEntry]:
        rows = await self._repo.get_leaderboard(limit=limit)
        result: list[LeaderboardEntry] = []
        for row in rows:
            try:
                result.append(
                    LeaderboardEntry(
                        wallet_address=str(row.get("wallet_address", "")),
                        matches_count=int(row.get("matches_count") or 0),
                        exact_count=int(row.get("exact_count") or 0),
                        total_claimed_planck=_safe_str(row.get("total_claimed_planck")),
                        updated_at=row.get("updated_at"),
                    )
                )
            except Exception as exc:
                logger.warning("Skipping malformed leaderboard row: %s — %s", row, exc)
        return result

    async def get_pool_stats(self, match_id: str) -> MatchPoolStats | None:
        row = await self._repo.get_pool_stats(match_id)
        if not row:
            return None
        return self._map_pool_row(row)

    async def get_all_pool_stats(self) -> list[MatchPoolStats]:
        rows = await self._repo.get_all_pool_stats()
        result: list[MatchPoolStats] = []
        for row in rows:
            try:
                result.append(self._map_pool_row(row))
            except Exception as exc:
                logger.warning("Skipping malformed pool row: %s — %s", row, exc)
        return result

    # ── Helpers ───────────────────────────────────────────────────────────────

    @staticmethod
    def _map_pool_row(row: dict) -> MatchPoolStats:
        return MatchPoolStats(
            match_id=str(row.get("match_id", "")),
            home_bets=int(row.get("home_bets") or 0),
            draw_bets=int(row.get("draw_bets") or 0),
            away_bets=int(row.get("away_bets") or 0),
            home_planck=_safe_str(row.get("home_planck")),
            draw_planck=_safe_str(row.get("draw_planck")),
            away_planck=_safe_str(row.get("away_planck")),
            total_bets=int(row.get("total_bets") or 0),
            total_planck=_safe_str(row.get("total_planck")),
        )
