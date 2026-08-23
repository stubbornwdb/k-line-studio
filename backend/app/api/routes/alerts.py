"""Persistent one-shot monitor alerts."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query, status
from sqlalchemy import delete, select

from app.api.deps import DbSession
from app.core.timeutil import now_ms
from app.db.models import PriceAlert
from app.schemas.alert import PriceAlertIn, PriceAlertOut, PriceAlertPatch

router = APIRouter(prefix="/alerts", tags=["monitor"])


@router.get("", response_model=list[PriceAlertOut])
async def list_alerts(
    session: DbSession,
    exchange: Annotated[str | None, Query()] = None,
    symbol: Annotated[str | None, Query()] = None,
) -> list[PriceAlertOut]:
    stmt = select(PriceAlert).order_by(PriceAlert.created_at.desc())
    if exchange:
        stmt = stmt.where(PriceAlert.exchange == exchange)
    if symbol:
        stmt = stmt.where(PriceAlert.symbol == symbol)
    rows = (await session.execute(stmt)).scalars()
    return [_to_out(row) for row in rows]


@router.post("", response_model=PriceAlertOut, status_code=status.HTTP_201_CREATED)
async def create_alert(session: DbSession, payload: PriceAlertIn) -> PriceAlertOut:
    stamp = now_ms()
    row = PriceAlert(
        **payload.model_dump(),
        enabled=True,
        triggered_at=None,
        created_at=stamp,
        updated_at=stamp,
    )
    session.add(row)
    await session.flush()
    return _to_out(row)


@router.patch("/{alert_id}", response_model=PriceAlertOut)
async def update_alert(
    session: DbSession, alert_id: int, payload: PriceAlertPatch
) -> PriceAlertOut:
    row = await session.get(PriceAlert, alert_id)
    if row is None:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Alert not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, key, value)
    if payload.enabled is True:
        row.triggered_at = None
    row.updated_at = now_ms()
    await session.flush()
    return _to_out(row)


@router.delete("/{alert_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_alert(session: DbSession, alert_id: int) -> None:
    await session.execute(delete(PriceAlert).where(PriceAlert.id == alert_id))


def _to_out(row: PriceAlert) -> PriceAlertOut:
    return PriceAlertOut(
        id=row.id,
        exchange=row.exchange,
        symbol=row.symbol,
        kind=row.kind,
        direction=row.direction,
        threshold=row.threshold,
        enabled=row.enabled,
        triggered_at=row.triggered_at,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )
