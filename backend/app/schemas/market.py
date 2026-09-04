"""Exchange / symbol payloads."""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.providers.base import ExchangeProvider, SymbolInfo


class ExchangeOut(BaseModel):
    key: str
    name: str
    market: str
    website: str
    intervals: list[str]
    max_candles_per_page: int

    @classmethod
    def from_provider(cls, provider: ExchangeProvider) -> ExchangeOut:
        return cls(
            key=provider.key,
            name=provider.name,
            market=provider.market,
            website=provider.website,
            intervals=[i.value for i in provider.supported_intervals],
            max_candles_per_page=provider.max_candles_per_page,
        )


class SymbolOut(BaseModel):
    symbol: str
    display: str
    base: str
    quote: str
    contract_type: str
    price_precision: int | None = None
    listed_at: int | None = None

    @classmethod
    def from_info(cls, info: SymbolInfo) -> SymbolOut:
        return cls(
            symbol=info.symbol,
            display=info.display,
            base=info.base,
            quote=info.quote,
            contract_type=info.contract_type,
            price_precision=info.price_precision,
            listed_at=info.listed_at,
        )


class SymbolListOut(BaseModel):
    exchange: str
    count: int
    cached_at: int = Field(description="Epoch ms of the catalog snapshot")
    symbols: list[SymbolOut]


class TickerOut(BaseModel):
    symbol: str
    display: str
    last: float
    change_24h_pct: float
    volume_24h: float | None = None
    high_24h: float | None = None
    low_24h: float | None = None
    listed_at: int | None = None


class MarketOverviewOut(BaseModel):
    exchange: str
    updated_at: int
    selected: TickerOut | None = None
    favorites: list[TickerOut]
    new_listings: list[TickerOut]
    major_coins: list[TickerOut]
    hot_coins: list[TickerOut]
    gainers: list[TickerOut]
    losers: list[TickerOut]
    triggered_alert_ids: list[int]


class MarketListingPageOut(BaseModel):
    exchange: str
    query: str = ""
    total: int
    limit: int
    next_cursor: str | None = None
    has_more: bool
    items: list[TickerOut]
