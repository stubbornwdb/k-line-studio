"""Monitor alert payloads."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

AlertKind = Literal["price", "change_24h"]
AlertDirection = Literal["above", "below"]


class PriceAlertIn(BaseModel):
    exchange: str
    symbol: str
    kind: AlertKind
    direction: AlertDirection
    threshold: float = Field(description="Price or percentage threshold")


class PriceAlertPatch(BaseModel):
    kind: AlertKind | None = None
    direction: AlertDirection | None = None
    threshold: float | None = None
    enabled: bool | None = None


class PriceAlertOut(PriceAlertIn):
    id: int
    enabled: bool
    triggered_at: int | None
    created_at: int
    updated_at: int
