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
from app.schemas.candle_job import CandleJobIn, CandleJobOut, JobStatus
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
