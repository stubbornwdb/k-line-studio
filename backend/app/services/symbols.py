"""Symbol catalog with a TTL cache.

Instrument lists change a few times a week but a symbol picker asks for them on
every page load, so they are memoised per exchange with a per-key lock to avoid
a thundering herd on cold start.
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass

from app.core.config import settings
from app.providers.base import ExchangeProvider, SymbolInfo


@dataclass(slots=True)
class _Entry:
    fetched_at: float
    cached_at_ms: int
    symbols: list[SymbolInfo]


class SymbolCatalog:
    def __init__(self, ttl: float | None = None) -> None:
        self._ttl = ttl if ttl is not None else settings.symbols_cache_ttl
        self._entries: dict[str, _Entry] = {}
        self._locks: dict[str, asyncio.Lock] = {}

    async def get(
        self, provider: ExchangeProvider, *, refresh: bool = False
    ) -> tuple[list[SymbolInfo], int]:
        entry = self._entries.get(provider.key)
        if not refresh and entry and (time.monotonic() - entry.fetched_at) < self._ttl:
            return entry.symbols, entry.cached_at_ms

        lock = self._locks.setdefault(provider.key, asyncio.Lock())
        async with lock:
            entry = self._entries.get(provider.key)
            if not refresh and entry and (time.monotonic() - entry.fetched_at) < self._ttl:
                return entry.symbols, entry.cached_at_ms

            symbols = sorted(await provider.list_symbols(), key=_sort_key)
            fresh = _Entry(
                fetched_at=time.monotonic(),
                cached_at_ms=int(time.time() * 1000),
                symbols=symbols,
            )
            self._entries[provider.key] = fresh
            return fresh.symbols, fresh.cached_at_ms

    def invalidate(self, exchange_key: str | None = None) -> None:
        if exchange_key is None:
            self._entries.clear()
        else:
            self._entries.pop(exchange_key, None)


_MAJORS = ("BTC", "ETH", "SOL", "BNB", "XRP")


def _sort_key(info: SymbolInfo) -> tuple[int, str]:
    """Majors first, then alphabetical -- what a trader expects to see on top."""
    rank = _MAJORS.index(info.base) if info.base in _MAJORS else len(_MAJORS)
    return (rank, info.display)


catalog = SymbolCatalog()
