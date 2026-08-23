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
