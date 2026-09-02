"""Candle series + local-cache management."""

from __future__ import annotations

import csv
import io
from typing import Annotated

from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse

from app.api.deps import DbSession, IntervalDep, TimeWindowDep, interval_param
from app.core.intervals import Interval
from app.core.timeutil import to_datetime
from app.schemas.candle import CandleSeriesOut, FirstCandleOut
from app.services.candles import CandleService

router = APIRouter(tags=["candles"])

ExchangeQuery = Annotated[str, Query(description="Exchange key, e.g. binance")]
SymbolQuery = Annotated[str, Query(description="Native symbol, e.g. BTCUSDT")]
RefreshQuery = Annotated[bool, Query(description="Re-download the range, ignoring cache")]


@router.get("/candles", response_model=CandleSeriesOut)
async def get_candles(
    session: DbSession,
    exchange: ExchangeQuery,
    symbol: SymbolQuery,
    interval: IntervalDep,
    window: TimeWindowDep,
    refresh: RefreshQuery = False,
) -> CandleSeriesOut:
    service = CandleService(session)
    return await service.get_series(
        exchange, symbol, interval, window.start, window.end, refresh=refresh
    )


@router.get("/candles/first", response_model=FirstCandleOut)
async def get_first_candle(
    session: DbSession,
    exchange: ExchangeQuery,
    symbol: SymbolQuery,
    interval: IntervalDep,
) -> FirstCandleOut:
    first = await CandleService(session).first_candle_time(exchange, symbol, interval)
    return FirstCandleOut(exchange=exchange, symbol=symbol, interval=interval.value, time=first)


@router.get("/candles/export")
async def export_candles(
    session: DbSession,
    exchange: ExchangeQuery,
    symbol: SymbolQuery,
    interval: IntervalDep,
    window: TimeWindowDep,
) -> StreamingResponse:
    """Same data as /candles, as a CSV download."""
    service = CandleService(session)
    series = await service.get_series(exchange, symbol, interval, window.start, window.end)

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        ["open_time_ms", "open_time_utc", "open", "high", "low", "close", "volume", "quote_volume"]
    )
    for candle in series.candles:
        writer.writerow(
            [
                candle.t,
                to_datetime(candle.t).isoformat(),
                candle.o,
                candle.h,
                candle.l,
                candle.c,
                candle.v,
                candle.q if candle.q is not None else "",
            ]
        )
    buffer.seek(0)

    filename = f"{exchange}_{symbol}_{interval.value}.csv"
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"content-disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/storage/series")
async def get_stored_series(session: DbSession) -> list[dict[str, object]]:
    return await CandleService(session).stored_series()


@router.delete("/storage/series")
async def delete_stored_series(
    session: DbSession,
    exchange: ExchangeQuery,
    symbol: SymbolQuery,
    interval: Annotated[str | None, Query(description="Omit to drop every timeframe")] = None,
) -> dict[str, int]:
    parsed: Interval | None = interval_param(interval) if interval else None
    removed = await CandleService(session).drop_series(exchange, symbol, parsed)
    return {"deleted": removed}
