"""Review notes."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query, status

from app.api.deps import DbSession
from app.core.timeutil import parse_time
from app.schemas.note import NoteCreate, NoteOut, NoteUpdate
from app.services.notes import NoteService

router = APIRouter(prefix="/notes", tags=["notes"])


@router.get("", response_model=list[NoteOut])
async def list_notes(
    session: DbSession,
    exchange: str | None = None,
    symbol: str | None = None,
    interval: str | None = None,
    start: Annotated[str | None, Query(description="ISO-8601 or epoch ms")] = None,
    end: Annotated[str | None, Query(description="ISO-8601 or epoch ms")] = None,
    limit: Annotated[int, Query(ge=1, le=2000)] = 500,
) -> list[NoteOut]:
    return await NoteService(session).list_notes(
        exchange=exchange,
        symbol=symbol,
        interval=interval,
        start_ms=parse_time(start),
        end_ms=parse_time(end),
        limit=limit,
    )


@router.post("", response_model=NoteOut, status_code=status.HTTP_201_CREATED)
async def create_note(session: DbSession, payload: NoteCreate) -> NoteOut:
    return await NoteService(session).create(payload)


@router.patch("/{note_id}", response_model=NoteOut)
async def update_note(session: DbSession, note_id: int, payload: NoteUpdate) -> NoteOut:
    return await NoteService(session).update(note_id, payload)


@router.delete("/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_note(session: DbSession, note_id: int) -> None:
    await NoteService(session).delete(note_id)
