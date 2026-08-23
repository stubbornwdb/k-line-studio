"""Provider registry -- the single place that knows which exchanges exist."""

from __future__ import annotations

from app.core.errors import UnknownProviderError
from app.providers.base import ExchangeProvider
from app.providers.binance import BinanceFuturesProvider
from app.providers.bybit import BybitFuturesProvider
from app.providers.okx import OkxSwapProvider

_PROVIDER_TYPES: tuple[type[ExchangeProvider], ...] = (
    BinanceFuturesProvider,
    BybitFuturesProvider,
    OkxSwapProvider,
)

_instances: dict[str, ExchangeProvider] = {}


def _instances_map() -> dict[str, ExchangeProvider]:
    if not _instances:
        for provider_type in _PROVIDER_TYPES:
            provider = provider_type()
            _instances[provider.key] = provider
    return _instances


def list_providers() -> list[ExchangeProvider]:
    return list(_instances_map().values())


def get_provider(key: str) -> ExchangeProvider:
    try:
        return _instances_map()[key.lower()]
    except KeyError as exc:
        known = ", ".join(_instances_map())
        raise UnknownProviderError(f"Unknown exchange {key!r}. Available: {known}") from exc


async def close_providers() -> None:
    for provider in list(_instances.values()):
        await provider.close()
    _instances.clear()
