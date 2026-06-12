"""Horizon keeper: paying customers never run out of plan."""

from datetime import date, timedelta

from services.horizon import (
    COURSE_CHUNK_DAYS,
    HORIZON_MIN_DAYS,
    _course_total_days,
    _extend_course_days,
    _last_date,
)


class _FakeSched:
    def __init__(self, days):
        self.days = days
        self.maxx_id = "course_lift101"
        self.schedule_type = "course"


COURSE = {
    "id": "course_lift101",
    "title": "Lift 101",
    "weeks": 8,
    "category": "fitmax",
    "creator": {"handle": "coachmreed"},
    "schedule_hints": {"sessions_per_week": 3, "minutes": 40, "window": "any"},
}

OB = {
    "wake_time": "07:00",
    "sleep_time": "23:00",
    "workout_window_choice": "after_work",
    "obligations": [{"label": "Work", "start": "09:00", "end": "17:00", "days": "weekdays"}],
}


def _days(start: date, n: int):
    return [{"date": (start + timedelta(days=i)).isoformat(), "tasks": []} for i in range(n)]


def test_last_date_and_total():
    start = date(2026, 6, 1)
    sched = _FakeSched(_days(start, 14))
    assert _last_date(sched.days) == date(2026, 6, 14)
    assert _course_total_days(sched, COURSE) == 56
    assert _course_total_days(sched, {"weeks": 0}) > 365  # weekly-forever


def test_extend_appends_sessions_on_pattern_days():
    start = date(2026, 6, 1)  # Monday
    sched = _FakeSched(_days(start, 14))
    appended = _extend_course_days(
        sched, COURSE, OB, start=start + timedelta(days=14), n_days=COURSE_CHUNK_DAYS
    )
    assert appended == COURSE_CHUNK_DAYS
    assert len(sched.days) == 28
    new_days = sched.days[14:]
    session_days = [d for d in new_days if d["tasks"]]
    # 3/week over 2 weeks = 6 sessions, same weekday pattern as week one.
    assert len(session_days) == 6
    t = session_days[0]["tasks"][0]
    # Sessions land in the user's after-work window on the friendly grid,
    # with an anchored why-line - never 7:30am before work.
    h, m = map(int, t["time"].split(":"))
    assert h * 60 + m >= 17 * 60 + 45
    assert m % 5 == 0
    assert t["why"]
    assert t["provenance"]["creator_handle"] == "coachmreed"


def test_horizon_constant_sane():
    assert 3 <= HORIZON_MIN_DAYS <= 7
