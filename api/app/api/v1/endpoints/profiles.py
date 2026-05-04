"""
Profiles endpoint — /api/v1/profiles
Allows wallets to set and retrieve a display name.
Authentication is implicit: the frontend only sends requests for the connected wallet.
"""
from fastapi import APIRouter, Depends, HTTPException, Request

from app.repositories.profile_repository import ProfileRepository
from app.schemas.profiles import UpdateProfileRequest, UpdateProfileResponse, WalletProfile

router = APIRouter(prefix="/profiles", tags=["profiles"])


def _get_profile_repository(request: Request) -> ProfileRepository:
    raise NotImplementedError("Override via app.dependency_overrides")


@router.get(
    "/{wallet_address}",
    response_model=WalletProfile,
    summary="Get wallet profile",
    description="Returns the display name for a wallet address, or null if none is set.",
)
async def get_profile(
    wallet_address: str,
    repo: ProfileRepository = Depends(_get_profile_repository),
) -> WalletProfile:
    row = await repo.get_profile(wallet_address)
    if row is None:
        return WalletProfile(wallet_address=wallet_address.lower())
    return WalletProfile(**row)


@router.put(
    "/{wallet_address}",
    response_model=UpdateProfileResponse,
    summary="Set wallet display name",
    description=(
        "Creates or updates the display name for a wallet. "
        "The frontend must only call this for the currently connected wallet."
    ),
)
async def update_profile(
    wallet_address: str,
    body: UpdateProfileRequest,
    repo: ProfileRepository = Depends(_get_profile_repository),
) -> UpdateProfileResponse:
    row = await repo.upsert_profile(wallet_address, body.display_name)
    if row is None:
        raise HTTPException(status_code=500, detail="Failed to save profile")
    return UpdateProfileResponse(**row)
