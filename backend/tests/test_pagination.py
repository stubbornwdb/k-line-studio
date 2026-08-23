"""The generic batching loop in ExchangeProvider."""

from __future__ import annotations

from app.core.intervals import Interval
from app.providers.base import (
    ExchangeProvider,
    FetchProgress,
    Pagination,
    ProviderCandle,
    SymbolInfo,
)
from app.providers.http import HttpClient

INTERVAL = Interval.H1
ORIGIN = 1_600_000_000_000 - (1_600_000_000_000 % INTERVAL.ms)
PAGE = 10


def _candle(t: int) -> ProviderCandle:
    return ProviderCandle(open_time=t, open=1, high=2, low=0.5, close=1.5, volume=1)


class _Base(ExchangeProvider):
    key = "pager"
    name = "Pager"
    max_candles_per_page = PAGE
    interval_map = {i: i.value for i in Interval}

    def __init__(self) -> None:
        super().__init__()
        self.pages = 0

    def _create_client(self) -> HttpClient:
        return HttpClient("http://fake.invalid")

    async def list_symbols(self) -> list[SymbolInfo]:
        return []


class ForwardProvider(_Base):
    """Mimics Binance: honours startTime, answers oldest-first."""

    pagination = Pagination.FORWARD

    async def _fetch_page(self, symbol, interval, *, start_ms, end_ms, limit):
        self.pages += 1
        first = interval.ceil(start_ms)
        return [
            _candle(first + n * interval.ms)
            for n in range(limit)
            if first + n * interval.ms <= end_ms
        ]


class BackwardProvider(_Base):
    """Mimics Bybit/OKX: anchored at the window end, answers newest-first."""

    pagination = Pagination.BACKWARD

    async def _fetch_page(self, symbol, interval, *, start_ms, end_ms, limit):
        self.pages += 1
        last = interval.floor(end_ms)
        rows = [last - n * interval.ms for n in range(limit)]
        return [_candle(t) for t in rows if t >= ORIGIN]  # nothing exists before ORIGIN


async def test_forward_pagination_covers_the_whole_window():
    provider = ForwardProvider()
    end = ORIGIN + 24 * INTERVAL.ms
    got = await provider.fetch_candles("X", INTERVAL, ORIGIN, end)

    assert [c.open_time for c in got] == [ORIGIN + n * INTERVAL.ms for n in range(25)]
    assert provider.pages == 3  # 10 + 10 + 5


async def test_forward_pagination_reports_each_completed_page():
    provider = ForwardProvider()
    updates: list[FetchProgress] = []

    async def on_progress(update: FetchProgress) -> None:
        updates.append(update)

    end = ORIGIN + 24 * INTERVAL.ms
    await provider.fetch_candles("X", INTERVAL, ORIGIN, end, progress=on_progress)

    assert [update.page for update in updates] == [1, 2, 3]
    assert updates[-1].collected_bars == 25
    assert updates[-1].estimated_pages == 3


async def test_backward_pagination_covers_the_whole_window():
    provider = BackwardProvider()
    end = ORIGIN + 24 * INTERVAL.ms
    got = await provider.fetch_candles("X", INTERVAL, ORIGIN, end)

    assert [c.open_time for c in got] == [ORIGIN + n * INTERVAL.ms for n in range(25)]
    assert provider.pages == 3


async def test_results_are_deduplicated_and_sorted():
    provider = BackwardProvider()
    got = await provider.fetch_candles("X", INTERVAL, ORIGIN, ORIGIN + 5 * INTERVAL.ms)
    times = [c.open_time for c in got]

    assert times == sorted(times)
    assert len(set(times)) == len(times)


async def test_backward_pagination_stops_when_history_runs_out():
    provider = BackwardProvider()
    # Ask for 40 bars that start before the provider's earliest data.
    got = await provider.fetch_candles(
        "X", INTERVAL, ORIGIN - 40 * INTERVAL.ms, ORIGIN + 4 * INTERVAL.ms
    )

    assert [c.open_time for c in got] == [ORIGIN + n * INTERVAL.ms for n in range(5)]
    assert provider.pages < 10  # bailed out instead of walking to the page cap


async def test_inverted_window_is_a_no_op():
    provider = ForwardProvider()
    assert await provider.fetch_candles("X", INTERVAL, ORIGIN, ORIGIN - INTERVAL.ms) == []
    assert provider.pages == 0
