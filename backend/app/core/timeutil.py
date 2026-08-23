"""Time helpers. Epoch milliseconds is the only internal representation."""

from __future__ import annotations

import time
from datetime import UTC, datetime

from app.core.errors import ValidationError


def now_ms() -> int:
    return int(time.time() * 1000)


def to_datetime(ms: int) -> datetime:
    return datetime.fromtimestamp(ms / 1000, tz=UTC)


def parse_time(value: str | int | float | None) -> int | None:
    """Accept epoch ms, epoch seconds or an ISO-8601 string; return epoch ms.

    Bare dates and naive datetimes are read as UTC, matching exchange klines.
    """
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        return _from_epoch(float(value))

    text = value.strip()
    if text.lstrip("-").isdigit():
        return _from_epoch(float(text))

    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValidationError(f"Cannot parse timestamp: {value!r}") from exc
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return int(parsed.timestamp() * 1000)


def _from_epoch(number: float) -> int:
    # Anything below ~1e11 is seconds (year 5138 in ms terms).
    return int(number * 1000) if abs(number) < 1e11 else int(number)
