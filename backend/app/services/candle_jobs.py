"""In-process background candle jobs for progress-aware chart loading."""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from uuid import uuid4

from app.core.intervals import Interval
from app.core.timeutil import now_ms
from app.db.session import get_session_factory
from app.schemas.candle import CandleSeriesOut
from app.schemas.candle_job import (
    BatchItemStatus,
    BatchJobIn,
    BatchJobOut,
    BatchTaskIn,
    CandleJobIn,
    CandleJobOut,
    JobStatus,
)
from app.services.candles import CandleProgress, CandleService

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class _Job:
    id: str
    payload: CandleJobIn
    status: JobStatus = "queued"
    stage: str = "queued"
    message: str = "等待开始"
    progress: float = 0.0
    page: int = 0
    pages: int = 0
    fetched: int = 0
    expected: int = 0
    gap: int = 0
    gaps: int = 0
    created_at: int = 0
    updated_at: int = 0
    error: str | None = None
    result: CandleSeriesOut | None = None
    task: asyncio.Task[None] | None = None


class CandleJobManager:
    def __init__(self) -> None:
        self._jobs: dict[str, _Job] = {}

    def start(self, payload: CandleJobIn) -> CandleJobOut:
        self._prune()
        job_id = uuid4().hex
        stamp = now_ms()
        job = _Job(
            id=job_id,
            payload=payload,
            expected=max(0, (payload.end - payload.start) // _interval_ms(payload.interval) + 1),
            created_at=stamp,
            updated_at=stamp,
        )
        self._jobs[job_id] = job
        job.task = asyncio.create_task(self._run(job), name=f"candle-job-{job_id}")
        return self.snapshot(job)

    def get(self, job_id: str) -> CandleJobOut | None:
        self._prune()
        job = self._jobs.get(job_id)
        return self.snapshot(job) if job else None

    async def _run(self, job: _Job) -> None:
        job.status = "running"
        job.stage = "starting"
        job.message = "正在启动 K 线任务"
        job.updated_at = now_ms()

        async def update(progress: CandleProgress) -> None:
            job.stage = progress.stage
            job.message = progress.message
            job.progress = progress.progress
            job.page = progress.page
            job.pages = progress.pages
            job.fetched = progress.fetched
            job.expected = progress.expected
            job.gap = progress.gap
            job.gaps = progress.gaps
            job.updated_at = now_ms()

        factory = get_session_factory()
        async with factory() as session:
            try:
                service = CandleService(session)
                result = await service.get_series(
                    job.payload.exchange,
                    job.payload.symbol,
                    Interval(job.payload.interval),
                    job.payload.start,
                    job.payload.end,
                    refresh=job.payload.refresh,
                    on_progress=update,
                )
                await session.commit()
                job.result = result
                job.status = "completed"
                job.stage = "complete"
                job.message = "K 线加载完成"
                job.progress = 1.0
                job.updated_at = now_ms()
            except Exception as exc:  # surfaced through the job status endpoint
                await session.rollback()
                job.status = "failed"
                job.stage = "failed"
                job.message = "K 线加载失败"
                job.error = str(exc)
                job.updated_at = now_ms()
                logger.exception("candle job %s failed", job.id)

    @staticmethod
    def snapshot(job: _Job | None) -> CandleJobOut | None:
        if job is None:
            return None
        return CandleJobOut(
            id=job.id,
            status=job.status,
            exchange=job.payload.exchange,
            symbol=job.payload.symbol,
            interval=job.payload.interval,
            start=job.payload.start,
            end=job.payload.end,
            stage=job.stage,
            message=job.message,
            progress=job.progress,
            page=job.page,
            pages=job.pages,
            fetched=job.fetched,
            expected=job.expected,
            gap=job.gap,
            gaps=job.gaps,
            created_at=job.created_at,
            updated_at=job.updated_at,
            error=job.error,
            result=job.result,
        )

    def _prune(self) -> None:
        cutoff = now_ms() - 60 * 60 * 1000
        stale = [
            job_id
            for job_id, job in self._jobs.items()
            if job.updated_at < cutoff and job.status in {"completed", "failed"}
        ]
        for job_id in stale:
            self._jobs.pop(job_id, None)


def _interval_ms(value: str) -> int:
    try:
        return Interval(value).ms
    except ValueError:
        return 1


manager = CandleJobManager()

_BATCH_CONCURRENCY = 3
_BATCH_ITEM_RETRIES = 3
_BATCH_RETRY_BASE_DELAY = 0.5


@dataclass(slots=True)
class _BatchItem:
    symbol: str
    interval: str
    status: JobStatus = "queued"
    fetched: int = 0
    attempts: int = 0
    error: str | None = None
    errors: list[str] | None = None


@dataclass(slots=True)
class _BatchJob:
    id: str
    exchange: str
    items: list[_BatchItem]
    status: JobStatus = "queued"
    created_at: int = 0
    updated_at: int = 0
    task: asyncio.Task[None] | None = None


class BatchJobManager:
    def __init__(self) -> None:
        self._jobs: dict[str, _BatchJob] = {}

    def start(self, payload: BatchJobIn) -> BatchJobOut:
        self._prune()
        job_id = uuid4().hex
        stamp = now_ms()
        requested_items = (
            payload.items
            if payload.items is not None
            else [
                BatchTaskIn(symbol=sym, interval=iv)
                for sym in payload.symbols
                for iv in payload.intervals
            ]
        )
        items = [
            _BatchItem(symbol=item.symbol, interval=item.interval, errors=[])
            for item in requested_items
        ]
        job = _BatchJob(
            id=job_id,
            exchange=payload.exchange,
            items=items,
            created_at=stamp,
            updated_at=stamp,
        )
        self._jobs[job_id] = job
        job.task = asyncio.create_task(
            self._run(job, payload), name=f"batch-job-{job_id}"
        )
        return self._snapshot(job)

    def get(self, job_id: str) -> BatchJobOut | None:
        job = self._jobs.get(job_id)
        return self._snapshot(job) if job else None

    async def _run(self, job: _BatchJob, payload: BatchJobIn) -> None:
        job.status = "running"
        job.updated_at = now_ms()
        now = now_ms()
        end = now
        start = now - payload.range_days * 24 * 60 * 60 * 1000
        sem = asyncio.Semaphore(_BATCH_CONCURRENCY)

        async def run_attempt(item: _BatchItem) -> CandleSeriesOut:
            factory = get_session_factory()
            async with factory() as session:
                try:
                    service = CandleService(session)
                    result = await service.get_series(
                        payload.exchange,
                        item.symbol,
                        Interval(item.interval),
                        start,
                        end,
                    )
                    await session.commit()
                    return result
                except Exception:
                    await session.rollback()
                    raise

        async def fetch_one(item: _BatchItem) -> None:
            async with sem:
                item.status = "running"
                job.updated_at = now_ms()
                for attempt in range(1, _BATCH_ITEM_RETRIES + 1):
                    item.attempts = attempt
                    job.updated_at = now_ms()
                    try:
                        result = await run_attempt(item)
                        item.status = "completed"
                        # count includes cached bars; meta.fetched is this
                        # request's actual exchange download count.
                        item.fetched = result.meta.fetched
                        item.error = None
                        break
                    except Exception as exc:
                        reason = _error_text(exc)
                        if item.errors is not None:
                            item.errors.append(reason)
                        item.error = f"第 {attempt}/{_BATCH_ITEM_RETRIES} 次：{reason}"
                        logger.warning(
                            "batch item %s/%s attempt %s/%s failed: %s",
                            item.symbol,
                            item.interval,
                            attempt,
                            _BATCH_ITEM_RETRIES,
                            exc,
                        )
                        job.updated_at = now_ms()
                        if attempt < _BATCH_ITEM_RETRIES:
                            await asyncio.sleep(
                                _BATCH_RETRY_BASE_DELAY * (2 ** (attempt - 1))
                            )
                else:
                    item.status = "failed"
                    if item.errors:
                        item.error = (
                            f"已重试 {_BATCH_ITEM_RETRIES} 次："
                            + "；".join(item.errors)
                        )
                job.updated_at = now_ms()

        await asyncio.gather(*(fetch_one(item) for item in job.items))
        failed = sum(1 for i in job.items if i.status == "failed")
        job.status = "failed" if failed == len(job.items) else "completed"
        job.updated_at = now_ms()

    @staticmethod
    def _snapshot(job: _BatchJob | None) -> BatchJobOut | None:
        if job is None:
            return None
        completed = sum(1 for i in job.items if i.status == "completed")
        failed = sum(1 for i in job.items if i.status == "failed")
        return BatchJobOut(
            id=job.id,
            status=job.status,
            exchange=job.exchange,
            total=len(job.items),
            completed=completed,
            failed=failed,
            items=[
                BatchItemStatus(
                    symbol=i.symbol,
                    interval=i.interval,
                    status=i.status,
                    fetched=i.fetched,
                    attempts=i.attempts,
                    error=i.error,
                )
                for i in job.items
            ],
            created_at=job.created_at,
            updated_at=job.updated_at,
        )

    def _prune(self) -> None:
        cutoff = now_ms() - 60 * 60 * 1000
        stale = [
            jid for jid, j in self._jobs.items()
            if j.updated_at < cutoff and j.status in {"completed", "failed"}
        ]
        for jid in stale:
            self._jobs.pop(jid, None)


def _error_text(exc: Exception) -> str:
    """Include structured upstream details in the status shown to the user."""
    message = str(getattr(exc, "message", "") or exc)
    detail = getattr(exc, "detail", None)
    if detail is not None and str(detail) not in {"", message}:
        return f"{message} ({detail})"
    return message


batch_manager = BatchJobManager()
