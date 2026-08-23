"""Exchange discovery + symbol catalog."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query

from app.core.intervals import Interval
from app.providers.registry import get_provider, list_providers
from app.schemas.market import ExchangeOut, SymbolListOut, SymbolOut
from app.services.symbols import catalog

router = APIRouter(tags=["market"])


@router.get("/exchanges", response_model=list[ExchangeOut])
async def get_exchanges() -> list[ExchangeOut]:
    return [ExchangeOut.from_provider(p) for p in list_providers()]


@router.get("/intervals", response_model=list[str])
async def get_intervals() -> list[str]:
    return [i.value for i in Interval]


@router.get("/exchanges/{exchange}/symbols", response_model=SymbolListOut)
async def get_symbols(
    exchange: str,
    search: Annotated[str | None, Query(description="Case-insensitive substring")] = None,
    limit: Annotated[int, Query(ge=1, le=2000)] = 2000,
    refresh: Annotated[bool, Query(description="Bypass the TTL cache")] = False,
) -> SymbolListOut:
    provider = get_provider(exchange)
    symbols, cached_at = await catalog.get(provider, refresh=refresh)

    if search:
        needle = search.upper().replace("/", "")
        symbols = [
            s
            for s in symbols
            if needle in s.symbol.upper() or needle in s.display.upper().replace("/", "")
        ]

    return SymbolListOut(
        exchange=provider.key,
        count=len(symbols),
        cached_at=cached_at,
        symbols=[SymbolOut.from_info(s) for s in symbols[:limit]],
    )
