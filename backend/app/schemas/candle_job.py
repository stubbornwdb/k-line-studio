"""Background candle download job payloads."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.candle import CandleSeriesOut

JobStatus = Literal["queued", "running", "completed", "failed"]


class CandleJobIn(BaseModel):
    exchange: str
    symbol: str
    interval: str
    start: int
    end: int
    refresh: bool = False


class BatchTaskIn(BaseModel):
    symbol: str
    interval: str


class BatchJobIn(BaseModel):
    exchange: str
    # Legacy callers may still provide an explicit symbol list. The monitor
    # sends filters instead so the backend can resolve the complete catalog.
    symbols: list[str] = Field(default_factory=list)
    intervals: list[str] = Field(default_factory=list)
    range_days: int = 365
    listing_query: str = ""
    listing_days: int | None = Field(default=None, ge=1, le=1095)
    listing_sort: Literal["time", "change", "volume"] = "time"
    items: list[BatchTaskIn] | None = None


class BatchItemStatus(BaseModel):
    symbol: str
    interval: str
    status: JobStatus
    fetched: int = 0
    attempts: int = 0
    error: str | None = None


class BatchJobOut(BaseModel):
    id: str
    status: JobStatus
    exchange: str
    total: int
    completed: int
    failed: int
    items: list[BatchItemStatus]
    created_at: int
    updated_at: int


class CandleJobOut(BaseModel):
    id: str
    status: JobStatus
    exchange: str
    symbol: str
    interval: str
    start: int
    end: int
    stage: str
    message: str
    progress: float = Field(ge=0, le=1)
    page: int = 0
    pages: int = 0
    fetched: int = 0
    expected: int = 0
    gap: int = 0
    gaps: int = 0
    created_at: int
    updated_at: int
    error: str | None = None
    result: CandleSeriesOut | None = None
