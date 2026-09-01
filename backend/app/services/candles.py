"""Candle orchestration: local cache first, exchange only for what is missing."""

from __future__ import annotations

import logging
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass

from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import ValidationError
from app.core.intervals import Interval
from app.core.timeutil import now_ms
from app.db.models import Candle, CandleCoverage
from app.providers.base import ExchangeProvider, FetchProgress, ProviderCandle
from app.providers.registry import get_provider
from app.schemas.candle import CandleOut, CandleSeriesOut, SeriesMeta
from app.services.coverage import CoverageRepository, Range, subtract_ranges

logger = logging.getLogger(__name__)

_UPSERT_CHUNK = 900  # keeps SQLite under its variable limit


@dataclass(slots=True, frozen=True)
class CandleProgress:
    stage: str
    message: str
    progress: float
    page: int
    pages: int
    fetched: int
    expected: int
    gap: int
    gaps: int


ProgressCallback = Callable[[CandleProgress], Awaitable[None]]


@dataclass(slots=True, frozen=True)
class DownloadResult:
    candles: list[ProviderCandle]
    covered_ranges: list[Range]


def _contiguous_ranges(
    candles: list[ProviderCandle], start: int, end: int
) -> list[Range]:
    """Keep returned bounds while treating exchange-side empty bars as covered.

    Providers may legitimately omit intervals with no trades, so internal
    timestamp holes are part of the returned span. A response that stops early
    still leaves its unreturned head or tail uncovered for a later request.
    """
    if not candles:
        return []
    times = sorted({candle.open_time for candle in candles if start <= candle.open_time <= end})
    if not times:
        return []
    return [(times[0], times[-1])]


@dataclass(slots=True, frozen=True)
class SeriesKey:
    exchange: str
    symbol: str
    interval: Interval


class CandleService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._coverage = CoverageRepository(session)

    async def get_series(
        self,
        exchange: str,
        symbol: str,
        interval: Interval,
        start_ms: int,
        end_ms: int,
        *,
        refresh: bool = False,
        on_progress: ProgressCallback | None = None,
    ) -> CandleSeriesOut:
        started = time.perf_counter()
        provider = get_provider(exchange)
        provider.native_interval(interval)  # validates support

        window, truncated = self._normalise_window(interval, start_ms, end_ms)
        start, end = window
        key = SeriesKey(provider.key, symbol, interval)
        expected_bars = (end - start) // interval.ms + 1

        if on_progress is not None:
            await on_progress(
                CandleProgress(
                    stage="checking",
                    message="正在检查本地缓存",
                    progress=0.03,
                    page=0,
                    pages=0,
                    fetched=0,
                    expected=expected_bars,
                    gap=0,
                    gaps=0,
                )
            )

        last_closed = interval.last_closed_open_time(now_ms())
        closed_end = min(end, last_closed)

        fetched = 0
        gaps: list[Range] = []
        downloaded_ranges: list[Range] = []
        if closed_end >= start:
            gaps = await self._pending_gaps(key, (start, closed_end), refresh=refresh)
            missing_expected = sum((gap[1] - gap[0]) // interval.ms + 1 for gap in gaps)
            completed_expected = 0
            for gap_index, gap in enumerate(gaps, start=1):
                gap_expected = (gap[1] - gap[0]) // interval.ms + 1
                fetched_before = fetched

                async def page_progress(
                    update: FetchProgress,
                    *,
                    gap_index: int = gap_index,
                    gap_expected: int = gap_expected,
                    fetched_before: int = fetched_before,
                    completed_expected: int = completed_expected,
                ) -> None:
                    if on_progress is None:
                        return
                    ratio = min(update.page / max(update.estimated_pages, 1), 1.0)
                    completed = completed_expected + int(gap_expected * ratio)
                    overall = 0.05 + 0.88 * (
                        (completed / max(missing_expected, 1)) if missing_expected else 1.0
                    )
                    await on_progress(
                        CandleProgress(
                            stage="downloading",
                            message=f"正在拉取第 {gap_index}/{len(gaps)} 段缺口",
                            progress=min(overall, 0.93),
                            page=update.page,
                            pages=update.estimated_pages,
                            fetched=fetched_before + update.collected_bars,
                            expected=expected_bars,
                            gap=gap_index,
                            gaps=len(gaps),
                        )
                    )

                download = await self._download(
                    provider,
                    key,
                    gap,
                    progress=page_progress if on_progress is not None else None,
                )
                fetched += len(download.candles)
                downloaded_ranges.extend(download.covered_ranges)
                completed_expected += gap_expected
            await self._coverage.record(
                key.exchange, key.symbol, key.interval, downloaded_ranges
            )

        # The forming bar is never "covered"; re-fetch it on every request.
        live_bar = False
        if end > last_closed:
            if on_progress is not None:
                await on_progress(
                    CandleProgress(
                        stage="downloading",
                        message="正在更新最新一根 K 线",
                        progress=0.94,
                        page=0,
                        pages=0,
                        fetched=fetched,
                        expected=expected_bars,
                        gap=len(gaps),
                        gaps=len(gaps),
                    )
                )
            live_start = max(start, last_closed + interval.ms)
            live_download = await self._download(provider, key, (live_start, end))
            fetched += len(live_download.candles)
            live_bar = True

        if on_progress is not None:
            await on_progress(
                CandleProgress(
                    stage="writing",
                    message="正在整理并写入图表数据",
                    progress=0.97,
                    page=0,
                    pages=0,
                    fetched=fetched,
                    expected=expected_bars,
                    gap=len(gaps),
                    gaps=len(gaps),
                )
            )
        rows = await self._load_rows(key, start, end)
        elapsed = int((time.perf_counter() - started) * 1000)
        return CandleSeriesOut(
            exchange=key.exchange,
            symbol=key.symbol,
            interval=key.interval.value,
            start=start,
            end=end,
            count=len(rows),
            meta=SeriesMeta(
                from_cache=max(len(rows) - fetched, 0),
                fetched=fetched,
                gaps_filled=len(gaps),
                live_bar=live_bar,
                truncated=truncated,
                elapsed_ms=elapsed,
            ),
            candles=[CandleOut.from_row(row) for row in rows],
        )

    async def stored_series(self) -> list[dict[str, object]]:
        """Inventory of everything cached locally -- powers the storage panel."""
        stmt = (
            select(
                Candle.exchange,
                Candle.symbol,
                Candle.interval,
                func.count().label("bars"),
                func.min(Candle.open_time).label("first_open"),
                func.max(Candle.open_time).label("last_open"),
            )
            .group_by(Candle.exchange, Candle.symbol, Candle.interval)
            .order_by(func.count().desc())
        )
        rows = (await self._session.execute(stmt)).all()
        return [
            {
                "exchange": row.exchange,
                "symbol": row.symbol,
                "interval": row.interval,
                "bars": row.bars,
                "first_open": row.first_open,
                "last_open": row.last_open,
            }
            for row in rows
        ]

    async def drop_series(self, exchange: str, symbol: str, interval: Interval | None) -> int:
        """Forget a cached series (candles + coverage)."""
        conditions = [Candle.exchange == exchange, Candle.symbol == symbol]
        cov_conditions = [
            CandleCoverage.exchange == exchange,
            CandleCoverage.symbol == symbol,
        ]
        if interval is not None:
            conditions.append(Candle.interval == interval.value)
            cov_conditions.append(CandleCoverage.interval == interval.value)

        result = await self._session.execute(delete(Candle).where(*conditions))
        await self._session.execute(delete(CandleCoverage).where(*cov_conditions))
        return int(result.rowcount or 0)

    # ----------------------------------------------------------------- helpers

    @staticmethod
    def _normalise_window(
        interval: Interval, start_ms: int, end_ms: int
    ) -> tuple[Range, bool]:
        """Snap to bar boundaries and enforce the per-request bar cap."""
        if end_ms <= start_ms:
            raise ValidationError("`end` must be after `start`")
        start = interval.floor(start_ms)
        end = interval.floor(end_ms)
        max_bars = settings.max_candles_per_request
        bars = (end - start) // interval.ms + 1
        if bars > max_bars:
            # Keep the most recent window -- that is what a chart shows first.
            return (end - (max_bars - 1) * interval.ms, end), True
        return (start, end), False

    async def _pending_gaps(
        self, key: SeriesKey, target: Range, *, refresh: bool
    ) -> list[Range]:
        if refresh:
            return [target]
        covered = await self._coverage.load(key.exchange, key.symbol, key.interval)
        return subtract_ranges(target, covered, key.interval.ms)

    async def _download(
        self,
        provider: ExchangeProvider,
        key: SeriesKey,
        window: Range,
        *,
        progress: ProgressCallback | None = None,
    ) -> DownloadResult:
        start, end = window
        if end < start:
            return DownloadResult(candles=[], covered_ranges=[])
        if progress is None:
            candles = await provider.fetch_candles(key.symbol, key.interval, start, end)
        else:
            candles = await provider.fetch_candles(
                key.symbol, key.interval, start, end, progress=progress
            )
        logger.info(
            "fetched %s bars %s %s %s [%s, %s]",
            len(candles),
            key.exchange,
            key.symbol,
            key.interval.value,
            start,
            end,
        )
        await self._upsert(key, candles)
        return DownloadResult(
            candles=candles,
            covered_ranges=_contiguous_ranges(candles, start, end),
        )

    async def _upsert(self, key: SeriesKey, candles: list[ProviderCandle]) -> None:
        if not candles:
            return
        dialect = self._session.bind.dialect.name if self._session.bind else "sqlite"
        insert = pg_insert if dialect == "postgresql" else sqlite_insert

        payload = [
            {
                "exchange": key.exchange,
                "symbol": key.symbol,
                "interval": key.interval.value,
                "open_time": candle.open_time,
                "open": candle.open,
                "high": candle.high,
                "low": candle.low,
                "close": candle.close,
                "volume": candle.volume,
                "quote_volume": candle.quote_volume,
                "trades": candle.trades,
            }
            for candle in candles
        ]

        for offset in range(0, len(payload), _UPSERT_CHUNK):
            chunk = payload[offset : offset + _UPSERT_CHUNK]
            stmt = insert(Candle).values(chunk)
            stmt = stmt.on_conflict_do_update(
                index_elements=["exchange", "symbol", "interval", "open_time"],
                set_={
                    "open": stmt.excluded.open,
                    "high": stmt.excluded.high,
                    "low": stmt.excluded.low,
                    "close": stmt.excluded.close,
                    "volume": stmt.excluded.volume,
                    "quote_volume": stmt.excluded.quote_volume,
                    "trades": stmt.excluded.trades,
                },
            )
            await self._session.execute(stmt)
        await self._session.flush()

    async def _load_rows(self, key: SeriesKey, start: int, end: int) -> list[Candle]:
        stmt = (
            select(Candle)
            .where(
                Candle.exchange == key.exchange,
                Candle.symbol == key.symbol,
                Candle.interval == key.interval.value,
                Candle.open_time >= start,
                Candle.open_time <= end,
            )
            .order_by(Candle.open_time)
        )
        return list((await self._session.execute(stmt)).scalars())
