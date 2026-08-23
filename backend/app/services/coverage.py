"""Coverage bookkeeping: which candle ranges we already hold locally.

The range algebra is pure and unit-testable; only `CoverageRepository` touches
the database.
"""

from __future__ import annotations

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.intervals import Interval
from app.db.models import CandleCoverage

Range = tuple[int, int]  # inclusive open_time bounds


def merge_ranges(ranges: list[Range], step: int) -> list[Range]:
    """Sort and coalesce overlapping *or adjacent* ranges."""
    if not ranges:
        return []
    merged: list[Range] = []
    for start, end in sorted(ranges):
        if end < start:
            continue
        if merged and start <= merged[-1][1] + step:
            prev_start, prev_end = merged[-1]
            merged[-1] = (prev_start, max(prev_end, end))
        else:
            merged.append((start, end))
    return merged


def subtract_ranges(target: Range, covered: list[Range], step: int) -> list[Range]:
    """Return the parts of `target` not present in `covered`."""
    start, end = target
    if end < start:
        return []
    gaps: list[Range] = []
    cursor = start
    for cov_start, cov_end in merge_ranges(covered, step):
        if cov_end < cursor:
            continue
        if cov_start > end:
            break
        if cov_start > cursor:
            gaps.append((cursor, min(cov_start - step, end)))
        cursor = max(cursor, cov_end + step)
        if cursor > end:
            return gaps
    if cursor <= end:
        gaps.append((cursor, end))
    return gaps


class CoverageRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def load(self, exchange: str, symbol: str, interval: Interval) -> list[Range]:
        stmt = (
            select(CandleCoverage.start_ms, CandleCoverage.end_ms)
            .where(
                CandleCoverage.exchange == exchange,
                CandleCoverage.symbol == symbol,
                CandleCoverage.interval == interval.value,
            )
            .order_by(CandleCoverage.start_ms)
        )
        rows = (await self._session.execute(stmt)).all()
        return [(row[0], row[1]) for row in rows]

    async def record(
        self,
        exchange: str,
        symbol: str,
        interval: Interval,
        new_ranges: list[Range],
    ) -> None:
        """Add ranges and rewrite the series' rows in normalised form."""
        if not new_ranges:
            return
        existing = await self.load(exchange, symbol, interval)
        merged = merge_ranges([*existing, *new_ranges], interval.ms)
        if merged == existing:
            return

        await self._session.execute(
            delete(CandleCoverage).where(
                CandleCoverage.exchange == exchange,
                CandleCoverage.symbol == symbol,
                CandleCoverage.interval == interval.value,
            )
        )
        self._session.add_all(
            [
                CandleCoverage(
                    exchange=exchange,
                    symbol=symbol,
                    interval=interval.value,
                    start_ms=start,
                    end_ms=end,
                )
                for start, end in merged
            ]
        )
        await self._session.flush()
