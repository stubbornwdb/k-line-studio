from app.services.coverage import merge_ranges, subtract_ranges

STEP = 10


def test_merge_coalesces_overlapping_and_adjacent():
    assert merge_ranges([(0, 50), (40, 90)], STEP) == [(0, 90)]
    # 60 is exactly one step after 50 -> adjacent, so it merges.
    assert merge_ranges([(0, 50), (60, 90)], STEP) == [(0, 90)]
    assert merge_ranges([(0, 50), (70, 90)], STEP) == [(0, 50), (70, 90)]


def test_merge_ignores_inverted_ranges():
    assert merge_ranges([(90, 10)], STEP) == []


def test_subtract_with_no_coverage_returns_whole_target():
    assert subtract_ranges((0, 100), [], STEP) == [(0, 100)]


def test_subtract_finds_head_middle_and_tail_gaps():
    covered = [(30, 50), (80, 90)]
    assert subtract_ranges((0, 120), covered, STEP) == [(0, 20), (60, 70), (100, 120)]


def test_fully_covered_target_yields_no_gaps():
    assert subtract_ranges((20, 80), [(0, 100)], STEP) == []


def test_coverage_outside_the_target_is_ignored():
    assert subtract_ranges((100, 200), [(0, 50), (300, 400)], STEP) == [(100, 200)]


def test_partial_tail_coverage():
    assert subtract_ranges((0, 100), [(50, 200)], STEP) == [(0, 40)]
