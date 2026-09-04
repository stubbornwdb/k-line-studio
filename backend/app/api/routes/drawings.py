"""Chart drawings (trend lines, horizontal levels)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query, status

from app.api.deps import DbSession
from app.schemas.drawing import DrawingCreate, DrawingOut, DrawingUpdate
from app.services.drawings import DrawingService

router = APIRouter(prefix="/drawings", tags=["drawings"])


@router.get("", response_model=list[DrawingOut])
async def list_drawings(
    session: DbSession,
    exchange: str | None = None,
    symbol: str | None = None,
    interval: Annotated[
        str | None, Query(description="Also returns all-timeframe drawings")
    ] = None,
    limit: Annotated[int, Query(ge=1, le=2000)] = 500,
) -> list[DrawingOut]:
    return await DrawingService(session).list_drawings(
        exchange=exchange, symbol=symbol, interval=interval, limit=limit
    )


@router.post("", response_model=DrawingOut, status_code=status.HTTP_201_CREATED)
async def create_drawing(session: DbSession, payload: DrawingCreate) -> DrawingOut:
    return await DrawingService(session).create(payload)


@router.patch("/{drawing_id}", response_model=DrawingOut)
async def update_drawing(session: DbSession, drawing_id: int, payload: DrawingUpdate) -> DrawingOut:
    return await DrawingService(session).update(drawing_id, payload)


@router.delete("/{drawing_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_drawing(session: DbSession, drawing_id: int) -> None:
    await DrawingService(session).delete(drawing_id)


@router.delete("", response_model=dict[str, int])
async def clear_drawings(session: DbSession, exchange: str, symbol: str) -> dict[str, int]:
    return {"deleted": await DrawingService(session).clear(exchange, symbol)}
