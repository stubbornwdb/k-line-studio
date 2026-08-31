"""Live ticker snapshots, rankings and monitor lists."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query

from app.api.deps import DbSession
from app.schemas.market import MarketListingPageOut, MarketOverviewOut
from app.services.market import market_service

router = APIRouter(prefix="/market", tags=["market"])


@router.get("/overview", response_model=MarketOverviewOut)
async def get_market_overview(
    session: DbSession,
    exchange: str,
    symbol: Annotated[str | None, Query()] = None,
    new_listing_days: Annotated[int, Query(ge=1, le=730)] = 365,
) -> MarketOverviewOut:
    return await market_service.overview(
        session, exchange, symbol, new_listing_days=new_listing_days
    )


@router.get("/new-listings", response_model=MarketListingPageOut)
async def get_new_listings(
    exchange: str,
    q: Annotated[str, Query(alias="q")] = "",
    cursor: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    days: Annotated[int, Query(ge=1, le=730)] = 365,
    sort: Annotated[str, Query()] = "time",
) -> MarketListingPageOut:
    return await market_service.new_listings_page(
        exchange,
        query=q,
        cursor=cursor,
        limit=limit,
        days=days,
        sort=sort,
    )
