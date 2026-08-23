"""Cache behaviour of CandleService, driven by a fake exchange."""

from __future__ import annotations

from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.intervals import Interval
from app.db.models import Base
from app.providers.base import ExchangeProvider, Pagination, ProviderCandle, SymbolInfo
from app.providers.http import HttpClient
from app.services import candles as candles_module
from app.services.candles import CandleService

INTERVAL = Interval.H1
# A window that ended long ago, so the "live bar" path never triggers.
BASE_TIME = 1_700_000_000_000 - (1_700_000_000_000 % INTERVAL.ms)


class FakeProvider(ExchangeProvider):
    key = "fake"
    name = "Fake Exchange"
    max_candles_per_page = 1000
    pagination = Pagination.FORWARD
    interval_map = {i: i.value for i in Interval}

    def __init__(self) -> None:
        super().__init__()
        self.requests: list[tuple[int, int]] = []

    def _create_client(self) -> HttpClient:
        return HttpClient("http://fake.invalid")

    async def list_symbols(self) -> list[SymbolInfo]:
        return [SymbolInfo(symbol="FAKEUSDT", display="FAKE/USDT", base="FAKE", quote="USDT")]

    async def fetch_candles(
        self, symbol: str, interval: Interval, start_ms: int, end_ms: int
    ) -> list[ProviderCandle]:
        self.requests.append((start_ms, end_ms))
        out: list[ProviderCandle] = []
        t = interval.ceil(start_ms)
        while t <= end_ms:
            price = 100.0 + (t // interval.ms) % 10
            out.append(
                ProviderCandle(
                    open_time=t,
                    open=price,
                    high=price + 1,
                    low=price - 1,
                    close=price + 0.5,
                    volume=1.0,
                )
            )
            t += interval.ms
        return out

    async def _fetch_page(self, *args, **kwargs):  # pragma: no cover - bypassed above
        raise NotImplementedError


@pytest_asyncio.fixture
async def session() -> AsyncIterator[AsyncSession]:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as db:
        yield db
    await engine.dispose()


@pytest.fixture
def provider(monkeypatch: pytest.MonkeyPatch) -> FakeProvider:
    fake = FakeProvider()
    monkeypatch.setattr(candles_module, "get_provider", lambda _key: fake)
    return fake


async def series(service: CandleService, start: int, end: int, **kwargs):
    return await service.get_series("fake", "FAKEUSDT", INTERVAL, start, end, **kwargs)


async def test_first_request_downloads_and_persists(session, provider):
    service = CandleService(session)
    start = BASE_TIME - 100 * INTERVAL.ms
    result = await series(service, start, BASE_TIME)

    assert result.count == 101
    assert result.meta.fetched == 101
    assert result.meta.gaps_filled == 1
    assert len(provider.requests) == 1


async def test_second_identical_request_hits_the_cache(session, provider):
    service = CandleService(session)
    start = BASE_TIME - 100 * INTERVAL.ms
    await series(service, start, BASE_TIME)

    again = await series(service, start, BASE_TIME)
    assert again.count == 101
    assert again.meta.fetched == 0
    assert again.meta.from_cache == 101
    assert len(provider.requests) == 1  # no second upstream call


async def test_widening_the_window_only_fetches_the_new_part(session, provider):
    service = CandleService(session)
    inner_start = BASE_TIME - 50 * INTERVAL.ms
    await series(service, inner_start, BASE_TIME)
    provider.requests.clear()

    wider = await series(service, BASE_TIME - 100 * INTERVAL.ms, BASE_TIME)
    assert wider.count == 101
    assert len(provider.requests) == 1
    gap_start, gap_end = provider.requests[0]
    assert gap_start == BASE_TIME - 100 * INTERVAL.ms
    assert gap_end == inner_start - INTERVAL.ms


async def test_refresh_forces_a_redownload(session, provider):
    service = CandleService(session)
    start = BASE_TIME - 10 * INTERVAL.ms
    await series(service, start, BASE_TIME)
    provider.requests.clear()

    refreshed = await series(service, start, BASE_TIME, refresh=True)
    assert refreshed.meta.fetched == 11
    assert provider.requests == [(start, BASE_TIME)]


async def test_window_is_capped_and_flagged(session, provider, monkeypatch):
    monkeypatch.setattr(candles_module.settings, "max_candles_per_request", 20)
    service = CandleService(session)
    result = await series(service, BASE_TIME - 500 * INTERVAL.ms, BASE_TIME)

    assert result.meta.truncated is True
    assert result.count == 20
    assert result.start == BASE_TIME - 19 * INTERVAL.ms
