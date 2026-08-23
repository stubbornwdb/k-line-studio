"""Review notes ("复盘笔记") CRUD."""

from __future__ import annotations

from sqlalchemy import delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError
from app.core.timeutil import now_ms
from app.db.models import Note
from app.schemas.note import NoteCreate, NoteOut, NoteUpdate


class NoteService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_notes(
        self,
        *,
        exchange: str | None = None,
        symbol: str | None = None,
        interval: str | None = None,
        start_ms: int | None = None,
        end_ms: int | None = None,
        limit: int = 500,
    ) -> list[NoteOut]:
        stmt = select(Note).order_by(Note.time_ms)
        if exchange:
            stmt = stmt.where(Note.exchange == exchange)
        if symbol:
            stmt = stmt.where(Note.symbol == symbol)
        if interval:
            # A note without an interval belongs to every timeframe.
            stmt = stmt.where(or_(Note.interval == interval, Note.interval.is_(None)))
        if start_ms is not None:
            stmt = stmt.where(Note.time_ms >= start_ms)
        if end_ms is not None:
            stmt = stmt.where(Note.time_ms <= end_ms)

        rows = (await self._session.execute(stmt.limit(limit))).scalars()
        return [NoteOut.from_row(row) for row in rows]

    async def create(self, payload: NoteCreate) -> NoteOut:
        stamp = now_ms()
        row = Note(
            exchange=payload.exchange,
            symbol=payload.symbol,
            interval=payload.interval,
            time_ms=payload.time_ms,
            price=payload.price,
            title=payload.title,
            body=payload.body,
            kind=payload.kind,
            color=payload.color,
            tags=",".join(payload.tags),
            created_at=stamp,
            updated_at=stamp,
        )
        self._session.add(row)
        await self._session.flush()
        return NoteOut.from_row(row)

    async def update(self, note_id: int, payload: NoteUpdate) -> NoteOut:
        row = await self._get(note_id)
        changes = payload.model_dump(exclude_unset=True)
        if "tags" in changes and changes["tags"] is not None:
            changes["tags"] = ",".join(changes["tags"])
        for field, value in changes.items():
            setattr(row, field, value)
        row.updated_at = now_ms()
        await self._session.flush()
        return NoteOut.from_row(row)

    async def delete(self, note_id: int) -> None:
        await self._get(note_id)
        await self._session.execute(delete(Note).where(Note.id == note_id))

    async def _get(self, note_id: int) -> Note:
        row = await self._session.get(Note, note_id)
        if row is None:
            raise NotFoundError(f"Note {note_id} does not exist")
        return row
