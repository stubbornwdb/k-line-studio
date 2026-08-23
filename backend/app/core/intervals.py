"""Canonical K-line intervals shared by every provider.

Providers translate these into their own vendor codes; everything inside the
application (DB rows, API payloads, gap math) speaks only `Interval`.
"""

from __future__ import annotations

from enum import StrEnum

_MINUTE = 60_000
_HOUR = 60 * _MINUTE
_DAY = 24 * _HOUR
# 1970-01-05 was the first Monday after the epoch.
_WEEK_ORIGIN_MS = 4 * _DAY


class Interval(StrEnum):
    M1 = "1m"
    M3 = "3m"
    M5 = "5m"
    M15 = "15m"
    M30 = "30m"
    H1 = "1h"
    H2 = "2h"
    H4 = "4h"
    H6 = "6h"
    H12 = "12h"
    D1 = "1d"
    W1 = "1w"

    @property
    def ms(self) -> int:
        """Duration of one candle in milliseconds."""
        return _INTERVAL_MS[self]

    @property
    def seconds(self) -> int:
        return self.ms // 1000

    def floor(self, timestamp_ms: int) -> int:
        """Open time of the candle containing `timestamp_ms`.

        Weekly candles are aligned to Monday 00:00 UTC (the convention used by
        Binance/Bybit/OKX). The epoch was a Thursday, so the first Monday is at
        +4 days and the modulo has to be taken against that origin.
        """
        origin = _WEEK_ORIGIN_MS if self is Interval.W1 else 0
        return ((timestamp_ms - origin) // self.ms) * self.ms + origin

    def ceil(self, timestamp_ms: int) -> int:
        floored = self.floor(timestamp_ms)
        return floored if floored == timestamp_ms else floored + self.ms

    def last_closed_open_time(self, now_ms: int) -> int:
        """Open time of the most recent *fully closed* candle."""
        return self.floor(now_ms) - self.ms


_INTERVAL_MS: dict[Interval, int] = {
    Interval.M1: _MINUTE,
    Interval.M3: 3 * _MINUTE,
    Interval.M5: 5 * _MINUTE,
    Interval.M15: 15 * _MINUTE,
    Interval.M30: 30 * _MINUTE,
    Interval.H1: _HOUR,
    Interval.H2: 2 * _HOUR,
    Interval.H4: 4 * _HOUR,
    Interval.H6: 6 * _HOUR,
    Interval.H12: 12 * _HOUR,
    Interval.D1: _DAY,
    Interval.W1: 7 * _DAY,
}

ALL_INTERVALS: tuple[Interval, ...] = tuple(Interval)
