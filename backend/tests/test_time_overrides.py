"""Slice 4 — durable time pins (DB-free, LLM-free).

Locks in the "moved-time sticks" guarantee. When a user moves a recurring
routine part (scope="series" edit), the backend records
schedule_context.time_overrides[catalog_id] = "HH:MM". On every later silent
re-expansion (regenerate_active_schedules) we re-stamp that time AFTER the
validator runs, so the user's intent beats the engine's default slot and the
move never silently reverts.

Covered (pure helpers from services.schedule_runtime):
  - _apply_time_overrides — re-times matching catalog_ids, clears
    notification_sent, leaves unpinned tasks untouched, no input mutation.
  - empty-overrides no-op.
  - compose order: a part the user removed (exclusion) is gone before pins
    apply, so a stale pin can never resurrect it.

Run: pytest backend/tests/test_time_overrides.py -q
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from services.schedule_runtime import _apply_time_overrides, _drop_excluded_tasks


def _days():
    return [
        {
            "date": "2026-06-02",
            "tasks": [
                {"task_id": "a1", "catalog_id": "skin_am", "time": "07:00", "notification_sent": True, "title": "AM skincare"},
                {"task_id": "a2", "catalog_id": "skin_pm", "time": "21:00", "title": "PM skincare"},
            ],
        },
        {
            "date": "2026-06-03",
            "tasks": [
                {"task_id": "b1", "catalog_id": "skin_am", "time": "07:00", "notification_sent": True, "title": "AM skincare"},
            ],
        },
    ]


def test_apply_time_overrides_repins_every_instance():
    days = _days()
    out = _apply_time_overrides(days, {"skin_am": "09:30"})
    times = [t["time"] for d in out for t in d["tasks"] if t["catalog_id"] == "skin_am"]
    assert times == ["09:30", "09:30"], "every instance of the pinned part re-timed"
    # Unpinned part untouched.
    pm = [t["time"] for d in out for t in d["tasks"] if t["catalog_id"] == "skin_pm"]
    assert pm == ["21:00"]


def test_apply_time_overrides_clears_notification_flag():
    out = _apply_time_overrides(_days(), {"skin_am": "09:30"})
    flags = [t.get("notification_sent") for d in out for t in d["tasks"] if t["catalog_id"] == "skin_am"]
    assert all(f is False for f in flags), "moved time re-arms the reminder"


def test_apply_time_overrides_does_not_mutate_input():
    days = _days()
    _apply_time_overrides(days, {"skin_am": "09:30"})
    # Original list still shows the pre-move time.
    assert days[0]["tasks"][0]["time"] == "07:00"
    assert days[0]["tasks"][0]["notification_sent"] is True


def test_empty_overrides_is_noop():
    days = _days()
    assert _apply_time_overrides(days, {}) is days


def test_exclusion_runs_before_pins_so_stale_pin_cannot_resurrect():
    # regen applies _drop_excluded_tasks BEFORE _apply_time_overrides. A pin
    # left over for a removed part must not bring it back.
    days = _drop_excluded_tasks(_days(), {"skin_am"})
    out = _apply_time_overrides(days, {"skin_am": "09:30"})
    assert not any(t["catalog_id"] == "skin_am" for d in out for t in d["tasks"]), (
        "a pin for an excluded part stays gone"
    )
    # The surviving unpinned part is still present at its original time.
    assert any(t["catalog_id"] == "skin_pm" and t["time"] == "21:00" for d in out for t in d["tasks"])
