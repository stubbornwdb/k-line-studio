"""Review-note payloads."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.db.models import Note

NoteKind = Literal["long", "short", "observation"]


class NoteBase(BaseModel):
    time_ms: int = Field(description="Anchor timestamp on the chart, epoch ms")
    price: float | None = None
    title: str = Field(min_length=1, max_length=200)
    body: str = ""
    kind: NoteKind = "observation"
    color: str | None = Field(default=None, max_length=16)
    tags: list[str] = Field(default_factory=list)

    @field_validator("tags", mode="before")
    @classmethod
    def _split_tags(cls, value: object) -> object:
        if isinstance(value, str):
            return [t.strip() for t in value.split(",") if t.strip()]
        return value


class NoteCreate(NoteBase):
    exchange: str
    symbol: str
    interval: str | None = None


class NoteUpdate(BaseModel):
    """All fields optional -- only what is sent gets written."""

    model_config = ConfigDict(extra="forbid")

    time_ms: int | None = None
    price: float | None = None
    title: str | None = Field(default=None, min_length=1, max_length=200)
    body: str | None = None
    kind: NoteKind | None = None
    color: str | None = None
    tags: list[str] | None = None
    interval: str | None = None


class NoteOut(NoteBase):
    id: int
    exchange: str
    symbol: str
    interval: str | None
    created_at: int
    updated_at: int

    @classmethod
    def from_row(cls, row: Note) -> NoteOut:
        return cls(
            id=row.id,
            exchange=row.exchange,
            symbol=row.symbol,
            interval=row.interval,
            time_ms=row.time_ms,
            price=row.price,
            title=row.title,
            body=row.body,
            kind=row.kind,  # type: ignore[arg-type]
            color=row.color,
            tags=[t for t in row.tags.split(",") if t],
            created_at=row.created_at,
            updated_at=row.updated_at,
        )
