"""SQLAlchemy models.

The schema is portable between SQLite and PostgreSQL: no vendor-specific column
types, timestamps stored as epoch milliseconds (BigInteger) so the gap math is
integer arithmetic everywhere.
"""

from __future__ import annotations

from sqlalchemy import BigInteger, Float, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Candle(Base):
    """One OHLCV bar, keyed by (exchange, symbol, interval, open_time)."""

    __tablename__ = "candles"

    exchange: Mapped[str] = mapped_column(String(32), primary_key=True)
    symbol: Mapped[str] = mapped_column(String(64), primary_key=True)
    interval: Mapped[str] = mapped_column(String(8), primary_key=True)
    open_time: Mapped[int] = mapped_column(BigInteger, primary_key=True)

    open: Mapped[float] = mapped_column(Float, nullable=False)
    high: Mapped[float] = mapped_column(Float, nullable=False)
    low: Mapped[float] = mapped_column(Float, nullable=False)
    close: Mapped[float] = mapped_column(Float, nullable=False)
    volume: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    quote_volume: Mapped[float | None] = mapped_column(Float, nullable=True)
    trades: Mapped[int | None] = mapped_column(Integer, nullable=True)

    __table_args__ = (
        Index("ix_candles_series_time", "exchange", "symbol", "interval", "open_time"),
    )


class CandleCoverage(Base):
    """Ranges of *closed* candles already persisted for a series.

    Tracking coverage explicitly (instead of inferring it from row counts) is
    what makes re-queries cheap: exchanges legitimately skip bars with no
    trades, so "expected count == stored count" would never hold and we would
    re-download the same window forever.

    `start_ms` / `end_ms` are inclusive open_time bounds. Rows for one series are
    kept normalised: sorted, non-overlapping, non-adjacent.
    """

    __tablename__ = "candle_coverage"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    exchange: Mapped[str] = mapped_column(String(32), nullable=False)
    symbol: Mapped[str] = mapped_column(String(64), nullable=False)
    interval: Mapped[str] = mapped_column(String(8), nullable=False)
    start_ms: Mapped[int] = mapped_column(BigInteger, nullable=False)
    end_ms: Mapped[int] = mapped_column(BigInteger, nullable=False)

    __table_args__ = (
        Index("ix_coverage_series", "exchange", "symbol", "interval", "start_ms"),
    )


class Note(Base):
    """A review ("复盘") annotation anchored to a point in time on a series."""

    __tablename__ = "notes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    exchange: Mapped[str] = mapped_column(String(32), nullable=False)
    symbol: Mapped[str] = mapped_column(String(64), nullable=False)
    # Null = show the note on every timeframe of this symbol.
    interval: Mapped[str | None] = mapped_column(String(8), nullable=True)

    time_ms: Mapped[int] = mapped_column(BigInteger, nullable=False)
    price: Mapped[float | None] = mapped_column(Float, nullable=True)

    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False, default="")
    # "long" | "short" | "observation"
    kind: Mapped[str] = mapped_column(String(16), nullable=False, default="observation")
    color: Mapped[str | None] = mapped_column(String(16), nullable=True)
    tags: Mapped[str] = mapped_column(Text, nullable=False, default="")  # comma separated

    created_at: Mapped[int] = mapped_column(BigInteger, nullable=False)
    updated_at: Mapped[int] = mapped_column(BigInteger, nullable=False)

    __table_args__ = (
        Index("ix_notes_series_time", "exchange", "symbol", "time_ms"),
    )


class Drawing(Base):
    """A chart drawing (trend line / horizontal level).

    Anchors are stored as (time, price) rather than pixels or bar indices, so a
    line drawn on the 1h chart lands on exactly the same spot on the 4h chart --
    the same convention TradingView uses.

    The measure tool is deliberately absent: a measurement is a transient
    question ("how much was that move?"), not something worth persisting.
    """

    __tablename__ = "drawings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    exchange: Mapped[str] = mapped_column(String(32), nullable=False)
    symbol: Mapped[str] = mapped_column(String(64), nullable=False)
    # Null = show on every timeframe (the default).
    interval: Mapped[str | None] = mapped_column(String(8), nullable=True)

    # "trendline" | "horizontal"
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    # Anchor A. `t1` is null for a horizontal line, which spans the whole width.
    t1: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    p1: Mapped[float] = mapped_column(Float, nullable=False)
    # Anchor B, only used by two-point shapes.
    t2: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    p2: Mapped[float | None] = mapped_column(Float, nullable=True)

    color: Mapped[str | None] = mapped_column(String(16), nullable=True)
    width: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    # "solid" | "dashed"
    style: Mapped[str] = mapped_column(String(8), nullable=False, default="solid")
    label: Mapped[str] = mapped_column(String(120), nullable=False, default="")

    created_at: Mapped[int] = mapped_column(BigInteger, nullable=False)
    updated_at: Mapped[int] = mapped_column(BigInteger, nullable=False)

    __table_args__ = (Index("ix_drawings_series", "exchange", "symbol"),)


class Watchlist(Base):
    """Pinned exchange/symbol pairs, so a review session survives a reload."""

    __tablename__ = "watchlist"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    exchange: Mapped[str] = mapped_column(String(32), nullable=False)
    symbol: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[int] = mapped_column(BigInteger, nullable=False)

    __table_args__ = (UniqueConstraint("exchange", "symbol", name="uq_watchlist_pair"),)


class PriceAlert(Base):
    """One-shot price or 24-hour change alert for the monitor panel."""

    __tablename__ = "price_alerts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    exchange: Mapped[str] = mapped_column(String(32), nullable=False)
    symbol: Mapped[str] = mapped_column(String(64), nullable=False)
    # "price" | "change_24h"
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    # "above" | "below"
    direction: Mapped[str] = mapped_column(String(8), nullable=False)
    threshold: Mapped[float] = mapped_column(Float, nullable=False)
    enabled: Mapped[bool] = mapped_column(nullable=False, default=True)
    triggered_at: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    created_at: Mapped[int] = mapped_column(BigInteger, nullable=False)
    updated_at: Mapped[int] = mapped_column(BigInteger, nullable=False)

    __table_args__ = (Index("ix_price_alerts_exchange_enabled", "exchange", "enabled"),)
