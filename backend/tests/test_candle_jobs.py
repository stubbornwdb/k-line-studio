"""Retry and task selection behaviour for background batch candle jobs."""

from __future__ import annotations

import pytest

from app.core.intervals import Interval
from app.schemas.candle import CandleSeriesOut, SeriesMeta
from app.schemas.candle_job import BatchJobIn, BatchTaskIn
from app.services import candle_jobs as jobs_module
from app.services.candle_jobs import BatchJobManager


class FakeSession:
    def __init__(self) -> None:
        self.commits = 0
        self.rollbacks = 0

    async def commit(self) -> None:
        self.commits += 1

    async def rollback(self) -> None:
        self.rollbacks += 1

    async def __aenter__(self) -> FakeSession:
        return self

    async def __aexit__(self, *_args: object) -> None:
        return None


class FakeFactory:
    def __init__(self) -> None:
        self.sessions: list[FakeSession] = []

    def __call__(self) -> FakeSession:
        session = FakeSession()
        self.sessions.append(session)
        return session


def series_result(fetched: int = 4) -> CandleSeriesOut:
    return CandleSeriesOut(
        exchange="fake",
        symbol="BTRUSDT",
        interval=Interval.H4.value,
        start=1,
        end=2,
        count=fetched,
        meta=SeriesMeta(
            from_cache=0,
            fetched=fetched,
            gaps_filled=1,
            live_bar=False,
            truncated=False,
            elapsed_ms=1,
        ),
        candles=[],
    )


async def finish_job(
    monkeypatch: pytest.MonkeyPatch,
    payload: BatchJobIn,
    outcomes: list[object],
):
    factory = FakeFactory()
    calls: list[tuple[str, str]] = []

    class FakeCandleService:
        def __init__(self, _session: FakeSession) -> None:
            pass

        async def get_series(
            self,
            _exchange: str,
            symbol: str,
            interval: Interval,
            _start: int,
            _end: int,
        ) -> CandleSeriesOut:
            calls.append((symbol, interval.value))
            outcome = outcomes.pop(0)
            if isinstance(outcome, Exception):
                raise outcome
            return outcome

    monkeypatch.setattr(jobs_module, "get_session_factory", lambda: factory)
    monkeypatch.setattr(jobs_module, "CandleService", FakeCandleService)
    monkeypatch.setattr(jobs_module, "_BATCH_RETRY_BASE_DELAY", 0)

    manager = BatchJobManager()
    initial = manager.start(payload)
    job = manager._jobs[initial.id]
    assert job.task is not None
    await job.task
    return manager.get(initial.id), calls, factory


@pytest.mark.asyncio
async def test_batch_item_retries_twice_then_completes(monkeypatch: pytest.MonkeyPatch):
    result, calls, factory = await finish_job(
        monkeypatch,
        BatchJobIn(exchange="fake", symbols=["BTRUSDT"], intervals=["4h"]),
        [RuntimeError("temporary 1"), RuntimeError("temporary 2"), series_result()],
    )

    assert result is not None
    assert result.status == "completed"
    assert result.completed == 1
    assert result.failed == 0
    assert result.items[0].attempts == 3
    assert result.items[0].fetched == 4
    assert result.items[0].error is None
    assert len(calls) == 3
    assert len(factory.sessions) == 3
    assert [session.rollbacks for session in factory.sessions] == [1, 1, 0]


@pytest.mark.asyncio
async def test_batch_item_reports_all_attempt_errors(monkeypatch: pytest.MonkeyPatch):
    result, calls, _factory = await finish_job(
        monkeypatch,
        BatchJobIn(exchange="fake", symbols=["BTRUSDT"], intervals=["4h"]),
        [RuntimeError("network"), RuntimeError("rate limit"), RuntimeError("timeout")],
    )

    assert result is not None
    assert result.status == "failed"
    assert result.completed == 0
    assert result.failed == 1
    assert result.items[0].attempts == 3
    assert "已重试 3 次" in (result.items[0].error or "")
    assert all(
        reason in (result.items[0].error or "")
        for reason in ("network", "rate limit", "timeout")
    )
    assert len(calls) == 3


@pytest.mark.asyncio
async def test_explicit_items_do_not_expand_to_symbols_or_intervals(
    monkeypatch: pytest.MonkeyPatch,
):
    result, calls, _factory = await finish_job(
        monkeypatch,
        BatchJobIn(
            exchange="fake",
            symbols=["OTHERUSDT"],
            intervals=["1d"],
            items=[BatchTaskIn(symbol="BTRUSDT", interval="4h")],
        ),
        [series_result()],
    )

    assert result is not None
    assert result.total == 1
    assert calls == [("BTRUSDT", "4h")]
