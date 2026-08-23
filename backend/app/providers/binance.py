"""Binance USDⓈ-M futures (public endpoints, no API key required).

Docs: https://developers.binance.com/docs/derivatives/usds-margined-futures
"""

from __future__ import annotations

from app.core.intervals import Interval
from app.providers.base import (
    ExchangeProvider,
    Pagination,
    ProviderCandle,
    SymbolInfo,
    TickerInfo,
)
from app.providers.http import HttpClient


class BinanceFuturesProvider(ExchangeProvider):
    key = "binance"
    name = "Binance Futures"
    market = "USDⓈ-M perpetual"
    website = "https://www.binance.com"
    max_candles_per_page = 1500
    pagination = Pagination.FORWARD
    interval_map = {i: i.value for i in Interval}  # identical vocabulary

    def _create_client(self) -> HttpClient:
        return HttpClient("https://fapi.binance.com")

    async def list_symbols(self) -> list[SymbolInfo]:
        payload = await self._http.get_json("/fapi/v1/exchangeInfo")
        symbols: list[SymbolInfo] = []
        for item in payload.get("symbols", []):
            if item.get("status") != "TRADING" or item.get("contractType") != "PERPETUAL":
                continue
            base, quote = item["baseAsset"], item["quoteAsset"]
            symbols.append(
                SymbolInfo(
                    symbol=item["symbol"],
                    display=f"{base}/{quote}",
                    base=base,
                    quote=quote,
                    price_precision=item.get("pricePrecision"),
                    listed_at=_int_or_none(item.get("onboardDate")),
                )
            )
        return symbols

    async def fetch_tickers(self) -> list[TickerInfo]:
        rows = await self._http.get_json("/fapi/v1/ticker/24hr")
        return [
            TickerInfo(
                symbol=row["symbol"],
                last=float(row["lastPrice"]),
                change_24h_pct=float(row["priceChangePercent"]),
                volume_24h=float(row["quoteVolume"]),
                high_24h=float(row["highPrice"]),
                low_24h=float(row["lowPrice"]),
            )
            for row in rows
            if row.get("symbol")
        ]

    async def _fetch_page(
        self,
        symbol: str,
        interval: Interval,
        *,
        start_ms: int,
        end_ms: int,
        limit: int,
    ) -> list[ProviderCandle]:
        rows = await self._http.get_json(
            "/fapi/v1/klines",
            {
                "symbol": symbol,
                "interval": self.native_interval(interval),
                "startTime": start_ms,
                "endTime": end_ms,
                "limit": limit,
            },
        )
        return [
            ProviderCandle(
                open_time=int(row[0]),
                open=float(row[1]),
                high=float(row[2]),
                low=float(row[3]),
                close=float(row[4]),
                volume=float(row[5]),
                quote_volume=float(row[7]),
                trades=int(row[8]),
            )
            for row in rows
        ]


def _int_or_none(value: object) -> int | None:
    try:
        parsed = int(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    return parsed if parsed > 0 else None
