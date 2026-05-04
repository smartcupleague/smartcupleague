from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator


class UpdateProfileRequest(BaseModel):
    display_name: str = Field(..., min_length=1, max_length=30, description="Display name for this wallet")

    @field_validator("display_name")
    @classmethod
    def strip_and_validate(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("display_name cannot be blank")
        return v


class WalletProfile(BaseModel):
    wallet_address: str
    display_name: Optional[str] = None
    updated_at: Optional[datetime] = None


class UpdateProfileResponse(BaseModel):
    wallet_address: str
    display_name: str
    updated_at: datetime
