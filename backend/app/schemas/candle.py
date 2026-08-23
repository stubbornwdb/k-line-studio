"""Candle payloads.

Wire field names are deliberately terse (`t/o/h/l/c/v/q`): a single request can
carry tens of thousands of bars and the key names would otherwise dominate the
response size.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.db.models import Candle
from app.providers.base import ProviderCandle


class CandleOut(BaseModel):
    t: int = Field(description="Open time, epoch ms")
    o: float
    h: float
    l: float  # noqa: E741 - matches the OHLC wire contract
    c: float
    v: float
    q: float | None = Field(default=None, description="Quote volume")

    @classmethod
    def from_row(cls, row: Candle) -> CandleOut:
        return cls(
            t=row.open_time,
            o=row.open,
            h=row.high,
            l=row.low,
            c=row.close,
            v=row.volume,
            q=row.quote_volume,
        )

    @classmethod
    def from_provider(cls, candle: ProviderCandle) -> CandleOut:
        return cls(
            t=candle.open_time,
            o=candle.open,
            h=candle.high,
            l=candle.low,
            c=candle.close,
            v=candle.volume,
            q=candle.quote_volume,
        )


class SeriesMeta(BaseModel):
    from_cache: int = Field(description="Bars served from the local database")
    fetched: int = Field(description="Bars downloaded from the exchange in this request")
    gaps_filled: int = Field(description="Number of missing sub-ranges downloaded")
    live_bar: bool = Field(description="True when the newest bar is still forming")
    truncated: bool = Field(description="True when the range exceeded the server cap")
    elapsed_ms: int


class CandleSeriesOut(BaseModel):
    exchange: str
    symbol: str
    interval: str
    start: int
    end: int
    count: int
    meta: SeriesMeta
    candles: list[CandleOut]
