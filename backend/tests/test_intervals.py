from datetime import UTC, datetime

from app.core.intervals import Interval


def ms(iso: str) -> int:
    return int(datetime.fromisoformat(iso).replace(tzinfo=UTC).timestamp() * 1000)


def test_interval_durations():
    assert Interval.M1.ms == 60_000
    assert Interval.H4.ms == 4 * 3_600_000
    assert Interval.W1.ms == 7 * 86_400_000


def test_floor_snaps_to_bar_open():
    assert Interval.H1.floor(ms("2024-03-05T13:42:11")) == ms("2024-03-05T13:00:00")
    assert Interval.M15.floor(ms("2024-03-05T13:42:11")) == ms("2024-03-05T13:30:00")
    assert Interval.D1.floor(ms("2024-03-05T13:42:11")) == ms("2024-03-05T00:00:00")


def test_weekly_bars_open_on_monday():
    # 2024-03-05 is a Tuesday; the weekly bar opens the day before.
    assert Interval.W1.floor(ms("2024-03-05T13:42:11")) == ms("2024-03-04T00:00:00")
    assert Interval.W1.floor(ms("2024-03-04T00:00:00")) == ms("2024-03-04T00:00:00")
    assert Interval.W1.floor(ms("2024-03-03T23:59:59")) == ms("2024-02-26T00:00:00")


def test_ceil_is_idempotent_on_boundaries():
    boundary = ms("2024-03-05T13:00:00")
    assert Interval.H1.ceil(boundary) == boundary
    assert Interval.H1.ceil(boundary + 1) == boundary + Interval.H1.ms


def test_last_closed_excludes_the_forming_bar():
    now = ms("2024-03-05T13:42:11")
    assert Interval.H1.last_closed_open_time(now) == ms("2024-03-05T12:00:00")
