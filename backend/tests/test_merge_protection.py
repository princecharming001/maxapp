"""Regression fixtures for the protection-tier merge (spec 4.3).

The contract under test:
  - No paid/essential task is dropped while a lower-value task survives.
  - Every purchased program keeps >=1 task per day it had any (paid floor).
  - Native maxes get NO advantage over paid creator courses.
  - Every drop writes a suppression-ledger entry (no silent removals).
  - Tiebreaks are stable (task_uuid), never dict order.
"""

from services.multi_module_collision import (
    HARD_DAILY_TASK_CAP,
    TARGET_DAILY_TOTAL,
    reconcile_schedules,
)
from services.task_fields import (
    TIER_ESSENTIAL,
    TIER_OPTIONAL,
    TIER_PURCHASED,
    normalize_days,
    protection_tier,
)


def _task(title, time="08:00", tags=None, intensity=0.5, catalog_id=None, importance=3):
    return {
        "title": title,
        "time": time,
        "tags": tags or [],
        "intensity": intensity,
        "catalog_id": catalog_id or f"cid.{title}",
        "importance": importance,
        "duration_min": 5,
    }


def _day(tasks):
    return {"tasks": tasks}


def _all_tasks(schedules, di=0):
    out = []
    for m, days in schedules.items():
        out.extend((m, t["title"]) for t in days[di].get("tasks") or [])
    return out


def _all_ledger(schedules, di=0):
    out = []
    for m, days in schedules.items():
        out.extend(days[di].get("held_back") or [])
    return out


# --- protection tiers ---------------------------------------------------------


def test_purchased_course_outranks_native_essential():
    ctx = {"entered_courses": ["course_lift101"]}
    paid_task = _task("Lift session", tags=["workout"], importance=5)
    native_essential = _task("Cleanse", tags=["cleanse"])
    assert protection_tier("course_lift101", paid_task, ctx) == TIER_PURCHASED
    assert protection_tier("skinmax", native_essential, ctx) == TIER_ESSENTIAL
    assert protection_tier("skinmax", _task("Extra"), ctx) == TIER_OPTIONAL


def test_native_maxx_gets_no_advantage_over_paid_course():
    """An entered native maxx and an entered creator course both reach tier 2."""
    ctx = {"entered_maxxes": ["skinmax"], "entered_courses": ["course_lift101"]}
    native = _task("AM routine", tags=["cleanse"], importance=4)
    course = _task("Lift session", tags=["workout"], importance=4)
    assert protection_tier("skinmax", native, ctx) == protection_tier(
        "course_lift101", course, ctx
    )


# --- paid floor + no-paid-drop-while-lower-survives ----------------------------


def test_no_paid_task_dropped_while_optional_survives():
    """5-program overload day: after the trim, no purchased program's required
    task is gone while any optional survives."""
    ctx = {"entered_courses": ["course_a"], "entered_maxxes": ["skinmax"]}
    schedules = {
        "skinmax": [_day([
            _task("Cleanse", "07:00", tags=["cleanse"], importance=4),
            _task("SPF", "07:10", tags=["spf"], importance=4),
            _task("Skin extra 1", "12:00", intensity=0.2),
            _task("Skin extra 2", "13:00", intensity=0.2),
        ])],
        "course_a": [_day([
            _task("Course A main", "18:00", tags=["workout"], importance=5),
            _task("Course A mobility", "19:00", intensity=0.3),
        ])],
        "hairmax": [_day([
            _task("Hair extra 1", "10:00", intensity=0.1),
            _task("Hair extra 2", "11:00", intensity=0.1),
            _task("Hair extra 3", "14:00", intensity=0.1),
        ])],
        "heightmax": [_day([
            _task("Posture extra", "15:00", intensity=0.1),
            _task("Stretch extra", "16:00", intensity=0.1),
        ])],
        "bonemax": [_day([
            _task("Jaw extra", "17:00", intensity=0.1),
        ])],
    }
    out = reconcile_schedules(schedules, user_ctx=ctx)
    titles = {t for _, t in _all_tasks(out)}
    # Purchased/required tasks always survive.
    assert "Course A main" in titles
    assert "Cleanse" in titles and "SPF" in titles
    # The day was over target, so SOMETHING optional was trimmed, with a ledger entry.
    ledger = _all_ledger(out)
    assert ledger, "expected suppression-ledger entries on an overloaded day"
    for e in ledger:
        assert e.get("reason_code")
        assert e.get("title")


def test_paid_floor_program_never_zeroed():
    """A paid program with only low-intensity optionals still keeps >=1 task."""
    ctx = {"entered_courses": ["course_b"]}
    schedules = {
        "skinmax": [_day([
            _task(f"Skin {i}", f"{7+i:02d}:00", tags=["cleanse"], importance=4)
            for i in range(8)
        ])],
        "course_b": [_day([
            _task("Course B tiny habit", "20:00", intensity=0.05, importance=2),
        ])],
    }
    out = reconcile_schedules(schedules, user_ctx=ctx)
    course_titles = [t for m, t in _all_tasks(out) if m == "course_b"]
    assert course_titles, "paid program was zeroed - paid floor violated"


def test_creator_course_not_trimmed_first_anymore():
    """Regression for the priority-999 bug: an entered course's task survives
    the hard-cap trim while unentered native optionals are dropped."""
    ctx = {"entered_courses": ["course_c"], "priority_order": ["skin"]}
    skin_tasks = [
        _task(f"Skin opt {i}", f"{7 + i // 2:02d}:{(i % 2) * 30:02d}", intensity=0.9)
        for i in range(HARD_DAILY_TASK_CAP + 2)
    ]
    schedules = {
        "skinmax": [_day(skin_tasks)],
        "course_c": [_day([
            _task("Course C session", "18:00", tags=["workout"], importance=5),
        ])],
    }
    out = reconcile_schedules(schedules, user_ctx=ctx)
    titles = {t for _, t in _all_tasks(out)}
    assert "Course C session" in titles


# --- ledger completeness -------------------------------------------------------


def test_every_drop_has_ledger_entry():
    """Count conservation: tasks_in == tasks_out + ledger_drops (moves excluded)."""
    ctx = {}
    schedules = {
        "skinmax": [_day([
            _task(f"S{i}", f"{7+i:02d}:00", intensity=0.1 * i) for i in range(7)
        ])],
        "hairmax": [_day([
            _task(f"H{i}", f"{7+i:02d}:30", intensity=0.1 * i) for i in range(7)
        ])],
    }
    total_in = 14
    out = reconcile_schedules(schedules, user_ctx=ctx)
    survivors = len(_all_tasks(out))
    dropped = [e for e in _all_ledger(out) if e["reason_code"] != "moved_conflict"]
    assert survivors + len(dropped) == total_in
    assert survivors <= TARGET_DAILY_TOTAL + 2  # target + MIN_OPTIONAL_KEEP slack


def test_dedupe_keeps_paid_copy_and_logs_loser():
    ctx = {"entered_courses": ["course_d"]}
    schedules = {
        "skinmax": [_day([_task("SPF", "08:00", catalog_id="skin.spf")])],
        "course_d": [_day([
            _task("SPF", "08:00", catalog_id="skin.spf", tags=["spf"], importance=4),
        ])],
    }
    out = reconcile_schedules(schedules, user_ctx=ctx)
    survivors = _all_tasks(out)
    assert ("course_d", "SPF") in survivors
    assert ("skinmax", "SPF") not in survivors
    ledger = _all_ledger(out)
    assert any(e["reason_code"] == "duplicate" for e in ledger)


# --- determinism ----------------------------------------------------------------


def test_equal_priority_programs_deterministic():
    """Two identical-value programs: repeated runs make identical choices."""
    def build():
        return {
            "alpha": [_day([
                _task(f"A{i}", f"{8+i:02d}:00", intensity=0.5) for i in range(6)
            ])],
            "beta": [_day([
                _task(f"B{i}", f"{8+i:02d}:30", intensity=0.5) for i in range(6)
            ])],
        }
    out1 = reconcile_schedules(build(), user_ctx={})
    out2 = reconcile_schedules(build(), user_ctx={})
    assert sorted(_all_tasks(out1)) == sorted(_all_tasks(out2))


def test_zero_gap_busy_day_no_crash():
    """Fully busy day (pathological): eviction no-ops, tasks keep their times."""
    ctx = {
        "wake_time": "07:00",
        "sleep_time": "23:00",
        "obligations": [{"label": "work", "start": "07:00", "end": "23:00",
                         "days": ["monday", "tuesday", "wednesday", "thursday",
                                  "friday", "saturday", "sunday"]}],
    }
    from datetime import date
    schedules = {
        "skinmax": [_day([_task("Cleanse", "07:30", tags=["cleanse"])])],
        "hairmax": [_day([_task("Hair", "08:00")])],
    }
    out = reconcile_schedules(schedules, user_ctx=ctx, start_date=date(2026, 6, 8))
    assert len(_all_tasks(out)) == 2


def test_normalize_days_fills_canonical_fields():
    days = [_day([_task("X")])]
    normalize_days(days, "skinmax")
    t = days[0]["tasks"][0]
    assert t["task_uuid"]
    assert t["provenance"]["program_id"] == "skinmax"
    assert t["task_kind"] == "flexible"
    assert t["skippable_today"] is True
    assert 1 <= t["importance"] <= 5
