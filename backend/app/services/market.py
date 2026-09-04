"""Short-lived exchange ticker snapshots and monitor list shaping."""

from __future__ import annotations

import asyncio
import re
import time
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.timeutil import now_ms
from app.db.models import PriceAlert, Watchlist
from app.providers.base import SymbolInfo, TickerInfo
from app.providers.registry import get_provider
from app.schemas.market import MarketListingPageOut, MarketOverviewOut, TickerOut
from app.services.symbols import catalog

_CACHE_TTL_SECONDS = 10.0
_LIST_LIMIT = 30
_NEW_LISTING_LIMIT = 200
_NEW_LISTINGS_PAGE_LIMIT = 100
_MAJOR_LIMIT = 50
_HOT_LIMIT = 30
_QUOTE_WHITELIST: set[str] = {"USDT"}

MAJOR_BASES: set[str] = {
    "BTC", "ETH", "SOL", "BNB", "XRP", "DOGE", "ADA", "AVAX", "DOT", "LINK",
    "MATIC", "POL", "UNI", "LTC", "BCH", "ATOM", "FIL", "APT", "ARB", "OP",
    "NEAR", "ICP", "FTM", "ETC", "AAVE", "MKR", "ALGO", "HBAR", "SUI", "SEI",
    "TIA", "INJ", "STX", "RUNE", "SAND", "MANA", "AXS", "IMX", "PEPE", "WIF",
    "FLOKI", "SHIB", "TON", "TRX", "CRV", "SNX", "LDO", "RENDER", "FET", "TAO",
}


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
        *,
        new_listing_days: int = 365,
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

        all_rows = [
            self._ticker_out(snapshot, ticker)
            for ticker in snapshot.tickers.values()
            if self._is_usdt(snapshot, ticker.symbol)
        ]
        favorites = [
            self._ticker_out(snapshot, snapshot.tickers[item.symbol])
            for item in watchlist
            if item.symbol in snapshot.tickers
        ]
        cutoff = now_ms() - new_listing_days * 24 * 60 * 60 * 1000
        new_listings = sorted(
            (row for row in all_rows if row.listed_at is not None and row.listed_at >= cutoff),
            key=lambda row: (row.listed_at or 0, row.change_24h_pct),
            reverse=True,
        )[:_NEW_LISTING_LIMIT]
        gainers = sorted(all_rows, key=lambda row: row.change_24h_pct, reverse=True)[:_LIST_LIMIT]
        losers = sorted(all_rows, key=lambda row: row.change_24h_pct)[:_LIST_LIMIT]
        major_coins = sorted(
            (
                row for row in all_rows
                if self._is_major(snapshot, row.symbol)
            ),
            key=lambda row: -(row.volume_24h or 0),
        )[:_MAJOR_LIMIT]
        hot_coins = sorted(
            all_rows,
            key=lambda row: _hot_score(row),
            reverse=True,
        )[:_HOT_LIMIT]
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
            major_coins=major_coins,
            hot_coins=hot_coins,
            gainers=gainers,
            losers=losers,
            triggered_alert_ids=triggered,
        )

    async def new_listings_page(
        self,
        exchange: str,
        *,
        query: str = "",
        cursor: str | None = None,
        limit: int = 50,
        days: int = 365,
        sort: str = "time",
    ) -> MarketListingPageOut:
        snapshot = await self.snapshot(exchange)
        rows = self._new_listing_rows(snapshot, days=days, sort=sort)
        needle = _normalize(query)
        if needle:
            rows = [row for row in rows if _matches(row, needle)]

        total = len(rows)
        start_index = _cursor_index(rows, cursor)
        page_limit = min(max(limit, 1), _NEW_LISTINGS_PAGE_LIMIT)
        page = rows[start_index : start_index + page_limit]
        next_cursor = (
            _encode_cursor(page[-1])
            if len(page) == page_limit and start_index + page_limit < total
            else None
        )
        return MarketListingPageOut(
            exchange=exchange,
            query=query,
            total=total,
            limit=page_limit,
            next_cursor=next_cursor,
            has_more=next_cursor is not None,
            items=page,
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

    @staticmethod
    def _is_usdt(snapshot: _Snapshot, symbol: str) -> bool:
        info = snapshot.symbols.get(symbol)
        return info is not None and info.quote.upper() in _QUOTE_WHITELIST

    @staticmethod
    def _is_major(snapshot: _Snapshot, symbol: str) -> bool:
        info = snapshot.symbols.get(symbol)
        return info is not None and info.base.upper() in MAJOR_BASES

    @staticmethod
    def _new_listing_rows(
        snapshot: _Snapshot,
        *,
        days: int = 365,
        sort: str = "time",
    ) -> list[TickerOut]:
        cutoff = now_ms() - days * 24 * 60 * 60 * 1000
        rows = [
            MarketService._ticker_out(snapshot, ticker)
            for ticker in snapshot.tickers.values()
            if ticker.symbol in snapshot.symbols
            and MarketService._is_usdt(snapshot, ticker.symbol)
            and snapshot.symbols[ticker.symbol].listed_at is not None
            and snapshot.symbols[ticker.symbol].listed_at >= cutoff
        ]
        if sort == "change":
            return sorted(rows, key=lambda row: (-row.change_24h_pct, row.symbol))
        if sort == "volume":
            return sorted(rows, key=lambda row: (-(row.volume_24h or 0), row.symbol))
        return sorted(rows, key=lambda row: (-(row.listed_at or 0), row.symbol))

    async def all_new_listing_symbols(
        self,
        exchange: str,
        *,
        query: str = "",
        days: int = 365,
        sort: str = "time",
    ) -> list[str]:
        """Resolve the complete filtered listing set for server-side jobs."""
        snapshot = await self.snapshot(exchange)
        rows = self._new_listing_rows(snapshot, days=days, sort=sort)
        needle = _normalize(query)
        if needle:
            rows = [row for row in rows if _matches(row, needle)]
        return [row.symbol for row in rows]


def _hot_score(row: TickerOut) -> float:
    """Composite heat score: volume weighted by price movement magnitude.

    Mirrors Binance/TradingView trending logic — high-volume coins with
    significant price movement rank highest.
    """
    volume = row.volume_24h or 0
    change_magnitude = abs(row.change_24h_pct)
    return volume * (1 + change_magnitude / 100)


def _normalize(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", text.lower())


def _matches(row: TickerOut, needle: str) -> bool:
    haystacks = [row.symbol, row.display, row.symbol.replace("/", ""), row.display.replace("/", "")]
    return any(needle in _normalize(value) for value in haystacks)


def _encode_cursor(row: TickerOut) -> str:
    return f"{row.listed_at or 0}:{row.symbol}"


def _decode_cursor(cursor: str) -> tuple[int, str] | None:
    try:
        listed_at_raw, symbol = cursor.split(":", 1)
        listed_at = int(listed_at_raw)
    except (TypeError, ValueError):
        return None
    return listed_at, symbol


def _cursor_index(rows: list[TickerOut], cursor: str | None) -> int:
    if not cursor:
        return 0
    decoded = _decode_cursor(cursor)
    if decoded is None:
        return 0
    _, symbol = decoded
    for index, row in enumerate(rows):
        if row.symbol == symbol:
            return index + 1
    return 0


market_service = MarketService()
