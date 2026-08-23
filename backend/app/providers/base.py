"""Provider contract.

Adding an exchange means: subclass `ExchangeProvider`, map the intervals,
implement `list_symbols` + `_fetch_page`, and register it in `registry.py`.
Range splitting, ordering, de-duplication and progress guards are handled here
once, so a provider only ever has to describe *one* page of data.
"""

from __future__ import annotations

import asyncio
import logging
from abc import ABC, abstractmethod
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from enum import StrEnum

from app.core.config import settings
from app.core.errors import UnsupportedIntervalError
from app.core.intervals import ALL_INTERVALS, Interval
from app.providers.http import HttpClient

logger = logging.getLogger(__name__)

# Hard stop so a misbehaving upstream can never spin forever.
MAX_PAGES = 800


@dataclass(slots=True, frozen=True)
class ProviderCandle:
    open_time: int
    open: float
    high: float
    low: float
    close: float
    volume: float
    quote_volume: float | None = None
    trades: int | None = None


@dataclass(slots=True, frozen=True)
class FetchProgress:
    """One completed upstream page during a candle download."""

    page: int
    estimated_pages: int
    page_bars: int
    collected_bars: int
    start_ms: int
    end_ms: int


@dataclass(slots=True, frozen=True)
class TickerInfo:
    """Normalised 24-hour ticker data used by the monitor and rankings."""

    symbol: str
    last: float
    change_24h_pct: float
    volume_24h: float | None = None
    high_24h: float | None = None
    low_24h: float | None = None


ProgressCallback = Callable[[FetchProgress], Awaitable[None]]


@dataclass(slots=True, frozen=True)
class SymbolInfo:
    symbol: str  # native id used in API calls, e.g. "BTC-USDT-SWAP"
    display: str  # human label, e.g. "BTC/USDT"
    base: str
    quote: str
    contract_type: str = "perpetual"
    price_precision: int | None = None
    listed_at: int | None = None


class Pagination(StrEnum):
    """Which end of the window the exchange lets us walk from."""

    FORWARD = "forward"  # honours (startTime, endTime): walk oldest -> newest
    BACKWARD = "backward"  # cursor-only: walk newest -> oldest


class ExchangeProvider(ABC):
    key: str
    name: str
    market: str = "USDT-M perpetual futures"
    website: str = ""
    max_candles_per_page: int = 500
    pagination: Pagination = Pagination.FORWARD
    interval_map: dict[Interval, str] = {}

    def __init__(self) -> None:
        self._http = self._create_client()

    @abstractmethod
    def _create_client(self) -> HttpClient: ...

    @abstractmethod
    async def list_symbols(self) -> list[SymbolInfo]: ...

    async def fetch_tickers(self) -> list[TickerInfo]:
        """Return normalised 24-hour tickers when the exchange supports it."""
        return []

    @abstractmethod
    async def _fetch_page(
        self,
        symbol: str,
        interval: Interval,
        *,
        start_ms: int,
        end_ms: int,
        limit: int,
    ) -> list[ProviderCandle]:
        """Return one page, ascending by open_time.

        FORWARD providers should return the oldest `limit` candles at/after
        `start_ms`; BACKWARD providers the newest `limit` candles at/before
        `end_ms`.
        """

    # ------------------------------------------------------------------ public

    @property
    def supported_intervals(self) -> tuple[Interval, ...]:
        return tuple(i for i in ALL_INTERVALS if i in self.interval_map)

    def native_interval(self, interval: Interval) -> str:
        try:
            return self.interval_map[interval]
        except KeyError as exc:
            raise UnsupportedIntervalError(
                f"{self.name} does not support the {interval.value} interval"
            ) from exc

    async def fetch_candles(
        self,
        symbol: str,
        interval: Interval,
        start_ms: int,
        end_ms: int,
        *,
        progress: ProgressCallback | None = None,
    ) -> list[ProviderCandle]:
        """Fetch [start_ms, end_ms] inclusive, transparently paginating."""
        self.native_interval(interval)  # fail fast on unsupported interval
        if end_ms < start_ms:
            return []

        collected: dict[int, ProviderCandle] = {}
        if self.pagination is Pagination.FORWARD:
            await self._paginate_forward(symbol, interval, start_ms, end_ms, collected, progress)
        else:
            await self._paginate_backward(symbol, interval, start_ms, end_ms, collected, progress)

        return [collected[t] for t in sorted(collected)]

    async def close(self) -> None:
        await self._http.close()

    # ------------------------------------------------------------- pagination

    async def _paginate_forward(
        self,
        symbol: str,
        interval: Interval,
        start_ms: int,
        end_ms: int,
        out: dict[int, ProviderCandle],
        progress: ProgressCallback | None,
    ) -> None:
        cursor = start_ms
        estimated_pages = _estimated_pages(start_ms, end_ms, interval, self.max_candles_per_page)
        for page_no in range(MAX_PAGES):
            page = await self._page(symbol, interval, cursor, end_ms)
            kept = [c for c in page if start_ms <= c.open_time <= end_ms]
            for candle in kept:
                out[candle.open_time] = candle
            if progress is not None and kept:
                await progress(
                    FetchProgress(
                        page=page_no + 1,
                        estimated_pages=estimated_pages,
                        page_bars=len(kept),
                        collected_bars=len(out),
                        start_ms=start_ms,
                        end_ms=end_ms,
                    )
                )
            if not kept:
                return
            next_cursor = kept[-1].open_time + interval.ms
            if next_cursor <= cursor:  # upstream ignored our cursor
                logger.warning("%s made no pagination progress at %s", self.key, cursor)
                return
            cursor = next_cursor
            if cursor > end_ms:
                return
            await self._throttle(page_no)
        logger.warning("%s hit the %s page cap for %s", self.key, MAX_PAGES, symbol)

    async def _paginate_backward(
        self,
        symbol: str,
        interval: Interval,
        start_ms: int,
        end_ms: int,
        out: dict[int, ProviderCandle],
        progress: ProgressCallback | None,
    ) -> None:
        cursor = end_ms
        estimated_pages = _estimated_pages(start_ms, end_ms, interval, self.max_candles_per_page)
        for page_no in range(MAX_PAGES):
            page = await self._page(symbol, interval, start_ms, cursor)
            if not page:
                return
            page_bars = 0
            for candle in page:
                if start_ms <= candle.open_time <= end_ms:
                    out[candle.open_time] = candle
                    page_bars += 1
            if progress is not None and page_bars:
                await progress(
                    FetchProgress(
                        page=page_no + 1,
                        estimated_pages=estimated_pages,
                        page_bars=page_bars,
                        collected_bars=len(out),
                        start_ms=start_ms,
                        end_ms=end_ms,
                    )
                )
            oldest = page[0].open_time
            if oldest <= start_ms:
                return
            next_cursor = oldest - interval.ms
            if next_cursor >= cursor:
                logger.warning("%s made no pagination progress at %s", self.key, cursor)
                return
            cursor = next_cursor
            await self._throttle(page_no)
        logger.warning("%s hit the %s page cap for %s", self.key, MAX_PAGES, symbol)

    async def _page(
        self, symbol: str, interval: Interval, start_ms: int, end_ms: int
    ) -> list[ProviderCandle]:
        page = await self._fetch_page(
            symbol,
            interval,
            start_ms=start_ms,
            end_ms=end_ms,
            limit=self.max_candles_per_page,
        )
        page.sort(key=lambda c: c.open_time)
        return page

    async def _throttle(self, page_no: int) -> None:
        if page_no and settings.fetch_page_delay > 0:
            await asyncio.sleep(settings.fetch_page_delay)


def _estimated_pages(
    start_ms: int, end_ms: int, interval: Interval, page_size: int
) -> int:
    bars = (end_ms - start_ms) // interval.ms + 1
    return max(1, (bars + page_size - 1) // page_size)
