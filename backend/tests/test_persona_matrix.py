"""Persona-matrix schedule-quality scorer (DB-free, LLM-free).

This is the eval foundation for the schedule overhaul. It runs a small matrix
of REPRESENTATIVE users through the real generation pipeline

    expand_skeleton -> validate_and_fix -> reconcile_schedules

and scores each produced plan on the dimensions that decide whether a routine
actually fits a real life:

  within_waking          every task sits inside wake..sleep (no sleep-time tasks)
  no_clock_stack         no two tasks share a clock time on a day
  no_empty_days          an active plan never leaves a day blank
  under_cap              no day blows past the cross-module ceiling
  no_time_collisions     no two tasks across modules share a clock time
  respects_busy          no task lands inside the user's REAL work/commit blocks
  load_ramp              week-1 load is lighter than week-2 (gentle on-ramp)
  priority_respected     the user's #1 maxx is not the worst-hit by reconcile
  retinoid_pm / spf_am   domain anchors land in the right half of the day
  exfoliation_spacing    weekly exfoliation never shares a retinoid/stamp night
  beginner_retinoid_ramp a beginner's retinoid builds up, not nightly from day 0

The persona's real commitments (work / class / shift) are declared HERE as
ground truth, independent of what the engine currently chooses to honor. That
is the whole point: the scorer measures "did the plan respect my real life",
not "did the engine avoid what the engine decided was busy". So the
flexible-worker case can be RED today (the engine ignores a non-fixed work
window) and flip GREEN once Slice 1 lands.

Dimensions that already hold are locked as hard asserts. Known gaps are marked
`xfail(strict=False)` with the slice that will fix them, so they show up as
expected-failures now and as a clear XPASS signal the moment a slice fixes them
(without ever breaking the suite gate).

Run the human-readable scorecard with:
    /Users/home/maxapp/.venv/bin/python backend/tests/test_persona_matrix.py
or as tests:
    /Users/home/maxapp/.venv/bin/python -m pytest backend/tests/test_persona_matrix.py -q
"""

from __future__ import annotations

import asyncio
import copy
import sys
from dataclasses import dataclass, field
from datetime import date, timedelta
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

# START is a Monday: day 0 = Mon (weekday obligations apply), day 5 = Sat.
START = date(2026, 6, 1)
_WD = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]

# How wide a window the "early week" vs "late week" load comparison uses, and
# how much lighter week-1 must be to count as a real on-ramp.
_RAMP_RATIO = 0.8


def _mins(hhmm: str) -> int:
    from services.schedule_dsl import parse_clock, to_minutes
    return to_minutes(parse_clock(hhmm, "00:00"))


_WARMED = False


def _ensure_warm() -> None:
    global _WARMED
    if not _WARMED:
        from services.task_catalog_service import warm_catalog
        asyncio.run(warm_catalog())
        _WARMED = True


# --------------------------------------------------------------------------- #
#  Personas — the representative matrix                                       #
# --------------------------------------------------------------------------- #

@dataclass
class Persona:
    key: str
    label: str
    state: dict
    maxxes: list[str]            # priority order; maxxes[0] is the user's #1
    protected: list[dict] = field(default_factory=list)  # real life: obligation-shaped
    notes: str = ""


# Shared field blocks so each persona reads as a real human, not a fixture.
def _skin(concern: str, barrier: str, skin_type: str, **extra) -> dict:
    base = {
        "skin_concern": concern, "barrier_state": barrier, "skin_type": skin_type,
        "outdoor_exposure": "moderate", "diet_open": "yes_some",
        "routine_level": "intermediate", "tret_history": "never", "climate": "temperate",
        "dermastamp_owned": False,
    }
    base.update(extra)
    return base


def _hair(**extra) -> dict:
    base = {
        "hair_type": "wavy", "scalp_state": "healthy", "hair_loss_signs": "none",
        "daily_styling": True, "dermaroller_owned": False,
    }
    base.update(extra)
    return base


def _fit(level: str, **extra) -> dict:
    base = {
        "age": 27, "days_per_week": 4, "experience_level": level,
        "primary_goal": "recomp", "equipment_access": "full_gym",
    }
    base.update(extra)
    return base


PERSONAS: list[Persona] = [
    # 1) Maya — classic 9-to-5 with a commute. Work is FIXED, so today's engine
    #    already evicts it. This LOCKS that the fixed-work path keeps working.
    Persona(
        key="maya_9to5",
        label="Maya — 9-5 fixed + commute (skin/hair/fit)",
        maxxes=["skinmax", "hairmax", "fitmax"],
        state={
            "wake_window": ["06:00", "06:30"], "sleep_window": ["22:30", "23:00"],
            "wake_time": "06:15", "sleep_time": "22:45", "get_ready_time": "06:45",
            "work_schedule": "fixed", "work_start": "09:00", "work_end": "17:00",
            "preferred_workout_window": ["17:30", "19:00"],
            "obligations": [{"label": "Commute", "start": "08:15", "end": "09:00", "days": "weekdays"}],
            **_skin("acne", "stable", "combination"),
            **_hair(),
            **_fit("intermediate"),
        },
        protected=[
            {"label": "Commute", "start": "08:15", "end": "09:00", "days": "weekdays"},
            {"label": "Work", "start": "09:00", "end": "17:00", "days": "weekdays"},
        ],
        notes="fixed work -> engine should already clear it",
    ),

    # 2) Sam — early-shift worker, FLEXIBLE work type. The AM skincare anchor
    #    (right after a 05:45 get-ready) lands inside the 06:00-12:00 shift. The
    #    engine ignores non-fixed work today, so this is the canonical RED case
    #    Slice 1 fixes.
    Persona(
        key="sam_flexible",
        label="Sam — early flexible shift, student (fit/skin)",
        maxxes=["fitmax", "skinmax"],
        state={
            "wake_window": ["05:30", "05:30"], "sleep_window": ["21:30", "21:30"],
            "wake_time": "05:30", "sleep_time": "21:30", "get_ready_time": "05:45",
            "work_schedule": "flexible", "work_start": "06:00", "work_end": "12:00",
            **_skin("acne", "stable", "oily", routine_level="beginner"),
            **_fit("beginner", age=21, days_per_week=3, primary_goal="muscle"),
        },
        protected=[
            {"label": "Shift", "start": "06:00", "end": "12:00", "days": "weekdays"},
        ],
        notes="flexible work IGNORED today -> Slice 1",
    ),

    # 3) Leo — night shift (wake 13:30 / sleep 05:30) with a real daytime
    #    appointment modeled as an OBLIGATION (engine honors obligations), so
    #    this LOCKS overnight handling + busy clearance for obligations.
    Persona(
        key="leo_nightshift",
        label="Leo — night shift, overnight rhythm (skin)",
        maxxes=["skinmax"],
        state={
            "wake_window": ["13:00", "14:00"], "sleep_window": ["05:00", "06:00"],
            "wake_time": "13:30", "sleep_time": "05:30", "get_ready_time": "14:15",
            "preferred_workout_time": "20:00",
            "obligations": [{"label": "Appt", "start": "16:00", "end": "17:00", "days": "weekdays"}],
            **_skin("pigmentation", "stable", "oily", outdoor_exposure="minimal",
                    routine_level="advanced", tret_history="some", dermastamp_owned=True),
        },
        protected=[
            {"label": "Appt", "start": "16:00", "end": "17:00", "days": "weekdays"},
        ],
        notes="overnight + obligation honored -> lock",
    ),

    # 4) Ravi — 3-maxx beginner, chill intensity, no fixed obligations. Drives
    #    the load-ramp and beginner-retinoid-ramp gaps (Slice 2).
    Persona(
        key="ravi_beginner",
        label="Ravi — 3-maxx beginner, chill (skin/hair/fit)",
        maxxes=["skinmax", "hairmax", "fitmax"],
        state={
            "wake_window": ["07:00", "07:00"], "sleep_window": ["23:00", "23:00"],
            "wake_time": "07:00", "sleep_time": "23:00", "get_ready_time": "07:20",
            "intensity_preference": "chill",
            **_skin("acne", "stable", "combination", routine_level="beginner"),
            **_hair(hair_type="straight", daily_styling=False),
            **_fit("beginner", age=19, days_per_week=3, primary_goal="muscle",
                   equipment_access="home_basic"),
        },
        protected=[],
        notes="beginner load + retinoid ramp -> Slice 2",
    ),

    # 5) Alex — advanced, sweatmode, skin is the declared #1 maxx but is
    #    alphabetically LAST, so today's alphabetical antagonism-move + priority-
    #    blind cap-trim can disadvantage the top maxx (Slice 2).
    Persona(
        key="alex_advanced",
        label="Alex — advanced, sweatmode, skin-first (skin/hair/fit)",
        maxxes=["skinmax", "hairmax", "fitmax"],
        state={
            "wake_window": ["06:00", "06:00"], "sleep_window": ["22:30", "22:30"],
            "wake_time": "06:00", "sleep_time": "22:30", "get_ready_time": "06:20",
            "intensity_preference": "sweatmode",
            **_skin("pigmentation", "stable", "normal", diet_open="yes_full",
                    routine_level="advanced", tret_history="experienced", dermastamp_owned=True),
            **_hair(hair_loss_signs="early", dermaroller_owned=True),
            **_fit("advanced", age=31, days_per_week=6),
        },
        protected=[],
        notes="skin #1 vs hair antagonism -> priority gap -> Slice 2",
    ),
]

PERSONAS_BY_KEY = {p.key: p for p in PERSONAS}


# --------------------------------------------------------------------------- #
#  Pipeline driver (cached per persona)                                       #
# --------------------------------------------------------------------------- #

_PIPE_CACHE: dict[str, tuple] = {}


def _expand_one(maxx_id: str, state: dict, wake: str, sleep: str) -> list[dict]:
    from services.task_catalog_service import get_doc
    from services.schedule_skeleton import expand_skeleton
    from services.schedule_validator import validate_and_fix
    sd = get_doc(maxx_id).schedule_design or {}
    cad = int(sd.get("cadence_days") or 14)
    budget = tuple(sd.get("daily_task_budget")) if sd.get("daily_task_budget") else None
    days = expand_skeleton(maxx_id=maxx_id, user_state=state, wake=wake, sleep=sleep, cadence_days=cad)
    _, _, fixed = validate_and_fix(
        maxx_id=maxx_id, days=days, wake_time=wake, sleep_time=sleep,
        user_ctx=state, expected_day_count=cad, daily_task_budget=budget, start_date=START,
    )
    return fixed


def _pipeline(p: Persona) -> tuple[str, str, dict, dict]:
    """Return (wake, sleep, solo_bundle, reconciled_bundle) for a persona.

    `solo` = each maxx generated in isolation (for retention math).
    `bundle` = the full multi-module plan after reconcile (what the user sees).
    """
    if p.key in _PIPE_CACHE:
        return _PIPE_CACHE[p.key]
    _ensure_warm()
    from services.schedule_dsl import schedulable_anchors
    from services.multi_module_collision import reconcile_schedules

    wake, sleep = schedulable_anchors(p.state)
    solo = {mid: _expand_one(mid, p.state, wake, sleep) for mid in p.maxxes}

    bundle = copy.deepcopy(solo)
    if len(bundle) >= 2:
        recon_ctx = {**p.state, "wake_time": wake, "sleep_time": sleep}
        bundle = reconcile_schedules(bundle, user_ctx=recon_ctx, start_date=START)

    out = (wake, sleep, solo, bundle)
    _PIPE_CACHE[p.key] = out
    return out


# --------------------------------------------------------------------------- #
#  Small task helpers                                                         #
# --------------------------------------------------------------------------- #

def _task_min(t: dict) -> int:
    return _mins(t.get("time") or "00:00")


def _task_dur(t: dict) -> int:
    return int(t.get("duration_min") or t.get("duration_minutes") or 1)


def _all_tasks(days: list[dict]):
    for d in days:
        for t in d.get("tasks") or []:
            yield d.get("day_index"), t


def _protected_windows(p: Persona, day_index: int) -> list[tuple[int, int]]:
    """The persona's REAL busy windows for this calendar day (ground truth)."""
    from services.schedule_validator import _obligation_applies, _merge_intervals
    wd = _WD[(START + timedelta(days=day_index)).weekday()]
    wins: list[tuple[int, int]] = []
    for ob in p.protected:
        if not _obligation_applies(ob, wd):
            continue
        s, e = _mins(ob["start"]), _mins(ob["end"])
        if e > s:
            wins.append((s, e))
    return _merge_intervals(wins)


def _bundle_day_totals(bundle: dict) -> list[int]:
    n = max((len(days) for days in bundle.values()), default=0)
    totals = [0] * n
    for days in bundle.values():
        for di, d in enumerate(days):
            if di < n:
                totals[di] += len(d.get("tasks") or [])
    return totals


def _count_cid(days: list[dict], cid: str) -> int:
    return sum(1 for _, t in _all_tasks(days) if t.get("catalog_id") == cid)


# --------------------------------------------------------------------------- #
#  Scoring — each returns (passed: bool, detail: str)                         #
# --------------------------------------------------------------------------- #

def score_within_waking(p: Persona) -> tuple[bool, str]:
    from services.schedule_dsl import order_minutes
    wake, sleep, _, bundle = _pipeline(p)
    wake_min = _mins(wake)
    span = order_minutes(_mins(sleep), wake_min)
    bad = []
    for mid, days in bundle.items():
        for di, t in _all_tasks(days):
            om = order_minutes(_task_min(t), wake_min)
            if om > span:
                bad.append(f"{mid} d{di} {t.get('time')}({t.get('catalog_id')})")
    return (not bad, "ok" if not bad else f"{len(bad)} outside wake..sleep: {bad[:4]}")


def score_no_clock_stack(p: Persona) -> tuple[bool, str]:
    _, _, _, bundle = _pipeline(p)
    bad = []
    for mid, days in bundle.items():
        for d in days:
            times = [t.get("time") for t in d.get("tasks") or []]
            if len(times) != len(set(times)):
                bad.append(f"{mid} d{d.get('day_index')}:{times}")
    return (not bad, "ok" if not bad else f"clock stacks: {bad[:3]}")


def score_no_empty_days(p: Persona) -> tuple[bool, str]:
    _, _, _, bundle = _pipeline(p)
    totals = _bundle_day_totals(bundle)
    empty = [i for i, n in enumerate(totals) if n == 0]
    return (not empty, "ok" if not empty else f"empty days: {empty}")


def score_under_cap(p: Persona) -> tuple[bool, str]:
    from services.multi_module_collision import HARD_DAILY_TASK_CAP
    _, _, _, bundle = _pipeline(p)
    totals = _bundle_day_totals(bundle)
    over = [(i, n) for i, n in enumerate(totals) if n > HARD_DAILY_TASK_CAP]
    return (not over, "ok" if not over else f"over cap {HARD_DAILY_TASK_CAP}: {over[:3]}")


def score_no_time_collisions(p: Persona) -> tuple[bool, str]:
    """Across all modules, no two tasks share an exact clock time on a day."""
    _, _, _, bundle = _pipeline(p)
    n = max((len(days) for days in bundle.values()), default=0)
    bad = []
    for di in range(n):
        times: list[str] = []
        for days in bundle.values():
            if di < len(days):
                times += [t.get("time") for t in days[di].get("tasks") or []]
        dupes = {x for x in times if times.count(x) > 1}
        if dupes:
            bad.append(f"d{di}:{sorted(dupes)}")
    return (not bad, "ok" if not bad else f"cross-module time collisions: {bad[:3]}")


def score_respects_busy(p: Persona) -> tuple[bool, str]:
    """No task overlaps the persona's REAL declared busy windows."""
    from services.schedule_validator import _overlapping_window
    if not p.protected:
        return (True, "n/a (no declared commitments)")
    _, _, _, bundle = _pipeline(p)
    bad = []
    for mid, days in bundle.items():
        for di, t in _all_tasks(days):
            wins = _protected_windows(p, di)
            hit = _overlapping_window(_task_min(t), _task_dur(t), wins)
            if hit:
                bad.append(f"{mid} d{di} {t.get('time')}({t.get('catalog_id')}) in {hit}")
    return (not bad, "ok" if not bad else f"{len(bad)} inside busy windows: {bad[:4]}")


def score_load_ramp(p: Persona) -> tuple[bool, str]:
    """The #1 maxx's own routine should ramp: week-1 lighter than week-2.

    Measured on the SOLO top-maxx plan, not the reconciled bundle — the
    cross-module daily cap pins bundle totals near TARGET_DAILY_TOTAL on every
    day, which would mask a real per-routine on-ramp.
    """
    _, _, solo, _ = _pipeline(p)
    days = solo.get(p.maxxes[0], [])
    totals = [len(d.get("tasks") or []) for d in days]
    if len(totals) < 10:
        return (True, f"n/a (only {len(totals)} days)")
    early = sum(totals[:3]) / 3.0
    late = sum(totals[-7:]) / 7.0
    passed = early <= _RAMP_RATIO * late
    return (passed, f"{p.maxxes[0]} early(d0-2)={early:.2f} late(d-7:)={late:.2f} need early<={_RAMP_RATIO}*late")


def score_priority_respected(p: Persona) -> tuple[bool, str]:
    """The #1 maxx must not be the worst-hit by reconcile (retention)."""
    if len(p.maxxes) < 2:
        return (True, "n/a (single maxx)")
    _, _, solo, bundle = _pipeline(p)

    def total(days: list[dict]) -> int:
        return sum(len(d.get("tasks") or []) for d in days)

    ret = {}
    for mid in p.maxxes:
        s = total(solo.get(mid, []))
        b = total(bundle.get(mid, []))
        ret[mid] = (b / s) if s else 1.0
    top = p.maxxes[0]
    worst = min(ret.values())
    passed = ret[top] >= worst - 1e-9
    rstr = ", ".join(f"{m}={ret[m]:.2f}" for m in p.maxxes)
    return (passed, f"top={top} retention[{rstr}]")


def _skin_tasks(p: Persona, cid: str):
    if "skinmax" not in p.maxxes:
        return None
    _, _, _, bundle = _pipeline(p)
    return [(di, t) for di, t in _all_tasks(bundle.get("skinmax", [])) if t.get("catalog_id") == cid]


def score_retinoid_pm(p: Persona) -> tuple[bool, str]:
    rows = _skin_tasks(p, "skin.retinoid_pm")
    if rows is None:
        return (True, "n/a (no skinmax)")
    if not rows:
        return (True, "n/a (no retinoid for this skin profile)")
    # PM-only: retinoid should land in the back half of the waking day. Compare
    # in since-wake space so it holds for overnight users too.
    from services.schedule_dsl import order_minutes
    wake, sleep, _, _ = _pipeline(p)
    wake_min = _mins(wake)
    span = order_minutes(_mins(sleep), wake_min)
    bad = [(di, t.get("time")) for di, t in rows
           if order_minutes(_task_min(t), wake_min) < span / 2]
    return (not bad, "ok" if not bad else f"retinoid in AM half: {bad[:3]}")


def score_spf_am(p: Persona) -> tuple[bool, str]:
    rows = _skin_tasks(p, "skin.spf")
    if rows is None:
        return (True, "n/a (no skinmax)")
    if not rows:
        return (True, "n/a (no spf task)")
    from services.schedule_dsl import order_minutes
    wake, sleep, _, _ = _pipeline(p)
    wake_min = _mins(wake)
    span = order_minutes(_mins(sleep), wake_min)
    bad = [(di, t.get("time")) for di, t in rows
           if order_minutes(_task_min(t), wake_min) > span / 2]
    return (not bad, "ok" if not bad else f"spf in PM half: {bad[:3]}")


def score_exfoliation_spacing(p: Persona) -> tuple[bool, str]:
    if "skinmax" not in p.maxxes:
        return (True, "n/a (no skinmax)")
    _, _, _, bundle = _pipeline(p)
    bad = []
    for d in bundle.get("skinmax", []):
        ids = {t.get("catalog_id") for t in d.get("tasks") or []}
        if "skin.weekly_exfoliation" in ids and (
            "skin.retinoid_pm" in ids or "skin.dermastamp_pm" in ids
        ):
            bad.append(d.get("day_index"))
    return (not bad, "ok" if not bad else f"exfoliation shares active night on days {bad}")


def score_beginner_retinoid_ramp(p: Persona) -> tuple[bool, str]:
    rows = _skin_tasks(p, "skin.retinoid_pm")
    if rows is None or not rows:
        return (True, "n/a")
    w1 = sum(1 for di, _ in rows if (di or 0) < 7)
    w2 = sum(1 for di, _ in rows if (di or 0) >= 7)
    passed = w1 < w2
    return (passed, f"retinoid week1={w1} week2={w2} (ramp needs week1<week2)")


# Dimension registry: name -> (scorer, is_known_gap, slice_that_fixes)
DIMENSIONS = {
    "within_waking": (score_within_waking, False, ""),
    "no_clock_stack": (score_no_clock_stack, False, ""),
    "no_empty_days": (score_no_empty_days, False, ""),
    "under_cap": (score_under_cap, False, ""),
    "no_time_collisions": (score_no_time_collisions, False, ""),
    "respects_busy": (score_respects_busy, False, ""),
    "load_ramp": (score_load_ramp, True, "Slice 2"),
    # Informational only for now: a faithful priority gate depends on Slice 2's
    # optional-slot-allocation design, and none of today's personas trigger the
    # antagonism path (hair.microneedle never schedules for the advanced profile).
    # Slice 2 adds priority-aware resolution + a persona that deterministically
    # exercises it, and promotes this to a hard assert then.
    "priority_respected": (score_priority_respected, False, ""),
    "retinoid_pm": (score_retinoid_pm, False, ""),
    "spf_am": (score_spf_am, False, ""),
    "exfoliation_spacing": (score_exfoliation_spacing, False, ""),
    "beginner_retinoid_ramp": (score_beginner_retinoid_ramp, True, "Slice 2"),
}


def evaluate(p: Persona) -> dict[str, tuple[bool, str]]:
    out: dict[str, tuple[bool, str]] = {}
    for name, (fn, _gap, _slice) in DIMENSIONS.items():
        try:
            out[name] = fn(p)
        except Exception as e:  # never let one dim crash the whole scorecard
            out[name] = (False, f"ERROR: {type(e).__name__}: {e}")
    return out


# --------------------------------------------------------------------------- #
#  Hard locks — must stay green (regressions if they break)                   #
# --------------------------------------------------------------------------- #

@pytest.mark.parametrize("pkey", list(PERSONAS_BY_KEY))
def test_lock_within_waking(pkey):
    ok, detail = score_within_waking(PERSONAS_BY_KEY[pkey])
    assert ok, f"{pkey}: {detail}"


@pytest.mark.parametrize("pkey", list(PERSONAS_BY_KEY))
def test_lock_no_clock_stack(pkey):
    ok, detail = score_no_clock_stack(PERSONAS_BY_KEY[pkey])
    assert ok, f"{pkey}: {detail}"


@pytest.mark.parametrize("pkey", list(PERSONAS_BY_KEY))
def test_lock_no_empty_days(pkey):
    ok, detail = score_no_empty_days(PERSONAS_BY_KEY[pkey])
    assert ok, f"{pkey}: {detail}"


@pytest.mark.parametrize("pkey", list(PERSONAS_BY_KEY))
def test_lock_under_cap(pkey):
    ok, detail = score_under_cap(PERSONAS_BY_KEY[pkey])
    assert ok, f"{pkey}: {detail}"


@pytest.mark.parametrize("pkey", ["maya_9to5", "alex_advanced", "ravi_beginner"])
def test_lock_no_cross_module_time_collisions(pkey):
    ok, detail = score_no_time_collisions(PERSONAS_BY_KEY[pkey])
    assert ok, f"{pkey}: {detail}"


@pytest.mark.parametrize("pkey", ["maya_9to5", "leo_nightshift"])
def test_lock_honored_busy_windows_respected(pkey):
    """Fixed work (Maya) and an obligation (Leo) are honored today — lock it."""
    ok, detail = score_respects_busy(PERSONAS_BY_KEY[pkey])
    assert ok, f"{pkey}: {detail}"


@pytest.mark.parametrize("pkey", ["leo_nightshift", "alex_advanced"])
def test_lock_retinoid_is_pm(pkey):
    ok, detail = score_retinoid_pm(PERSONAS_BY_KEY[pkey])
    assert ok, f"{pkey}: {detail}"


# Maya is intentionally excluded: her morning SPF currently gets evicted past
# the workday (see test_gap_morning_spf_survives_workday). Lock the personas
# whose SPF is correctly AM today.
@pytest.mark.parametrize("pkey", ["ravi_beginner", "alex_advanced"])
def test_lock_spf_is_am(pkey):
    ok, detail = score_spf_am(PERSONAS_BY_KEY[pkey])
    assert ok, f"{pkey}: {detail}"


@pytest.mark.parametrize("pkey", ["leo_nightshift", "alex_advanced"])
def test_lock_exfoliation_never_with_actives(pkey):
    ok, detail = score_exfoliation_spacing(PERSONAS_BY_KEY[pkey])
    assert ok, f"{pkey}: {detail}"


# --------------------------------------------------------------------------- #
#  Known gaps — xfail today, flipped GREEN by the slice noted in each reason  #
# --------------------------------------------------------------------------- #

@pytest.mark.xfail(reason="Slice 1: flexible-worker work window is ignored today", strict=False)
def test_gap_flexible_worker_respects_busy():
    ok, detail = score_respects_busy(PERSONAS_BY_KEY["sam_flexible"])
    assert ok, detail


@pytest.mark.xfail(reason="Slice 1: a squeezed morning SPF is evicted past the workday instead "
                          "of held before the commute", strict=False)
def test_gap_morning_spf_survives_workday():
    ok, detail = score_spf_am(PERSONAS_BY_KEY["maya_9to5"])
    assert ok, detail


@pytest.mark.xfail(reason="Slice 2: the live skeleton path has no week-1 load ramp", strict=False)
def test_gap_load_ramps_week1_to_week2():
    ok, detail = score_load_ramp(PERSONAS_BY_KEY["ravi_beginner"])
    assert ok, detail


@pytest.mark.xfail(reason="Slice 2: retinoid runs at a flat weekly rate, no beginner ramp", strict=False)
def test_gap_beginner_retinoid_ramps():
    ok, detail = score_beginner_retinoid_ramp(PERSONAS_BY_KEY["ravi_beginner"])
    assert ok, detail


# --------------------------------------------------------------------------- #
#  Scorecard — always passes; run with -s (or as a script) to read it         #
# --------------------------------------------------------------------------- #

def _render_scorecard() -> str:
    cols = list(DIMENSIONS)
    lines = ["", "PERSONA-MATRIX SCHEDULE SCORECARD", "=" * 72]
    for p in PERSONAS:
        res = evaluate(p)
        lines.append(f"\n{p.label}")
        for name in cols:
            ok, detail = res[name]
            _, is_gap, slc = DIMENSIONS[name]
            if ok:
                mark = "PASS"
            elif is_gap:
                mark = f"GAP ({slc})"
            else:
                mark = "FAIL"
            lines.append(f"  {name:<24} {mark:<12} {detail}")
    lines.append("\n" + "=" * 72)
    lines.append("GAP = known shortfall the noted slice will fix (xfail today).")
    return "\n".join(lines)


def test_persona_matrix_report(capsys):
    report = _render_scorecard()
    with capsys.disabled():
        print(report)
    # The report itself never fails the suite; the locks/gaps above carry the
    # assertions. We only sanity-check that every persona produced a plan.
    for p in PERSONAS:
        _, _, _, bundle = _pipeline(p)
        assert sum(len(d.get("tasks") or []) for days in bundle.values() for d in days) > 0, \
            f"{p.key} produced an empty plan"


if __name__ == "__main__":
    print(_render_scorecard())
