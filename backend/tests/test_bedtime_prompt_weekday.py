"""Per-weekday bedtime resolution for the pre-bed progress-pic prompt (#49).

The bedtime progress-picture prompt must fire right before the user goes to
bed ON EACH SPECIFIC DAY. It now reads the Planner tab's per-weekday
`weekly_timings` override when present, and falls back to the global
`sleep_time` (then schedule preferences) otherwise. These lock that
precedence in and guard backward compatibility for the no-weekday call form.
"""

from __future__ import annotations

import sys
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from services.scheduler_job import _resolve_user_sleep_time


def _user(onboarding=None, schedule_preferences=None):
    return SimpleNamespace(
        onboarding=onboarding or {},
        schedule_preferences=schedule_preferences or {},
    )


def test_weekday_override_beats_global():
    """A Planner per-weekday sleep_time wins for that day; other days use the
    global default."""
    user = _user({
        "sleep_time": "23:00",
        "weekly_timings": {"friday": {"sleep_time": "01:30"}},
    })
    assert _resolve_user_sleep_time(user, [], weekday="friday") == (1, 30)
    assert _resolve_user_sleep_time(user, [], weekday="tuesday") == (23, 0)


def test_falls_back_to_global_when_no_weekly_timings():
    user = _user({"sleep_time": "22:45"})
    assert _resolve_user_sleep_time(user, [], weekday="monday") == (22, 45)


def test_partial_override_without_sleep_inherits_global():
    """A weekday override that only sets wake_time must NOT shadow the global
    sleep_time — omitted fields inherit the default rhythm."""
    user = _user({
        "sleep_time": "23:15",
        "weekly_timings": {"saturday": {"wake_time": "10:00"}},
    })
    assert _resolve_user_sleep_time(user, [], weekday="saturday") == (23, 15)


def test_no_weekday_arg_is_backwards_compatible():
    """Old call sites that pass no weekday get the global-only behavior and
    ignore weekly_timings entirely."""
    user = _user({
        "sleep_time": "23:00",
        "weekly_timings": {"friday": {"sleep_time": "01:30"}},
    })
    assert _resolve_user_sleep_time(user, []) == (23, 0)


def test_schedule_preference_fallback():
    """With no onboarding sleep_time, fall through to an active schedule's
    stored preference."""
    user = _user({})
    sched = SimpleNamespace(preferences={"sleep_time": "00:15"})
    assert _resolve_user_sleep_time(user, [sched], weekday="monday") == (0, 15)


def test_missing_everything_returns_none():
    assert _resolve_user_sleep_time(_user({}), [], weekday="monday") is None
