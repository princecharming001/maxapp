"""Learner unit tests (spec 4.5): slips, reflow suggestions, welcome-back."""

from datetime import date

from services.learner import (
    SLIP_GRACE_MIN,
    detect_slips,
    suggest_reflow,
    welcome_back_state,
)


def _task(title, time, status="pending", dur=10):
    return {"title": title, "time": time, "status": status, "duration_min": dur, "task_id": title}


def test_detect_slips_grace_window():
    now = 14 * 60  # 2pm
    tasks = [
        _task("way past", "12:00"),               # slipped (2h past)
        _task("just past", "13:30"),              # within grace -> not slipped
        _task("done past", "10:00", "completed"), # done -> never slipped
        _task("future", "18:00"),
    ]
    slipped = detect_slips(tasks, now)
    assert [t["title"] for t in slipped] == ["way past"]
    assert SLIP_GRACE_MIN == 60


def test_suggest_reflow_avoids_busy_and_tasks():
    now = 14 * 60
    slipped = _task("protein", "13:00")
    tasks = [slipped, _task("stretch", "15:30", dur=15)]
    structure = [
        {"time": "07:00", "label": "Wake"},
        {"time": "14:00", "label": "Meeting", "end": "15:00"},
        {"time": "23:00", "label": "Sleep"},
    ]
    out = suggest_reflow(slipped, tasks, structure, now, 23 * 60)
    # 14:15 collides with the meeting; 15:05 collides with stretch's 15:30?
    # 15:05+10=15:15 < 15:30 -> fits right after the meeting.
    assert out == "15:05"


def test_suggest_reflow_none_when_day_is_over():
    slipped = _task("pm skin", "21:00")
    out = suggest_reflow(slipped, [slipped], [], 23 * 60 - 10, 23 * 60)
    assert out is None


def test_welcome_back_after_gap():
    profile = {"master_schedule_streak_last_perfect_date": "2026-06-01"}
    state = welcome_back_state(profile, date(2026, 6, 10))
    assert state is not None
    assert state["line"] == "Welcome back. Just today."
    # short gap -> no card
    profile2 = {"master_schedule_streak_last_perfect_date": "2026-06-08"}
    assert welcome_back_state(profile2, date(2026, 6, 10)) is None
