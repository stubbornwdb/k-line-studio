"""Pinned exchange/symbol pairs."""

from __future__ import annotations

from fastapi import APIRouter, status
from pydantic import BaseModel
from sqlalchemy import delete, select

from app.api.deps import DbSession
from app.core.timeutil import now_ms
from app.db.models import Watchlist

router = APIRouter(prefix="/watchlist", tags=["watchlist"])


class WatchlistIn(BaseModel):
    exchange: str
    symbol: str


class WatchlistOut(WatchlistIn):
    id: int
    created_at: int


@router.get("", response_model=list[WatchlistOut])
async def list_watchlist(session: DbSession) -> list[WatchlistOut]:
    rows = (
        await session.execute(select(Watchlist).order_by(Watchlist.created_at.desc()))
    ).scalars()
    return [
        WatchlistOut(id=r.id, exchange=r.exchange, symbol=r.symbol, created_at=r.created_at)
        for r in rows
    ]


@router.post("", response_model=WatchlistOut, status_code=status.HTTP_201_CREATED)
async def add_watchlist(session: DbSession, payload: WatchlistIn) -> WatchlistOut:
    existing = (
        await session.execute(
            select(Watchlist).where(
                Watchlist.exchange == payload.exchange, Watchlist.symbol == payload.symbol
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        return WatchlistOut(
            id=existing.id,
            exchange=existing.exchange,
            symbol=existing.symbol,
            created_at=existing.created_at,
        )

    row = Watchlist(exchange=payload.exchange, symbol=payload.symbol, created_at=now_ms())
    session.add(row)
    await session.flush()
    return WatchlistOut(
        id=row.id, exchange=row.exchange, symbol=row.symbol, created_at=row.created_at
    )


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_watchlist(session: DbSession, item_id: int) -> None:
    await session.execute(delete(Watchlist).where(Watchlist.id == item_id))
