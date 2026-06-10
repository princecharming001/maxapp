"""Streak v2 freeze mechanics (spec 3.5): earned weekly, max 2, silent bridge."""

from datetime import date, timedelta

from services.schedule_streak import (
    FREEZE_USED_ON_KEY,
    FREEZES_KEY,
    LAST_PERFECT_KEY,
    MAX_ARMED_FREEZES,
    STREAK_KEY,
    _credit_if_perfect_day,
    _reconcile_missed,
    streak_payload_from_profile,
)

TODAY = date(2026, 6, 10)


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
