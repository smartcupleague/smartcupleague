from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # App
    APP_NAME: str = "SmartCup League API"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False

    #CORS 
    ALLOWED_ORIGINS: str = "http://localhost:5173,http://localhost:3000"

    @property
    def allowed_origins_list(self) -> list[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]

    # Supabase
    SUPABASE_URL: str
    SUPABASE_SERVICE_ROLE_KEY: str

    # CoinGecko
    COINGECKO_API_KEY: str = ""
    COINGECKO_BASE_URL: str = "https://api.coingecko.com/api/v3"
    # Token ID on CoinGecko for Vara Network
    VARA_TOKEN_ID: str = "vara-network"

    # Cache
    PRICE_CACHE_TTL_SECONDS: int = 300  # 5 minutes

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
    )


@lru_cache
def get_settings() -> Settings:
    """
    Cached settings singleton.
    FastAPI routes call: Depends(get_settings)
    """
    return Settings()  # type: ignore[call-arg]
