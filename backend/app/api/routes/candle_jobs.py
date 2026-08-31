"""Progress-aware background candle download jobs."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.schemas.candle_job import BatchJobIn, BatchJobOut, CandleJobIn, CandleJobOut
from app.services.candle_jobs import batch_manager, manager

router = APIRouter(prefix="/candle-jobs", tags=["candles"])


@router.post("", response_model=CandleJobOut, status_code=status.HTTP_202_ACCEPTED)
async def start_candle_job(payload: CandleJobIn) -> CandleJobOut:
    return manager.start(payload)


@router.post("/batch", response_model=BatchJobOut, status_code=status.HTTP_202_ACCEPTED)
async def start_batch_job(payload: BatchJobIn) -> BatchJobOut:
    return batch_manager.start(payload)


@router.get("/batch/{job_id}", response_model=BatchJobOut)
async def get_batch_job(job_id: str) -> BatchJobOut:
    job = batch_manager.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Batch job not found")
    return job


@router.get("/{job_id}", response_model=CandleJobOut)
async def get_candle_job(job_id: str) -> CandleJobOut:
    job = manager.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Candle job not found")
    return job
