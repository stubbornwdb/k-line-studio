"""Shared FastAPI dependencies."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ValidationError
from app.core.intervals import Interval
from app.core.timeutil import now_ms, parse_time
from app.db.session import get_db

DbSession = Annotated[AsyncSession, Depends(get_db)]

_DEFAULT_LOOKBACK_BARS = 500


def interval_param(
    interval: Annotated[str, Query(description="Canonical interval, e.g. 1m/1h/1d")] = "1h",
) -> Interval:
    try:
        return Interval(interval)
    except ValueError as exc:
        allowed = ", ".join(i.value for i in Interval)
        raise ValidationError(f"Unknown interval {interval!r}. Allowed: {allowed}") from exc


IntervalDep = Annotated[Interval, Depends(interval_param)]


class TimeWindow:
    """Resolved [start, end] window in epoch ms.

    Accepts ISO-8601 or epoch (s/ms). Missing values default to "the last
    `_DEFAULT_LOOKBACK_BARS` bars up to now", so the API is usable without
    picking dates.
    """

    def __init__(self, start: int, end: int) -> None:
        self.start = start
        self.end = end


def time_window(
    interval: IntervalDep,
    start: Annotated[str | None, Query(description="ISO-8601 or epoch ms")] = None,
    end: Annotated[str | None, Query(description="ISO-8601 or epoch ms")] = None,
) -> TimeWindow:
    end_ms = parse_time(end) or now_ms()
    start_ms = parse_time(start)
    if start_ms is None:
        start_ms = end_ms - _DEFAULT_LOOKBACK_BARS * interval.ms
    if start_ms >= end_ms:
        raise ValidationError("`start` must be earlier than `end`")
    return TimeWindow(start_ms, end_ms)


TimeWindowDep = Annotated[TimeWindow, Depends(time_window)]
