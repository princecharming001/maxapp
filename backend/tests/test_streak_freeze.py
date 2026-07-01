"""Streak v2 freeze mechanics (spec 3.5): earned weekly, max 2, silent bridge."""

from datetime import date, timedelta

from services.schedule_streak import (
    FREEZE_USED_ON_KEY,
    FREEZES_KEY,
    LAST_PERFECT_KEY,
    MAX_ARMED_FREEZES,
    PERFECT_COMPLETED_KEY,
    STREAK_KEY,
    _credit_if_perfect_day,
    _reconcile_missed,
    _uncredit_if_unperfect,
    streak_payload_from_profile,
)

TODAY = date(2026, 6, 10)


def _sched(date_iso, tasks):
    """Build a one-schedule fixture. `tasks` = list of (task_id, status)."""
    return [{
        "id": "s1",
        "maxx_id": "fitmax",
        "days": [{
            "date": date_iso,
            "tasks": [
                {"task_id": tid, "status": st, "time": f"{8 + i:02d}:00",
                 "title": f"Task {tid}", "description": ""}
                for i, (tid, st) in enumerate(tasks)
            ],
        }],
    }]


def test_no_freeze_missed_day_resets():
    profile = {STREAK_KEY: 5, LAST_PERFECT_KEY: (TODAY - timedelta(days=3)).isoformat()}
    changed = _reconcile_missed(profile, TODAY)
    assert changed
    assert profile[STREAK_KEY] == 0


def test_armed_freeze_bridges_one_missed_day():
    profile = {
        STREAK_KEY: 7,
        FREEZES_KEY: 1,
        LAST_PERFECT_KEY: (TODAY - timedelta(days=2)).isoformat(),
    }
    changed = _reconcile_missed(profile, TODAY)
    assert changed
    assert profile[STREAK_KEY] == 7  # streak intact
    assert profile[FREEZES_KEY] == 0
    assert profile[LAST_PERFECT_KEY] == (TODAY - timedelta(days=1)).isoformat()
    payload = streak_payload_from_profile(profile, TODAY)
    assert payload["freeze_used_yesterday"] is True


def test_two_freezes_bridge_two_days_but_not_three():
    base = {STREAK_KEY: 14, FREEZES_KEY: 2}
    p2 = {**base, LAST_PERFECT_KEY: (TODAY - timedelta(days=3)).isoformat()}
    _reconcile_missed(p2, TODAY)
    assert p2[STREAK_KEY] == 14 and p2[FREEZES_KEY] == 0

    p3 = {**base, LAST_PERFECT_KEY: (TODAY - timedelta(days=4)).isoformat()}
    _reconcile_missed(p3, TODAY)
    assert p3[STREAK_KEY] == 0  # 3 missed days > 2 freezes -> fresh start


def test_freeze_earned_on_full_week_capped_at_two(monkeypatch):
    import services.schedule_streak as ss
    monkeypatch.setattr(ss, "merged_day_all_completed", lambda *_: True)

    profile = {STREAK_KEY: 6, LAST_PERFECT_KEY: (TODAY - timedelta(days=1)).isoformat()}
    assert _credit_if_perfect_day(profile, [], TODAY)
    assert profile[STREAK_KEY] == 7
    assert profile[FREEZES_KEY] == 1

    profile[FREEZES_KEY] = MAX_ARMED_FREEZES
    profile[STREAK_KEY] = 13
    profile[LAST_PERFECT_KEY] = TODAY.isoformat()
    later = TODAY + timedelta(days=1)
    assert _credit_if_perfect_day(profile, [], later)
    assert profile[STREAK_KEY] == 14
    assert profile[FREEZES_KEY] == MAX_ARMED_FREEZES  # capped


def test_payload_shape():
    payload = streak_payload_from_profile({}, TODAY)
    assert payload["current"] == 0
    assert payload["armed_freezes"] == 0
    assert payload["freeze_used_yesterday"] is False


def test_future_last_perfect_is_clamped_not_reset(monkeypatch):
    """A tz backward-jump / clock-skew can leave LAST_PERFECT ahead of today.
    Reconcile must clamp it to today (time can't run backwards) so the next
    perfect close does NOT collapse a healthy streak to 1."""
    import services.schedule_streak as ss

    future = (TODAY + timedelta(days=5)).isoformat()
    profile = {STREAK_KEY: 6, LAST_PERFECT_KEY: future, FREEZES_KEY: 0}

    changed = _reconcile_missed(profile, TODAY)
    assert changed  # the clamp itself is a change
    assert profile[LAST_PERFECT_KEY] == TODAY.isoformat()
    assert profile[STREAK_KEY] == 6  # streak preserved, not reset

    # Now a perfect close on TODAY must not send it to the reset-to-1 branch.
    monkeypatch.setattr(ss, "merged_day_all_completed", lambda *_: True)
    _credit_if_perfect_day(profile, [], TODAY)
    assert profile[STREAK_KEY] == 6  # already-credited-today, unchanged

    # And the following day continues the streak instead of restarting it.
    tomorrow = TODAY + timedelta(days=1)
    _credit_if_perfect_day(profile, [], tomorrow)
    assert profile[STREAK_KEY] == 7


def test_rest_day_no_tasks_does_not_break_streak():
    """A gap day with NO scheduled tasks (rest / deload) must not burn a freeze
    or reset — nothing was missed. LAST_PERFECT advances to yesterday."""
    profile = {STREAK_KEY: 5, LAST_PERFECT_KEY: (TODAY - timedelta(days=2)).isoformat(), FREEZES_KEY: 0}
    # Only TODAY has tasks; yesterday (the gap day) has none.
    schedules = _sched(TODAY.isoformat(), [("t1", "completed")])
    changed = _reconcile_missed(profile, TODAY, schedules)
    assert changed
    assert profile[STREAK_KEY] == 5  # preserved, not reset
    assert profile[FREEZES_KEY] == 0  # no freeze consumed
    assert profile[LAST_PERFECT_KEY] == (TODAY - timedelta(days=1)).isoformat()


def test_task_bearing_gap_day_still_resets_without_freeze():
    """A gap day that DID have tasks (and wasn't closed) is a real miss."""
    profile = {STREAK_KEY: 5, LAST_PERFECT_KEY: (TODAY - timedelta(days=2)).isoformat(), FREEZES_KEY: 0}
    # Yesterday had a pending task that was never resolved.
    schedules = _sched((TODAY - timedelta(days=1)).isoformat(), [("t1", "pending")])
    _reconcile_missed(profile, TODAY, schedules)
    assert profile[STREAK_KEY] == 0  # genuine miss → reset


def test_empty_schedules_does_not_uncredit():
    """A transient empty merged view (regen commit gap / stopped last max) is
    'no info' — it must NOT roll back a day the user earned."""
    profile = {STREAK_KEY: 6, LAST_PERFECT_KEY: TODAY.isoformat(), PERFECT_COMPLETED_KEY: 2}
    fired = _uncredit_if_unperfect(profile, [], TODAY)
    assert fired is False
    assert profile[STREAK_KEY] == 6


def test_added_max_does_not_uncredit():
    """Adding a max / a regen that appends PENDING tasks drops the resolved
    fraction below the close threshold WITHOUT undoing a completion — the
    already-earned day must stand."""
    # Credit a clean 2/2 day.
    profile = {STREAK_KEY: 4, LAST_PERFECT_KEY: (TODAY - timedelta(days=1)).isoformat()}
    v1 = _sched(TODAY.isoformat(), [("a", "completed"), ("b", "completed")])
    assert _credit_if_perfect_day(profile, v1, TODAY)
    assert profile[STREAK_KEY] == 5
    assert profile[PERFECT_COMPLETED_KEY] == 2
    # A new max appends a pending task today → 2 completed of 3 (below 0.8).
    v2 = _sched(TODAY.isoformat(), [("a", "completed"), ("b", "completed"), ("c", "pending")])
    fired = _uncredit_if_unperfect(profile, v2, TODAY)
    assert fired is False
    assert profile[STREAK_KEY] == 5  # earned day stands


def test_genuine_uncheck_still_uncredits():
    """A real un-check (completed count DROPS) must still roll the day back."""
    profile = {STREAK_KEY: 4, LAST_PERFECT_KEY: (TODAY - timedelta(days=1)).isoformat()}
    v1 = _sched(TODAY.isoformat(), [("a", "completed"), ("b", "completed")])
    _credit_if_perfect_day(profile, v1, TODAY)
    assert profile[STREAK_KEY] == 5
    # User un-checks one → 1 completed of 2 (below threshold, count dropped).
    v2 = _sched(TODAY.isoformat(), [("a", "completed"), ("b", "pending")])
    fired = _uncredit_if_unperfect(profile, v2, TODAY)
    assert fired is True
    assert profile[STREAK_KEY] == 4


def test_freezes_and_markers_cleared_on_reset():
    """A hard reset must zero freezes + clear freeze markers so a fresh streak
    doesn't start already protected (and no stale 'freeze used' card lingers)."""
    profile = {
        STREAK_KEY: 20,
        FREEZES_KEY: 2,
        LAST_PERFECT_KEY: (TODAY - timedelta(days=6)).isoformat(),
        FREEZE_USED_ON_KEY: (TODAY - timedelta(days=6)).isoformat(),
    }
    _reconcile_missed(profile, TODAY)  # 5-day gap > 2 freezes → reset
    assert profile[STREAK_KEY] == 0
    assert profile[FREEZES_KEY] == 0
    assert profile[LAST_PERFECT_KEY] is None
    assert profile[FREEZE_USED_ON_KEY] is None
