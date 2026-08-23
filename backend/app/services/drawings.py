"""Chart drawing CRUD."""

from __future__ import annotations

from sqlalchemy import delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError
from app.core.timeutil import now_ms
from app.db.models import Drawing
from app.schemas.drawing import DrawingCreate, DrawingOut, DrawingUpdate


class DrawingService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_drawings(
        self,
        *,
        exchange: str | None = None,
        symbol: str | None = None,
        interval: str | None = None,
        limit: int = 500,
    ) -> list[DrawingOut]:
        stmt = select(Drawing).order_by(Drawing.id)
        if exchange:
            stmt = stmt.where(Drawing.exchange == exchange)
        if symbol:
            stmt = stmt.where(Drawing.symbol == symbol)
        if interval:
            # A drawing without an interval belongs to every timeframe.
            stmt = stmt.where(or_(Drawing.interval == interval, Drawing.interval.is_(None)))

        rows = (await self._session.execute(stmt.limit(limit))).scalars()
        return [DrawingOut.from_row(row) for row in rows]

    async def create(self, payload: DrawingCreate) -> DrawingOut:
        stamp = now_ms()
        row = Drawing(
            exchange=payload.exchange,
            symbol=payload.symbol,
            interval=payload.interval,
            kind=payload.kind,
            t1=payload.t1,
            p1=payload.p1,
            t2=payload.t2,
            p2=payload.p2,
            color=payload.color,
            width=payload.width,
            style=payload.style,
            label=payload.label,
            created_at=stamp,
            updated_at=stamp,
        )
        self._session.add(row)
        await self._session.flush()
        return DrawingOut.from_row(row)

    async def update(self, drawing_id: int, payload: DrawingUpdate) -> DrawingOut:
        row = await self._get(drawing_id)
        for field, value in payload.model_dump(exclude_unset=True).items():
            setattr(row, field, value)
        row.updated_at = now_ms()
        await self._session.flush()
        return DrawingOut.from_row(row)

    async def delete(self, drawing_id: int) -> None:
        await self._get(drawing_id)
        await self._session.execute(delete(Drawing).where(Drawing.id == drawing_id))

    async def clear(self, exchange: str, symbol: str) -> int:
        """Wipe every drawing on one symbol -- the toolbar's "clear" action."""
        result = await self._session.execute(
            delete(Drawing).where(Drawing.exchange == exchange, Drawing.symbol == symbol)
        )
        return int(result.rowcount or 0)

    async def _get(self, drawing_id: int) -> Drawing:
        row = await self._session.get(Drawing, drawing_id)
        if row is None:
            raise NotFoundError(f"Drawing {drawing_id} does not exist")
        return row
