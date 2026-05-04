
from typing import Annotated

from fastapi import Depends
from supabase import Client, create_client

from app.core.config import Settings, get_settings


def get_supabase(
    settings: Annotated[Settings, Depends(get_settings)],
) -> Client:
    """
    Returns a Supabase client authenticated with the service role key.
    The service role key bypasses Row Level Security — only use server-side.
    """
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)
