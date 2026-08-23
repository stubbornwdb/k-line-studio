"""Short-lived exchange ticker snapshots and monitor list shaping."""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.timeutil import now_ms
from app.db.models import PriceAlert, Watchlist
from app.providers.base import SymbolInfo, TickerInfo
from app.providers.registry import get_provider
from app.schemas.market import MarketOverviewOut, TickerOut
from app.services.symbols import catalog

_CACHE_TTL_SECONDS = 10.0
_LIST_LIMIT = 30


@dataclass(slots=True)
class _Snapshot:
    fetched_at: float
    updated_at: int
    tickers: dict[str, TickerInfo]
    symbols: dict[str, SymbolInfo]


class MarketService:
    _cache: dict[str, _Snapshot] = {}
    _locks: dict[str, asyncio.Lock] = {}

    async def snapshot(self, exchange: str) -> _Snapshot:
        provider = get_provider(exchange)
        cached = self._cache.get(provider.key)
        if cached and time.monotonic() - cached.fetched_at < _CACHE_TTL_SECONDS:
            return cached

        lock = self._locks.setdefault(provider.key, asyncio.Lock())
        async with lock:
            cached = self._cache.get(provider.key)
            if cached and time.monotonic() - cached.fetched_at < _CACHE_TTL_SECONDS:
                return cached
            tickers = await provider.fetch_tickers()
            symbols, _ = await catalog.get(provider)
            snapshot = _Snapshot(
                fetched_at=time.monotonic(),
                updated_at=now_ms(),
                tickers={ticker.symbol: ticker for ticker in tickers},
                symbols={symbol.symbol: symbol for symbol in symbols},
            )
            self._cache[provider.key] = snapshot
            return snapshot

    async def overview(
        self,
        session: AsyncSession,
        exchange: str,
        selected_symbol: str | None = None,
    ) -> MarketOverviewOut:
        snapshot = await self.snapshot(exchange)
        watchlist = (
            await session.execute(
                select(Watchlist)
                .where(Watchlist.exchange == exchange)
                .order_by(Watchlist.created_at.desc())
            )
        ).scalars()
        alerts = (
            await session.execute(
                select(PriceAlert).where(
                    PriceAlert.exchange == exchange,
                    PriceAlert.enabled.is_(True),
                )
            )
        ).scalars()

        triggered: list[int] = []
        for alert in alerts:
            ticker = snapshot.tickers.get(alert.symbol)
            if ticker is None:
                continue
            value = ticker.last if alert.kind == "price" else ticker.change_24h_pct
            matched = (
                value >= alert.threshold
                if alert.direction == "above"
                else value <= alert.threshold
            )
            if matched:
                stamp = now_ms()
                alert.enabled = False
                alert.triggered_at = stamp
                alert.updated_at = stamp
                triggered.append(alert.id)

        all_rows = [self._ticker_out(snapshot, ticker) for ticker in snapshot.tickers.values()]
        favorites = [
            self._ticker_out(snapshot, snapshot.tickers[item.symbol])
            for item in watchlist
            if item.symbol in snapshot.tickers
        ]
        cutoff = now_ms() - 365 * 24 * 60 * 60 * 1000
        new_listings = sorted(
            (row for row in all_rows if row.listed_at is not None and row.listed_at >= cutoff),
            key=lambda row: (row.listed_at or 0, row.change_24h_pct),
            reverse=True,
        )[:_LIST_LIMIT]
        gainers = sorted(all_rows, key=lambda row: row.change_24h_pct, reverse=True)[:_LIST_LIMIT]
        losers = sorted(all_rows, key=lambda row: row.change_24h_pct)[:_LIST_LIMIT]
        return MarketOverviewOut(
            exchange=exchange,
            updated_at=snapshot.updated_at,
            selected=(
                self._ticker_out(snapshot, snapshot.tickers[selected_symbol])
                if selected_symbol in snapshot.tickers
                else None
            ),
            favorites=favorites,
            new_listings=new_listings,
            gainers=gainers,
            losers=losers,
            triggered_alert_ids=triggered,
        )

    @staticmethod
    def _ticker_out(snapshot: _Snapshot, ticker: TickerInfo) -> TickerOut:
        symbol = snapshot.symbols.get(ticker.symbol)
        return TickerOut(
            symbol=ticker.symbol,
            display=symbol.display if symbol else ticker.symbol,
            last=ticker.last,
            change_24h_pct=ticker.change_24h_pct,
            volume_24h=ticker.volume_24h,
            high_24h=ticker.high_24h,
            low_24h=ticker.low_24h,
            listed_at=symbol.listed_at if symbol else None,
        )


market_service = MarketService()
