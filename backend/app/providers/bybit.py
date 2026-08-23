"""Bybit v5 linear (USDT/USDC) perpetuals -- public market endpoints.

Docs: https://bybit-exchange.github.io/docs/v5/market/kline

Bybit anchors a kline page at the *end* of the window and answers newest-first,
so this provider paginates backwards.
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

_CATEGORY = "linear"


class BybitFuturesProvider(ExchangeProvider):
    key = "bybit"
    name = "Bybit"
    market = "USDT/USDC perpetual"
    website = "https://www.bybit.com"
    max_candles_per_page = 1000
    pagination = Pagination.BACKWARD
    interval_map = {
        Interval.M1: "1",
        Interval.M3: "3",
        Interval.M5: "5",
        Interval.M15: "15",
        Interval.M30: "30",
        Interval.H1: "60",
        Interval.H2: "120",
        Interval.H4: "240",
        Interval.H6: "360",
        Interval.H12: "720",
        Interval.D1: "D",
        Interval.W1: "W",
    }

    def _create_client(self) -> HttpClient:
        return HttpClient("https://api.bybit.com")

    async def _result(self, path: str, params: dict[str, Any]) -> dict[str, Any]:
        payload = await self._http.get_json(path, params)
        if str(payload.get("retCode")) != "0":
            raise UpstreamError(
                f"Bybit error {payload.get('retCode')}: {payload.get('retMsg')}"
            )
        return payload.get("result") or {}

    async def list_symbols(self) -> list[SymbolInfo]:
        symbols: list[SymbolInfo] = []
        cursor: str | None = None
        for _ in range(20):  # 1000 per page is plenty; cap the loop anyway
            result = await self._result(
                "/v5/market/instruments-info",
                {"category": _CATEGORY, "limit": 1000, "cursor": cursor},
            )
            for item in result.get("list", []):
                if item.get("status") != "Trading":
                    continue
                if "Perpetual" not in (item.get("contractType") or ""):
                    continue
                base, quote = item["baseCoin"], item["quoteCoin"]
                symbols.append(
                    SymbolInfo(
                        symbol=item["symbol"],
                        display=f"{base}/{quote}",
                        base=base,
                        quote=quote,
                        price_precision=_scale(item.get("priceScale")),
                        listed_at=_int_or_none(item.get("launchTime")),
                    )
                )
            cursor = result.get("nextPageCursor") or None
            if not cursor:
                break
        return symbols

    async def fetch_tickers(self) -> list[TickerInfo]:
        result = await self._result(
            "/v5/market/tickers", {"category": _CATEGORY}
        )
        return [
            TickerInfo(
                symbol=row["symbol"],
                last=float(row["lastPrice"]),
                change_24h_pct=float(row.get("price24hPcnt") or 0) * 100,
                volume_24h=_float_or_none(row.get("turnover24h")),
                high_24h=_float_or_none(row.get("highPrice24h")),
                low_24h=_float_or_none(row.get("lowPrice24h")),
            )
            for row in result.get("list", [])
            if row.get("symbol") and row.get("lastPrice")
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
        result = await self._result(
            "/v5/market/kline",
            {
                "category": _CATEGORY,
                "symbol": symbol,
                "interval": self.native_interval(interval),
                "start": start_ms,
                "end": end_ms,
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
                quote_volume=float(row[6]),
            )
            for row in result.get("list", [])
        ]


def _scale(value: object) -> int | None:
    try:
        return int(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None


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
