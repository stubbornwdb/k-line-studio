"""Application settings, loaded from environment / .env file."""

from __future__ import annotations

from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    app_name: str = "K-Line Studio"
    debug: bool = False

    # sqlite+aiosqlite:///./data/kline.db  |  postgresql+asyncpg://user:pw@host/db
    database_url: str = "sqlite+aiosqlite:///./data/kline.db"
    db_echo: bool = False

    cors_origins: list[str] = Field(
        default_factory=lambda: [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
        ]
    )

    # Outbound HTTP (exchange REST APIs)
    http_timeout: float = 20.0
    http_proxy: str | None = None
    http_max_retries: int = 3
    http_retry_backoff: float = 0.6
    # Politeness delay between paginated requests to the same exchange (seconds)
    fetch_page_delay: float = 0.12

    # Safety guards
    max_candles_per_request: int = 60_000
    symbols_cache_ttl: float = 900.0

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
