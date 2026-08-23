"""Chart drawing payloads."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.db.models import Drawing

DrawingKind = Literal["trendline", "horizontal"]
DrawingStyle = Literal["solid", "dashed"]


class DrawingBase(BaseModel):
    kind: DrawingKind
    t1: int | None = Field(default=None, description="Anchor A time, epoch ms")
    p1: float = Field(description="Anchor A price")
    t2: int | None = Field(default=None, description="Anchor B time, epoch ms")
    p2: float | None = Field(default=None, description="Anchor B price")

    color: str | None = Field(default=None, max_length=16)
    width: int = Field(default=1, ge=1, le=5)
    style: DrawingStyle = "solid"
    label: str = Field(default="", max_length=120)

    @model_validator(mode="after")
    def _check_anchors(self) -> DrawingBase:
        """A trend line needs both ends; a horizontal line needs only a price."""
        if self.kind == "trendline" and (self.t1 is None or self.t2 is None or self.p2 is None):
            raise ValueError("a trendline requires t1, p1, t2 and p2")
        return self


class DrawingCreate(DrawingBase):
    exchange: str
    symbol: str
    # Null (default) = visible on every timeframe.
    interval: str | None = None


class DrawingUpdate(BaseModel):
    """Partial update -- used by dragging handles and restyling."""

    model_config = ConfigDict(extra="forbid")

    t1: int | None = None
    p1: float | None = None
    t2: int | None = None
    p2: float | None = None
    color: str | None = None
    width: int | None = Field(default=None, ge=1, le=5)
    style: DrawingStyle | None = None
    label: str | None = Field(default=None, max_length=120)
    interval: str | None = None


class DrawingOut(DrawingBase):
    id: int
    exchange: str
    symbol: str
    interval: str | None
    created_at: int
    updated_at: int

    @classmethod
    def from_row(cls, row: Drawing) -> DrawingOut:
        return cls(
            id=row.id,
            exchange=row.exchange,
            symbol=row.symbol,
            interval=row.interval,
            kind=row.kind,  # type: ignore[arg-type]
            t1=row.t1,
            p1=row.p1,
            t2=row.t2,
            p2=row.p2,
            color=row.color,
            width=row.width,
            style=row.style,  # type: ignore[arg-type]
            label=row.label,
            created_at=row.created_at,
            updated_at=row.updated_at,
        )
