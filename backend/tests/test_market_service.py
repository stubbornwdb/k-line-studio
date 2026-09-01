from __future__ import annotations

import pytest

from app.providers.base import SymbolInfo, TickerInfo
from app.services import market as market_module
from app.services.market import MarketService, _Snapshot


@pytest.fixture
def snapshot() -> _Snapshot:
    now = 2_000_000_000_000
    cutoff = now - 365 * 24 * 60 * 60 * 1000
    symbols = [
        SymbolInfo(
            symbol="AAAUSDT",
            display="AAA/USDT",
            base="AAA",
            quote="USDT",
            listed_at=cutoff + 1,
        ),
        SymbolInfo(
            symbol="BTRUSDT",
            display="BTR/USDT",
            base="BTR",
            quote="USDT",
            listed_at=cutoff + 2,
        ),
        SymbolInfo(
            symbol="CCCUSDT",
            display="CCC/USDT",
            base="CCC",
            quote="USDT",
            listed_at=cutoff + 3,
        ),
        SymbolInfo(
            symbol="OLDUSDT",
            display="OLD/USDT",
            base="OLD",
            quote="USDT",
            listed_at=cutoff - 1,
        ),
    ]
    tickers = {
        "AAAUSDT": TickerInfo(
            symbol="AAAUSDT", last=1.0, change_24h_pct=1.0, volume_24h=30.0
        ),
        "BTRUSDT": TickerInfo(
            symbol="BTRUSDT", last=1.0, change_24h_pct=3.0, volume_24h=10.0
        ),
        "CCCUSDT": TickerInfo(
            symbol="CCCUSDT", last=1.0, change_24h_pct=2.0, volume_24h=20.0
        ),
        "OLDUSDT": TickerInfo(
            symbol="OLDUSDT", last=1.0, change_24h_pct=9.0, volume_24h=90.0
        ),
    }
    return _Snapshot(
        fetched_at=0.0,
        updated_at=now,
        tickers=tickers,
        symbols={item.symbol: item for item in symbols},
    )


@pytest.mark.asyncio
async def test_new_listings_page_paginates_and_sorts(monkeypatch: pytest.MonkeyPatch, snapshot):
    service = MarketService()

    async def fake_snapshot(_exchange: str):
        return snapshot

    monkeypatch.setattr(service, "snapshot", fake_snapshot)
    monkeypatch.setattr(market_module, "now_ms", lambda: 2_000_000_000_000)

    page = await service.new_listings_page("binance", limit=2)

    assert page.total == 3
    assert [item.symbol for item in page.items] == ["CCCUSDT", "BTRUSDT"]
    assert page.next_cursor == f"{snapshot.symbols['BTRUSDT'].listed_at}:BTRUSDT"
    assert page.has_more is True


@pytest.mark.asyncio
async def test_new_listings_page_searches_and_uses_cursor(
    monkeypatch: pytest.MonkeyPatch, snapshot
):
    service = MarketService()

    async def fake_snapshot(_exchange: str):
        return snapshot

    monkeypatch.setattr(service, "snapshot", fake_snapshot)
    monkeypatch.setattr(market_module, "now_ms", lambda: 2_000_000_000_000)

    filtered = await service.new_listings_page("binance", query="btr")
    assert [item.symbol for item in filtered.items] == ["BTRUSDT"]
    assert filtered.total == 1

    first = await service.new_listings_page("binance", limit=2)
    second = await service.new_listings_page("binance", cursor=first.next_cursor, limit=2)
    assert [item.symbol for item in second.items] == ["AAAUSDT"]
    assert second.next_cursor is None
    assert second.has_more is False


@pytest.mark.asyncio
async def test_new_listings_page_filters_days_and_sorts_by_change(
    monkeypatch: pytest.MonkeyPatch, snapshot
):
    service = MarketService()

    async def fake_snapshot(_exchange: str):
        return snapshot

    monkeypatch.setattr(service, "snapshot", fake_snapshot)
    monkeypatch.setattr(market_module, "now_ms", lambda: 2_000_000_000_000)

    page = await service.new_listings_page("binance", sort="change")
    assert [item.symbol for item in page.items] == ["BTRUSDT", "CCCUSDT", "AAAUSDT"]


@pytest.mark.asyncio
async def test_all_new_listing_symbols_returns_full_filtered_set(
    monkeypatch: pytest.MonkeyPatch, snapshot
):
    service = MarketService()

    async def fake_snapshot(_exchange: str):
        return snapshot

    monkeypatch.setattr(service, "snapshot", fake_snapshot)
    monkeypatch.setattr(market_module, "now_ms", lambda: 2_000_000_000_000)

    symbols = await service.all_new_listing_symbols("binance", query="btr")

    assert symbols == ["BTRUSDT"]
