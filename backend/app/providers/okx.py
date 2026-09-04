"""OKX perpetual swaps -- public market endpoints.

Docs: https://www.okx.com/docs-v5/en/#order-book-trading-market-data

`history-candles` only exposes a backward cursor (`after` = strictly older than
the given ts) and caps a page at 100 rows, hence BACKWARD pagination.
"""

from __future__ import annotations

from typing import Any

from app.core.errors import UpstreamError
from app.core.intervals import Interval
from app.providers.base import (
    ExchangeProvider,
    Pagination,
    ProviderCandle,
    SymbolInfo,
    TickerInfo,
)
from app.providers.http import HttpClient

_QUOTE_WHITELIST = {"USDT", "USDC"}


class OkxSwapProvider(ExchangeProvider):
    key = "okx"
    name = "OKX"
    market = "USDT/USDC perpetual swap"
    website = "https://www.okx.com"
    max_candles_per_page = 100
    pagination = Pagination.BACKWARD
    interval_map = {
        Interval.M1: "1m",
        Interval.M3: "3m",
        Interval.M5: "5m",
        Interval.M15: "15m",
        Interval.M30: "30m",
        Interval.H1: "1H",
        Interval.H2: "2H",
        Interval.H4: "4H",
        Interval.H6: "6H",
        Interval.H12: "12H",
        Interval.D1: "1D",
        Interval.W1: "1W",
    }

    def _create_client(self) -> HttpClient:
        return HttpClient("https://www.okx.com")

    async def _data(self, path: str, params: dict[str, Any]) -> list[Any]:
        payload = await self._http.get_json(path, params)
        if str(payload.get("code")) != "0":
            raise UpstreamError(f"OKX error {payload.get('code')}: {payload.get('msg')}")
        return payload.get("data") or []

    async def list_symbols(self) -> list[SymbolInfo]:
        rows = await self._data("/api/v5/public/instruments", {"instType": "SWAP"})
        symbols: list[SymbolInfo] = []
        for item in rows:
            if item.get("state") != "live" or item.get("ctType") != "linear":
                continue
            inst_id: str = item["instId"]
            parts = inst_id.split("-")
            if len(parts) < 3 or parts[1] not in _QUOTE_WHITELIST:
                continue
            base, quote = parts[0], parts[1]
            symbols.append(
                SymbolInfo(
                    symbol=inst_id,
                    display=f"{base}/{quote}",
                    base=base,
                    quote=quote,
                    price_precision=_tick_precision(item.get("tickSz")),
                    listed_at=_int_or_none(item.get("listTime")),
                )
            )
        return symbols

    async def fetch_tickers(self) -> list[TickerInfo]:
        rows = await self._data("/api/v5/market/tickers", {"instType": "SWAP"})
        tickers: list[TickerInfo] = []
        for row in rows:
            last = _float_or_none(row.get("last"))
            opening = _float_or_none(row.get("open24h"))
            if not row.get("instId") or last is None:
                continue
            change = ((last - opening) / opening * 100) if opening else 0.0
            tickers.append(
                TickerInfo(
                    symbol=row["instId"],
                    last=last,
                    change_24h_pct=change,
                    volume_24h=_float_or_none(row.get("volCcy24h")),
                    high_24h=_float_or_none(row.get("high24h")),
                    low_24h=_float_or_none(row.get("low24h")),
                )
            )
        return tickers

    async def _fetch_page(
        self,
        symbol: str,
        interval: Interval,
        *,
        start_ms: int,
        end_ms: int,
        limit: int,
    ) -> list[ProviderCandle]:
        rows = await self._data(
            "/api/v5/market/history-candles",
            {
                "instId": symbol,
                "bar": self.native_interval(interval),
                # `after` is exclusive -- shift by 1ms to keep end_ms inclusive.
                "after": end_ms + 1,
                "limit": min(limit, self.max_candles_per_page),
            },
        )
        return [
            ProviderCandle(
                open_time=int(row[0]),
                open=float(row[1]),
                high=float(row[2]),
                low=float(row[3]),
                close=float(row[4]),
                # row[5] is contract count; row[6] is the base-currency amount.
                volume=float(row[6]),
                quote_volume=float(row[7]),
            )
            for row in rows
        ]


def _tick_precision(tick_size: object) -> int | None:
    """ "0.001" -> 3 decimal places."""
    if not isinstance(tick_size, str) or "." not in tick_size:
        return 0 if isinstance(tick_size, str) and tick_size.isdigit() else None
    return len(tick_size.split(".")[1].rstrip("0")) or 0


def _int_or_none(value: object) -> int | None:
    try:
        parsed = int(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    return parsed if parsed > 0 else None


def _float_or_none(value: object) -> float | None:
    try:
        return float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
