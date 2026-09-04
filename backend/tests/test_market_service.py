from __future__ import annotations

import pytest

from app.providers.base import SymbolInfo, TickerInfo
from app.schemas.market import TickerOut
from app.services import market as market_module
from app.services.market import MarketService, _hot_coins, _Snapshot


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


def _row(symbol: str, *, volume: float, change: float, high: float, low: float) -> TickerOut:
    return TickerOut(
        symbol=symbol,
        display=symbol,
        last=low,
        change_24h_pct=change,
        volume_24h=volume,
        high_24h=high,
        low_24h=low,
    )


def _dust(count: int) -> list[TickerOut]:
    """Illiquid filler, so the relative volume gate lands where it would live."""
    return [
        _row(f"DUST{index}USDT", volume=float(index + 1), change=0.0, high=100, low=100)
        for index in range(count)
    ]


def test_hot_coins_do_not_collapse_into_a_volume_sort():
    """A blue chip must not outrank a mid-cap that actually moved.

    Turnover spans orders of magnitude, so a raw blend would rank purely by
    volume and duplicate the major-coins tab.
    """
    rows = [
        _row("MEGAUSDT", volume=20_000_000_000, change=1.0, high=101, low=100),
        _row("BIGUSDT", volume=10_000_000_000, change=1.5, high=101, low=100),
        _row("MOVERUSDT", volume=500_000_000, change=90.0, high=200, low=100),
        _row("QUIETUSDT", volume=400_000_000, change=0.5, high=101, low=100),
        *_dust(8),
    ]

    ranked = [row.symbol for row in _hot_coins(rows, 4)]

    assert ranked[0] == "MOVERUSDT"
    assert ranked.index("MOVERUSDT") < ranked.index("MEGAUSDT")


def test_hot_coins_drop_turnover_below_the_median():
    """A coin screaming +400% on negligible turnover must not rank as hot.

    The gate is relative: everything under the universe's median turnover is
    dropped before scoring, so this asserts against a realistic spread rather
    than a handful of symbols.
    """
    liquid = [
        _row(
            f"LIQ{index}USDT",
            volume=1_000_000_000 - index * 1_000_000,
            change=2.0,
            high=104,
            low=100,
        )
        for index in range(10)
    ]
    screamers = [
        _row("PENNY1USDT", volume=1_000, change=400.0, high=500, low=100),
        _row("PENNY2USDT", volume=500, change=300.0, high=400, low=100),
    ]

    ranked = [row.symbol for row in _hot_coins([*liquid, *screamers, *_dust(8)], 30)]

    assert "PENNY1USDT" not in ranked
    assert "PENNY2USDT" not in ranked
    assert all(symbol.startswith("LIQ") for symbol in ranked)


def test_hot_coins_rank_amplitude_when_change_ties():
    """Two coins up the same amount: the one that travelled further is hotter."""
    rows = [
        _row("CALMUSDT", volume=1_000_000_000, change=10.0, high=110, low=100),
        _row("WILDUSDT", volume=1_000_000_000, change=10.0, high=180, low=100),
        *_dust(4),
    ]

    ranked = [row.symbol for row in _hot_coins(rows, 2)]

    assert ranked[0] == "WILDUSDT"


def test_hot_coins_handles_missing_high_low():
    """A ticker without 24h high/low scores zero amplitude instead of raising."""
    rows = [
        _row("AUSDT", volume=1_000_000_000, change=5.0, high=110, low=100),
        _row("BUSDT", volume=900_000_000, change=4.0, high=108, low=100),
        *_dust(4),
    ]
    rows[1].high_24h = None
    rows[1].low_24h = None

    assert [row.symbol for row in _hot_coins(rows, 2)] == ["AUSDT", "BUSDT"]


def test_hot_coins_survive_a_universe_smaller_than_the_gate():
    """With too few symbols to split, rank everything rather than return nothing."""
    rows = [_row("ONLYUSDT", volume=1.0, change=5.0, high=110, low=100)]

    assert [row.symbol for row in _hot_coins(rows, 10)] == ["ONLYUSDT"]


def test_hot_coins_on_empty_input():
    assert _hot_coins([], 10) == []


@pytest.mark.asyncio
async def test_non_usdt_pairs_are_excluded_from_listings(
    monkeypatch: pytest.MonkeyPatch, snapshot
):
    """USDC / USD1 contracts must never reach a list view."""
    now = 2_000_000_000_000
    for quote in ("USDC", "USD1"):
        symbol = f"AAA{quote}"
        snapshot.symbols[symbol] = SymbolInfo(
            symbol=symbol,
            display=f"AAA/{quote}",
            base="AAA",
            quote=quote,
            listed_at=now - 1000,
        )
        snapshot.tickers[symbol] = TickerInfo(
            symbol=symbol, last=1.0, change_24h_pct=50.0, volume_24h=1e12
        )

    service = MarketService()

    async def fake_snapshot(_exchange: str):
        return snapshot

    monkeypatch.setattr(service, "snapshot", fake_snapshot)
    monkeypatch.setattr(market_module, "now_ms", lambda: now)

    page = await service.new_listings_page("binance")
    assert all(item.symbol.endswith("USDT") for item in page.items)

    symbols = await service.all_new_listing_symbols("binance")
    assert all(symbol.endswith("USDT") for symbol in symbols)
