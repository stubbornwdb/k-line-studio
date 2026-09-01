"""Progress-aware background candle download jobs."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.schemas.candle_job import BatchJobIn, BatchJobOut, CandleJobIn, CandleJobOut
from app.services.candle_jobs import batch_manager, manager
from app.services.market import market_service

router = APIRouter(prefix="/candle-jobs", tags=["candles"])


@router.post("", response_model=CandleJobOut, status_code=status.HTTP_202_ACCEPTED)
async def start_candle_job(payload: CandleJobIn) -> CandleJobOut:
    return manager.start(payload)


@router.post("/batch", response_model=BatchJobOut, status_code=status.HTTP_202_ACCEPTED)
async def start_batch_job(payload: BatchJobIn) -> BatchJobOut:
    if payload.listing_days is not None:
        symbols = await market_service.all_new_listing_symbols(
            payload.exchange,
            query=payload.listing_query,
            days=payload.listing_days,
            sort=payload.listing_sort,
        )
        if not symbols:
            raise HTTPException(status_code=422, detail="没有符合当前筛选条件的次新合约")
        payload = payload.model_copy(update={"symbols": symbols})
    elif payload.items is not None:
        if not payload.items:
            raise HTTPException(status_code=422, detail="没有可执行的批量任务")
    elif not payload.symbols or not payload.intervals:
        raise HTTPException(status_code=422, detail="交易对和 K 线级别不能为空")
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
