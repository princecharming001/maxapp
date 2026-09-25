"""The one day-close rule (services.schedule_master_merge.day_closes) and the
push copy's "how many more" arithmetic that must agree with it."""
from __future__ import annotations

import pytest

from services.notification_engine import needed_to_close
from services.schedule_master_merge import (
    DAY_CLOSE_COMPLETED_FRACTION,
    DAY_CLOSE_RESOLVED_FRACTION,
    day_closes,
    merged_day_all_completed,
)


def _sched(statuses: list[str], day: str = "2026-09-25") -> list[dict]:
    return [{
        "id": "s1", "maxx_id": "skinmax",
        "days": [{"date": day, "tasks": [
            {"task_id": f"t{i}", "title": f"task {i}", "time": f"{7 + i:02d}:00", "status": st}
            for i, st in enumerate(statuses)
        ]}],
    }]


@pytest.mark.parametrize("total,done,skipped,expected", [
    (8, 5, 0, True),    # 62% done — most of the day, rest untouched
    (8, 4, 0, False),   # half is not most
    (8, 4, 3, True),    # 50% done + 3 skipped = 88% resolved
    (8, 0, 8, False),   # a day of only skips earns nothing
    (8, 7, 0, True),
    (5, 3, 0, True),    # exactly 60%
    (3, 2, 0, True),    # 67%
    (3, 1, 1, False),   # 33% done, 67% resolved
    (3, 1, 2, True),    # 100% resolved with one real completion
    (1, 1, 0, True),
    (1, 0, 0, False),
    (0, 0, 0, False),
])
def test_day_closes_rule_table(total, done, skipped, expected):
    assert day_closes(total, done, skipped) is expected


def test_merged_view_uses_the_same_rule():
    assert merged_day_all_completed(_sched(["completed"] * 5 + ["pending"] * 3), "2026-09-25") is True
    assert merged_day_all_completed(_sched(["completed"] * 4 + ["pending"] * 4), "2026-09-25") is False
    assert merged_day_all_completed(_sched(["skipped"] * 8), "2026-09-25") is False
    assert merged_day_all_completed(_sched(["completed"]), "2026-09-24") is False, "no tasks that day"


def test_thresholds_are_pinned():
    assert DAY_CLOSE_COMPLETED_FRACTION == 0.6
    assert DAY_CLOSE_RESOLVED_FRACTION == 0.8


@pytest.mark.parametrize("total,done,skipped", [
    (8, 0, 0), (8, 3, 0), (8, 4, 0), (8, 4, 2), (8, 0, 7), (5, 2, 0), (3, 1, 1), (1, 0, 0),
])
def test_needed_to_close_is_the_fewest_taps_that_close_the_day(total, done, skipped):
    need = needed_to_close(total, done, skipped, DAY_CLOSE_RESOLVED_FRACTION, DAY_CLOSE_COMPLETED_FRACTION)
    assert need >= 1
    # Completing that many more closes the day under the shared rule...
    assert day_closes(total, done + need, skipped)
    # ...and one fewer never does.
    assert not day_closes(total, done + need - 1, skipped)


def test_needed_to_close_without_the_completed_rule_keeps_the_old_arithmetic():
    assert needed_to_close(8, 4, 0, 0.8) == 3
    assert needed_to_close(8, 4, 0, 0.8, 0.6) == 1
    assert needed_to_close(0, 0, 0, 0.8, 0.6) == 0
