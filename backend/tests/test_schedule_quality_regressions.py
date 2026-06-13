"""Regression tests for schedule-quality fixes (DB-free, LLM-free).

These lock in the three quality guarantees so the reported defects "don't
happen again":

  #28  Cross-midnight rendering — a night-shift user's "before bed" tasks
       resolve to distinct early-AM clock times instead of stacking at 23:59.
  #29  Busy-window clearance — multi-module reconcile never leaves a task
       sitting inside a fixed obligation (commute / work / class).
  #31  Day-distribution guard — validate_and_fix re-stamps collapsed
       day_index values positionally so a plan can never fold onto one date,
       and is a strict no-op on already-healthy day lists.

Run with `pytest backend/tests/test_schedule_quality_regressions.py -q`
under pyenv python 3.11.7 (system python 3.14 breaks the pydantic-v1 layer).
"""

from __future__ import annotations

import asyncio
import sys
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

# A Monday → day 0 = Mon (weekday obligations apply), day 5 = Sat.
START = date(2026, 6, 1)
_WD = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]


def _mins(hhmm: str) -> int:
    from services.schedule_dsl import parse_clock, to_minutes
    return to_minutes(parse_clock(hhmm, "00:00"))


# --------------------------------------------------------------------------- #
#  #28 — cross-midnight rendering (night-shift "before bed" tasks)            #
# --------------------------------------------------------------------------- #

def test_overnight_user_has_no_clock_stack():
    """Night-shift user (wake 13:30 / sleep 05:30): PM 'before bed' tasks must
    resolve to distinct early-AM clock times, never collapse onto 23:59."""
    from services.task_catalog_service import warm_catalog, get_doc
    from services.schedule_skeleton import expand_skeleton, has_skeleton
    from services.schedule_validator import validate_and_fix
    from services.schedule_dsl import schedulable_anchors
    asyncio.run(warm_catalog())

    state = {
        "wake_window": ["13:00", "14:00"], "sleep_window": ["05:00", "06:00"],
        "wake_time": "13:30", "sleep_time": "05:30",
        "get_ready_time": "14:15", "preferred_workout_time": "20:00",
        "skin_concern": "pigmentation", "barrier_state": "stable", "skin_type": "oily",
        "outdoor_exposure": "minimal", "diet_open": "yes_some", "dermastamp_owned": True,
    }
    wake, sleep = schedulable_anchors(state)
    assert _mins(sleep) <= _mins(wake), "this persona must be a cross-midnight (overnight) user"

    doc = get_doc("skinmax")
    sd = doc.schedule_design or {}
    cad = int(sd.get("cadence_days") or 14)
    budget = tuple(sd.get("daily_task_budget")) if sd.get("daily_task_budget") else None
    assert has_skeleton("skinmax")

    days = expand_skeleton(maxx_id="skinmax", user_state=state, wake=wake, sleep=sleep, cadence_days=cad)
    ok, errs, fixed = validate_and_fix(
        maxx_id="skinmax", days=days, wake_time=wake, sleep_time=sleep,
        user_ctx=state, expected_day_count=cad, daily_task_budget=budget, start_date=START,
    )
    assert ok, [e.message for e in errs if e.severity == "hard"]

    saw_post_midnight = False
    for d in fixed:
        times = [t.get("time") for t in d.get("tasks") or []]
        # No two tasks share a clock time — the 23:59-stack symptom.
        assert len(times) == len(set(times)), f"clock stack on day {d.get('day_index')}: {times}"
        # No clamped 23:59 pile-up.
        assert times.count("23:59") <= 1, f"23:59 stack on day {d.get('day_index')}: {times}"
        # At least one "before bed" task wrapped into the early-AM hours,
        # proving from_minutes WRAPS (mod 1440) rather than clamping to 23:59.
        if any(_mins(t) < 7 * 60 for t in times):
            saw_post_midnight = True
    assert saw_post_midnight, "expected PM tasks to wrap into early-AM clock for an overnight user"


def test_overnight_day_is_ordered_since_wake():
    """For an overnight user, a day's tasks are ordered by minutes-since-wake,
    so afternoon wake tasks come BEFORE the post-midnight wind-down tasks."""
    from services.task_catalog_service import warm_catalog, get_doc
    from services.schedule_skeleton import expand_skeleton
    from services.schedule_validator import validate_and_fix
    from services.schedule_dsl import schedulable_anchors, order_minutes, parse_clock, to_minutes
    asyncio.run(warm_catalog())

    state = {
        "wake_window": ["13:00", "14:00"], "sleep_window": ["05:00", "06:00"],
        "wake_time": "13:30", "sleep_time": "05:30", "get_ready_time": "14:15",
        "skin_concern": "pigmentation", "barrier_state": "stable", "skin_type": "oily",
        "outdoor_exposure": "minimal", "diet_open": "yes_some", "dermastamp_owned": True,
    }
    wake, sleep = schedulable_anchors(state)
    wake_min = to_minutes(parse_clock(wake, "07:00"))
    cad = int((get_doc("skinmax").schedule_design or {}).get("cadence_days") or 14)

    days = expand_skeleton(maxx_id="skinmax", user_state=state, wake=wake, sleep=sleep, cadence_days=cad)
    _, _, fixed = validate_and_fix(
        maxx_id="skinmax", days=days, wake_time=wake, sleep_time=sleep,
        user_ctx=state, expected_day_count=cad, start_date=START,
    )
    for d in fixed:
        work_seq = [order_minutes(_mins(t.get("time")), wake_min) for t in d.get("tasks") or []]
        assert work_seq == sorted(work_seq), f"day {d.get('day_index')} not ordered since-wake: {work_seq}"


def test_overnight_order_survives_day_windows_pass():
    """Overnight user WITH an obligation triggers the busy-window pass
    (_apply_day_windows), which works in clock space. The authoritative final
    re-sort must still leave the stored array in since-wake order."""
    from services.task_catalog_service import warm_catalog, get_doc
    from services.schedule_skeleton import expand_skeleton
    from services.schedule_validator import validate_and_fix, _busy_intervals_from_ctx, _effective_day_ctx
    from services.schedule_dsl import schedulable_anchors, order_minutes, parse_clock, to_minutes
    asyncio.run(warm_catalog())

    state = {
        "wake_window": ["13:00", "14:00"], "sleep_window": ["05:00", "06:00"],
        "wake_time": "13:30", "sleep_time": "05:30", "get_ready_time": "14:15",
        # A daytime appointment (NOT overnight) so it registers as a busy window
        # and forces _apply_day_windows to run.
        "obligations": [{"label": "Errand", "start": "15:00", "end": "16:00", "days": "weekdays"}],
        "skin_concern": "pigmentation", "barrier_state": "stable", "skin_type": "oily",
        "outdoor_exposure": "minimal", "diet_open": "yes_some", "dermastamp_owned": True,
    }
    wake, sleep = schedulable_anchors(state)
    wake_min = to_minutes(parse_clock(wake, "07:00"))
    cad = int((get_doc("skinmax").schedule_design or {}).get("cadence_days") or 14)

    # Sanity: the busy window must be non-empty (else the pass wouldn't run).
    eff = _effective_day_ctx(state, "monday", global_wake=wake, global_sleep=sleep)
    assert _busy_intervals_from_ctx(eff), "expected a busy window to exercise _apply_day_windows"

    days = expand_skeleton(maxx_id="skinmax", user_state=state, wake=wake, sleep=sleep, cadence_days=cad)
    _, _, fixed = validate_and_fix(
        maxx_id="skinmax", days=days, wake_time=wake, sleep_time=sleep,
        user_ctx=state, expected_day_count=cad, start_date=START,
    )
    for d in fixed:
        work_seq = [order_minutes(_mins(t.get("time")), wake_min) for t in d.get("tasks") or []]
        assert work_seq == sorted(work_seq), f"day {d.get('day_index')} not since-wake ordered: {work_seq}"


# --------------------------------------------------------------------------- #
#  #29 — busy-window clearance across modules                                 #
# --------------------------------------------------------------------------- #

def _busy_windows(state: dict, day_index: int, wake: str, sleep: str):
    from services.schedule_validator import _effective_day_ctx, _busy_intervals_from_ctx
    wd = _WD[(START + timedelta(days=day_index)).weekday()]
    eff = _effective_day_ctx(state, wd, global_wake=wake, global_sleep=sleep)
    return _busy_intervals_from_ctx(eff)


def test_multimodule_reconcile_clears_busy_windows():
    """Maya (9–5 with commute): after multi-module reconcile, no task in any
    module may sit inside a fixed obligation on any day."""
    from services.task_catalog_service import warm_catalog, get_doc
    from services.schedule_skeleton import expand_skeleton, has_skeleton
    from services.schedule_validator import validate_and_fix
    from services.schedule_dsl import schedulable_anchors
    from services.multi_module_collision import reconcile_schedules
    asyncio.run(warm_catalog())

    state = {
        "wake_window": ["06:00", "06:30"], "sleep_window": ["22:30", "23:00"],
        "wake_time": "06:15", "sleep_time": "22:45", "get_ready_time": "06:45",
        "preferred_workout_window": ["17:00", "19:00"],
        "obligations": [
            {"label": "Commute", "start": "08:15", "end": "09:00", "days": "weekdays"},
            {"label": "Work", "start": "09:00", "end": "17:00", "days": "weekdays"},
        ],
        "skin_concern": "acne", "barrier_state": "stable", "skin_type": "combination",
        "outdoor_exposure": "moderate", "diet_open": "yes_some", "dermastamp_owned": False,
        "hair_type": "wavy", "scalp_state": "healthy", "hair_loss_signs": "none",
        "daily_styling": True, "dermaroller_owned": False,
        "age": 28, "days_per_week": 4, "experience_level": "intermediate",
        "primary_goal": "recomp", "equipment_access": "full_gym",
    }
    wake, sleep = schedulable_anchors(state)

    bundle: dict[str, list[dict]] = {}
    cad_by_max: dict[str, int] = {}
    for mid in ("skinmax", "hairmax", "fitmax"):
        assert has_skeleton(mid)
        sd = get_doc(mid).schedule_design or {}
        cad = int(sd.get("cadence_days") or 14)
        cad_by_max[mid] = cad
        budget = tuple(sd.get("daily_task_budget")) if sd.get("daily_task_budget") else None
        days = expand_skeleton(maxx_id=mid, user_state=state, wake=wake, sleep=sleep, cadence_days=cad)
        _, _, fixed = validate_and_fix(
            maxx_id=mid, days=days, wake_time=wake, sleep_time=sleep,
            user_ctx=state, expected_day_count=cad, daily_task_budget=budget, start_date=START,
        )
        bundle[mid] = fixed

    recon_ctx = {**state, "wake_time": wake, "sleep_time": sleep}
    bundle = reconcile_schedules(bundle, user_ctx=recon_ctx, start_date=START)

    conflicts = []
    for mid, days in bundle.items():
        for di, d in enumerate(days):
            windows = _busy_windows(state, di, wake, sleep)
            for t in d.get("tasks") or []:
                tm = _mins(t.get("time"))
                for (s, e) in windows:
                    if s <= tm < e:
                        conflicts.append((mid, di, t.get("title"), t.get("time"), (s, e)))
    assert not conflicts, f"tasks left inside busy windows: {conflicts[:6]}"


def test_spf_clears_commute_flush_before():
    """The original report: SPF landed inside the 08:15 commute. After the
    fix it must clear the commute on weekdays (flush-before at/under 08:15,
    or after 09:00) — never inside it."""
    from services.task_catalog_service import warm_catalog, get_doc
    from services.schedule_skeleton import expand_skeleton
    from services.schedule_validator import validate_and_fix
    from services.schedule_dsl import schedulable_anchors
    from services.multi_module_collision import reconcile_schedules
    asyncio.run(warm_catalog())

    state = {
        "wake_window": ["06:00", "06:30"], "sleep_window": ["22:30", "23:00"],
        "wake_time": "06:15", "sleep_time": "22:45", "get_ready_time": "06:45",
        "preferred_workout_window": ["17:00", "19:00"],
        "obligations": [
            {"label": "Commute", "start": "08:15", "end": "09:00", "days": "weekdays"},
            {"label": "Work", "start": "09:00", "end": "17:00", "days": "weekdays"},
        ],
        "skin_concern": "acne", "barrier_state": "stable", "skin_type": "combination",
        "outdoor_exposure": "moderate", "diet_open": "yes_some", "dermastamp_owned": False,
        "hair_type": "wavy", "scalp_state": "healthy", "hair_loss_signs": "none",
        "daily_styling": True, "dermaroller_owned": False,
        "age": 28, "days_per_week": 4, "experience_level": "intermediate",
        "primary_goal": "recomp", "equipment_access": "full_gym",
    }
    wake, sleep = schedulable_anchors(state)
    bundle = {}
    for mid in ("skinmax", "hairmax", "fitmax"):
        sd = get_doc(mid).schedule_design or {}
        cad = int(sd.get("cadence_days") or 14)
        days = expand_skeleton(maxx_id=mid, user_state=state, wake=wake, sleep=sleep, cadence_days=cad)
        _, _, fixed = validate_and_fix(
            maxx_id=mid, days=days, wake_time=wake, sleep_time=sleep,
            user_ctx=state, expected_day_count=cad, start_date=START,
        )
        bundle[mid] = fixed
    bundle = reconcile_schedules(bundle, user_ctx={**state, "wake_time": wake, "sleep_time": sleep}, start_date=START)

    commute = (_mins("08:15"), _mins("09:00"))
    checked = 0
    for di, d in enumerate(bundle["skinmax"]):
        if _WD[(START + timedelta(days=di)).weekday()] in ("saturday", "sunday"):
            continue  # commute is weekdays-only
        for t in d.get("tasks") or []:
            # SPF now lives inside the single personalized morning routine task.
            if t.get("catalog_id") == "skin.am_routine":
                tm = _mins(t.get("time"))
                assert not (commute[0] <= tm < commute[1]), \
                    f"morning skincare inside commute on day {di}: {t.get('time')}"
                checked += 1
    assert checked > 0, "expected at least one weekday morning-routine task to verify"


# --------------------------------------------------------------------------- #
#  #31 — day-distribution guard                                               #
# --------------------------------------------------------------------------- #

def test_day_distribution_guard_reindexes_collapsed_days():
    """Days arriving with duplicate/missing day_index (the collapse signature)
    get re-stamped to distinct sequential indices, with a soft error flag."""
    from services.task_catalog_service import warm_catalog
    from services.schedule_validator import validate_and_fix
    asyncio.run(warm_catalog())

    # Three days, all collapsed onto day_index 0 (what a bad producer emits).
    days = [
        {"day_index": 0, "tasks": [{"catalog_id": "skin.cleanse_am", "time": "07:00", "title": "wash"}]},
        {"day_index": 0, "tasks": [{"catalog_id": "skin.moisturize_am", "time": "07:10", "title": "moist"}]},
        {"day_index": 0, "tasks": [{"catalog_id": "skin.spf", "time": "07:20", "title": "spf"}]},
    ]
    clean, errs, fixed = validate_and_fix(
        maxx_id="skinmax", days=days, wake_time="07:00", sleep_time="23:00",
        user_ctx={"skin_concern": "acne", "barrier_state": "stable", "skin_type": "oily"},
        expected_day_count=3,
    )
    assert clean, [e.message for e in errs if e.severity == "hard"]
    out_ix = [d.get("day_index") for d in fixed]
    assert out_ix == [0, 1, 2], f"day_index not re-stamped distinctly: {out_ix}"
    assert any(e.code == "day_index_repaired" for e in errs)


def test_day_distribution_guard_flags_single_day_for_multiday_plan():
    """A multi-day plan delivered as a single day entry is the literal
    'all tasks in one day' failure — surfaced for observability."""
    from services.task_catalog_service import warm_catalog
    from services.schedule_validator import validate_and_fix
    asyncio.run(warm_catalog())

    days = [{"day_index": 0, "tasks": [
        {"catalog_id": "skin.cleanse_am", "time": "07:00", "title": "wash"},
        {"catalog_id": "skin.spf", "time": "07:20", "title": "spf"},
    ]}]
    clean, errs, _ = validate_and_fix(
        maxx_id="skinmax", days=days, wake_time="07:00", sleep_time="23:00",
        user_ctx={"skin_concern": "acne", "barrier_state": "stable", "skin_type": "oily"},
        expected_day_count=14,
    )
    assert any(e.code == "day_bunching_detected" for e in errs)


def test_day_distribution_guard_is_noop_on_healthy_days():
    """Healthy, already-sequential day_index → guard changes nothing and emits
    no repair/bunching error (strict no-op + idempotent)."""
    from services.task_catalog_service import warm_catalog
    from services.schedule_validator import validate_and_fix
    asyncio.run(warm_catalog())

    days = [
        {"day_index": 0, "tasks": [{"catalog_id": "skin.cleanse_am", "time": "07:00", "title": "wash"}]},
        {"day_index": 1, "tasks": [{"catalog_id": "skin.cleanse_am", "time": "07:00", "title": "wash"}]},
        {"day_index": 2, "tasks": [{"catalog_id": "skin.cleanse_am", "time": "07:00", "title": "wash"}]},
    ]
    clean, errs, fixed = validate_and_fix(
        maxx_id="skinmax", days=days, wake_time="07:00", sleep_time="23:00",
        user_ctx={"skin_concern": "acne", "barrier_state": "stable", "skin_type": "oily"},
        expected_day_count=3,
    )
    assert clean, [e.message for e in errs if e.severity == "hard"]
    assert [d.get("day_index") for d in fixed] == [0, 1, 2]
    assert not any(e.code in ("day_index_repaired", "day_bunching_detected") for e in errs)


# --------------------------------------------------------------------------- #
#  #48 — skeleton slot saturation (weekly_exfoliation + am_active picker)      #
# --------------------------------------------------------------------------- #

def _skin_days(state: dict) -> list[dict]:
    """Expand a 14-day skinmax skeleton for `state` (catalog already warm)."""
    from services.schedule_skeleton import expand_skeleton
    return expand_skeleton(
        maxx_id="skinmax", user_state=state, wake="07:00", sleep="23:00", cadence_days=14
    )


def _id_counts(days: list[dict]) -> dict[str, int]:
    out: dict[str, int] = {}
    for d in days:
        for t in d.get("tasks") or []:
            cid = t.get("catalog_id")
            out[cid] = out.get(cid, 0) + 1
    return out


_BASE_SKIN = {
    "skin_type": "normal", "routine_level": "advanced", "outdoor_exposure": "moderate",
    "tret_history": "never", "climate": "temperate", "diet_open": "yes_some",
}


def test_weekly_exfoliation_lands_once_a_week_for_stable_pigmentation():
    """The reported bug: weekly_exfoliation shared the pm_active slot with a
    picker that filled every night, so its not_with_same_day guard dropped it
    on every day and it NEVER appeared. It must now land ~1x/week and never
    share a night with a retinoid or dermastamp."""
    from services.task_catalog_service import warm_catalog
    asyncio.run(warm_catalog())

    state = {**_BASE_SKIN, "skin_concern": "pigmentation",
             "barrier_state": "stable", "dermastamp_owned": True}
    days = _skin_days(state)
    counts = _id_counts(days)

    # ~1/week over a 14-day horizon = 2 placements (tolerate 1–3 for phase).
    assert 1 <= counts.get("skin.weekly_exfoliation", 0) <= 3, (
        f"weekly_exfoliation should appear ~1x/week, got "
        f"{counts.get('skin.weekly_exfoliation', 0)}"
    )

    # Separation guarantee: never on a retinoid or dermastamp night.
    for d in days:
        ids = {t.get("catalog_id") for t in d.get("tasks") or []}
        if "skin.weekly_exfoliation" in ids:
            assert "skin.retinoid_pm" not in ids, f"exfoliation shares retinoid night (day {d['day_index']})"
            assert "skin.dermastamp_pm" not in ids, f"exfoliation shares dermastamp night (day {d['day_index']})"


def _first_task(days, cid):
    return next((t for d in days for t in (d.get("tasks") or []) if t.get("catalog_id") == cid), None)


def test_weekly_exfoliation_gated_out_for_damaged_barrier():
    """Damaged barrier: the separate weekly exfoliation must still be gated out,
    and the personalized AM/PM routine must drop all actives while it heals."""
    from services.task_catalog_service import warm_catalog
    asyncio.run(warm_catalog())

    state = {**_BASE_SKIN, "skin_concern": "pigmentation",
             "barrier_state": "damaged", "dermastamp_owned": True}
    days = _skin_days(state)
    counts = _id_counts(days)

    assert counts.get("skin.weekly_exfoliation", 0) == 0, "exfoliation must be gated out on damaged barrier"
    # The routine composer strips actives and says so while the barrier recovers.
    am = _first_task(days, "skin.am_routine")
    pm = _first_task(days, "skin.pm_routine")
    assert am and "no actives" in am["description"].lower(), am
    assert pm and "no actives" in pm["description"].lower(), pm


def test_weekly_exfoliation_absent_for_untargeted_concern():
    """`maintenance` is not in the exfoliation target list, so it must not
    appear even when the barrier is stable (the `if` gate still rules)."""
    from services.task_catalog_service import warm_catalog
    asyncio.run(warm_catalog())

    state = {**_BASE_SKIN, "skin_concern": "maintenance",
             "barrier_state": "stable", "dermastamp_owned": True}
    days = _skin_days(state)
    counts = _id_counts(days)
    assert counts.get("skin.weekly_exfoliation", 0) == 0, "exfoliation must not target 'maintenance'"
    # Sanity: the evening routine still carries a retinoid/retinol for maintenance.
    pm = _first_task(days, "skin.pm_routine")
    assert pm and "retin" in pm["description"].lower(), pm


def test_am_routine_is_one_personalized_daily_task():
    """The morning core is now a SINGLE task that appears every day and whose
    steps are personalized to the concern (pigmentation → vitamin C / azelaic)."""
    from services.task_catalog_service import warm_catalog
    asyncio.run(warm_catalog())

    days = _skin_days(
        {**_BASE_SKIN, "skin_concern": "pigmentation", "barrier_state": "stable", "dermastamp_owned": False}
    )
    counts = _id_counts(days)
    assert counts.get("skin.am_routine", 0) == 14, (
        f"AM routine should be one task daily, got {counts.get('skin.am_routine', 0)}"
    )
    # The morning core never contains separate cleanse/moisturize/spf tasks.
    for legacy in ("skin.cleanse_am", "skin.moisturize_am", "skin.spf", "skin.azelaic_am"):
        assert counts.get(legacy, 0) == 0, f"{legacy} should be folded into skin.am_routine"
    am = _first_task(days, "skin.am_routine")
    d = am["description"].lower()
    assert "vitamin c" in d or "azelaic" in d, am


def test_pm_routine_is_one_personalized_daily_task():
    """The evening core is one daily task carrying the personalized treatment
    (pigmentation → retinoid / azelaic), with no separate per-step tasks."""
    from services.task_catalog_service import warm_catalog
    asyncio.run(warm_catalog())

    days = _skin_days(
        {**_BASE_SKIN, "skin_concern": "pigmentation", "barrier_state": "stable", "dermastamp_owned": True}
    )
    counts = _id_counts(days)
    assert counts.get("skin.pm_routine", 0) == 14, (
        f"PM routine should be one task daily, got {counts.get('skin.pm_routine', 0)}"
    )
    for legacy in ("skin.cleanse_pm", "skin.moisturize_pm", "skin.retinoid_pm"):
        assert counts.get(legacy, 0) == 0, f"{legacy} should be folded into skin.pm_routine"
    pm = _first_task(days, "skin.pm_routine")
    d = pm["description"].lower()
    assert "retin" in d or "azelaic" in d, pm
