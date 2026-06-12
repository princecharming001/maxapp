"""Fair day-close (streaks must reward the committed, not punish them)."""

from services.schedule_master_merge import (
    DAY_CLOSE_RESOLVED_FRACTION,
    merged_day_all_completed,
)


def _sched(statuses, date="2026-06-15"):
    return [{
        "days": [{
            "date": date,
            "tasks": [{"title": f"t{i}", "time": "08:00", "status": s}
                      for i, s in enumerate(statuses)],
        }],
    }]


def test_eight_of_nine_closes_the_day():
    statuses = ["completed"] * 8 + ["pending"]
    assert merged_day_all_completed(_sched(statuses), "2026-06-15") is True


def test_half_done_does_not_close():
    statuses = ["completed"] * 4 + ["pending"] * 4
    assert merged_day_all_completed(_sched(statuses), "2026-06-15") is False


def test_skips_count_as_resolved_but_not_alone():
    # 7 done + 2 skipped of 9 -> 100% resolved -> closed
    assert merged_day_all_completed(
        _sched(["completed"] * 7 + ["skipped"] * 2), "2026-06-15"
    ) is True
    # all skips, zero completions -> never closes
    assert merged_day_all_completed(
        _sched(["skipped"] * 5), "2026-06-15"
    ) is False


def test_single_task_day_still_all_or_nothing():
    assert merged_day_all_completed(_sched(["completed"]), "2026-06-15") is True
    assert merged_day_all_completed(_sched(["pending"]), "2026-06-15") is False
    assert 0.75 < DAY_CLOSE_RESOLVED_FRACTION <= 0.85
