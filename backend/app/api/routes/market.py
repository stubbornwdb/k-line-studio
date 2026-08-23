"""Live ticker snapshots, rankings and monitor lists."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query

from app.api.deps import DbSession
from app.schemas.market import MarketOverviewOut
from app.services.market import market_service

router = APIRouter(prefix="/market", tags=["market"])


@router.get("/overview", response_model=MarketOverviewOut)
async def get_market_overview(
    session: DbSession,
    exchange: str,
    symbol: Annotated[str | None, Query()] = None,
) -> MarketOverviewOut:
    return await market_service.overview(session, exchange, symbol)
