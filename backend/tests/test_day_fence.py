"""Day fence — every persisted task inside waking hours, clear of work
(lunch excepted), done by bedtime, and never without a clock time.

Pure-function tests, house style (no DB)."""
from __future__ import annotations

import copy

import pytest

from services.day_fence import (
    DEFAULT_LUNCH_START,
    LUNCH_MIN,
    WORK_MIN_BLOCK_MIN,
    day_fence_for,
    fence_day,
    fence_days,
    fence_violations,
)
from services.multi_module_collision import reconcile_schedules

MON = "2026-09-28"   # a Monday
TUE = "2026-09-29"


def _t(time, title="task", dur=10, **kw):
    return {"time": time, "title": title, "duration_min": dur, **kw}


def _day(tasks, date=MON):
    return {"date": date, "tasks": tasks}


def _times(day):
    return [t["time"] for t in day["tasks"]]


# ── resolving the fence ───────────────────────────────────────────────────────

def test_fence_defaults_and_frame():
    f = day_fence_for({})
    assert (f.wake, f.length, f.work) == (7 * 60, 16 * 60, ())
    assert f.frame(7 * 60) == 0 and f.frame(23 * 60) == 16 * 60
    assert f.clock(f.frame(9 * 60 + 5)) == 9 * 60 + 5


def test_night_owl_frame_wraps_midnight():
    f = day_fence_for({"wake_time": "14:00", "sleep_time": "05:00"})
    assert f.length == 15 * 60
    assert f.frame(1 * 60 + 30) == 11 * 60 + 30     # 01:30 is deep in the day, not before wake
    assert f.frame(13 * 60) == 23 * 60               # 13:00 is the last hour before wake


def test_weekday_override_beats_global_rhythm():
    state = {"wake_time": "07:00", "sleep_time": "23:00",
             "weekly_timings": {"saturday": {"wake_time": "09:30", "sleep_time": "00:30"}}}
    sat = day_fence_for(state, "saturday")
    assert (sat.wake, sat.length) == (9 * 60 + 30, 15 * 60)
    assert day_fence_for(state, "monday").wake == 7 * 60


def test_work_hours_are_busy_except_lunch():
    f = day_fence_for({"work_start": "09:00", "work_end": "17:00"})
    lunch = (DEFAULT_LUNCH_START, DEFAULT_LUNCH_START + LUNCH_MIN)
    assert f.work == ((2 * 60, f.frame(lunch[0])), (f.frame(lunch[1]), 10 * 60))


def test_stated_lunch_and_skipped_lunch():
    f = day_fence_for({"work_start": "09:00", "work_end": "17:00", "lunch_time": "13:00"})
    assert f.work == ((2 * 60, 6 * 60), (6 * 60 + LUNCH_MIN, 10 * 60))
    g = day_fence_for({"work_start": "09:00", "work_end": "17:00", "meals_skipped": ["lunch"]})
    assert g.work == ((2 * 60, 10 * 60),)


def test_only_long_commitments_count_as_work_and_only_on_their_days():
    state = {"obligations": [
        {"label": "class", "start": "10:00", "end": "13:30", "days": ["monday"]},
        {"label": "dentist", "start": "15:00", "end": "15:45"},   # < WORK_MIN_BLOCK_MIN: not work
    ]}
    assert WORK_MIN_BLOCK_MIN == 180
    assert day_fence_for(state, "monday").work == ((3 * 60, 6 * 60 + 30),)   # no lunch carved from a 3.5h class
    assert day_fence_for(state, "tuesday").work == ()


def test_a_workday_entered_as_a_commitment_keeps_its_lunch_break():
    state = {"obligations": [{"label": "work", "start": "09:00", "end": "17:00", "days": "weekdays"}]}
    f = day_fence_for(state, "wednesday")
    assert f.work == ((2 * 60, f.frame(DEFAULT_LUNCH_START)), (f.frame(DEFAULT_LUNCH_START + LUNCH_MIN), 10 * 60))
    assert day_fence_for(state, "sunday").work == ()


# ── fencing a day ─────────────────────────────────────────────────────────────

def test_a_day_inside_the_fence_is_untouched():
    day = _day([_t("07:20", "am skincare", 7), _t("12:40", "walk", 15), _t("21:30", "pm skincare", 5)])
    before = copy.deepcopy(day)
    fence_days([day], {"wake_time": "07:00", "sleep_time": "23:00", "work_start": "09:00", "work_end": "17:00"})
    assert day == before


def test_after_bedtime_is_pulled_back_to_end_by_bedtime():
    # the production shape: bonemax "train your neck" at 23:25 for a 23:00 sleeper
    day = _day([_t("21:30", "pm skincare", 5), _t("23:25", "train your neck", 5), _t("23:30", "tape your lips", 1)])
    fence_days([day], {"wake_time": "07:00", "sleep_time": "23:00"})
    times = _times(day)
    assert times[0] == "21:30"
    assert times[-1] <= "22:59" and times[1] < times[2]
    # every task ends by 23:00 with the 15-min gap kept between the pulled ones
    assert times == ["21:30", "22:39", "22:59"]


def test_bedtime_pullback_keeps_order_and_gaps_when_the_evening_is_packed():
    day = _day([_t("22:20", "a", 10), _t("22:40", "b", 10), _t("23:00", "c", 10), _t("23:20", "d", 10)])
    fence_days([day], {"wake_time": "07:00", "sleep_time": "23:00"})
    assert _times(day) == ["21:35", "22:00", "22:25", "22:50"]


def test_before_wake_moves_to_wake():
    day = _day([_t("06:40", "sun", 10)])
    fence_days([day], {"wake_time": "07:00", "sleep_time": "23:00"})
    assert _times(day) == ["07:00"]


def test_inside_work_moves_out_but_lunch_stays_open():
    # humanize's crunch nudge put a task at 09:05 with 9-5 work; the 12:40 one sits in lunch
    day = _day([_t("09:05", "posture reset", 5), _t("12:40", "walk", 15), _t("15:00", "water", 1)])
    fence_days([day], {"wake_time": "07:00", "sleep_time": "23:00", "work_start": "09:00", "work_end": "17:00"})
    # the evicted 09:05 task takes the start of lunch; the walk keeps its gap behind it
    assert _times(day) == ["12:30", "12:50", "17:00"]


def test_work_is_per_weekday():
    state = {"wake_time": "07:00", "sleep_time": "23:00",
             "obligations": [{"label": "class", "start": "10:00", "end": "13:30", "days": ["monday"]}]}
    mon, tue = _day([_t("10:30", "x", 5)], MON), _day([_t("10:30", "x", 5)], TUE)
    fence_days([mon, tue], state)
    assert _times(mon) == ["13:30"] and _times(tue) == ["10:30"]


def test_missing_time_lands_an_hour_after_wake():
    day = _day([{"title": "no clock", "duration_min": 5}, _t("07:30", "am", 5)])
    fence_days([day], {"wake_time": "06:00", "sleep_time": "22:00"})
    assert _times(day) == ["07:00", "07:30"]


def test_night_owl_day_is_fenced_in_its_own_frame():
    # 14:00 riser, bed 05:00: a 05:20 task is past bed; 01:30 is fine
    day = _day([_t("14:10", "am", 5), _t("01:30", "pm skincare", 5), _t("05:20", "wind down", 5)])
    fence_days([day], {"wake_time": "14:00", "sleep_time": "05:00"})
    assert "04:55" in _times(day) and "01:30" in _times(day) and "14:10" in _times(day)


def test_fence_is_idempotent():
    state = {"wake_time": "07:00", "sleep_time": "23:00", "work_start": "09:00", "work_end": "17:00"}
    day = _day([_t("09:05", "a", 5), _t("23:25", "b", 5), _t("06:00", "c", 10)])
    fence_days([day], state)
    once = copy.deepcopy(day)
    fence_days([day], state)
    assert day == once


def test_bedtime_pullback_never_lands_inside_work():
    # bed 15 min after work ends: a 20-min task can't fit after work, so it goes before it
    state = {"wake_time": "07:00", "sleep_time": "17:15", "work_start": "09:00", "work_end": "17:00", "meals_skipped": ["lunch"]}
    day = _day([_t("18:00", "pm", 20)])
    fence_days([day], state)
    assert _times(day) == ["08:40"]


def test_before_wake_vs_past_bedtime_is_decided_by_the_nearer_edge():
    state = {"wake_time": "07:00", "sleep_time": "23:00"}
    early, late = _day([_t("06:40", "a", 10)]), _day([_t("23:25", "b", 10)])
    fence_days([early, late], state)
    assert _times(early) == ["07:00"] and _times(late) == ["22:50"]


def test_fence_day_reports_how_many_moved():
    f = day_fence_for({"wake_time": "07:00", "sleep_time": "23:00"})
    tasks = [_t("07:10", "a", 5), _t("23:40", "b", 5)]
    assert fence_day(tasks, f) == 1
    assert fence_day(tasks, f) == 0


def test_violations_audit_names_the_reason():
    state = {"wake_time": "07:00", "sleep_time": "23:00", "work_start": "09:00", "work_end": "17:00"}
    days = [_day([_t("10:00", "in work", 5), _t("23:30", "late", 5), {"title": "no clock"}, _t("12:45", "lunch", 5)])]
    why = {v["title"]: v["why"] for v in fence_violations(days, state)}
    assert why == {"in work": "inside work", "late": "after bedtime", "no clock": "no time"}


# ── the collision pass no longer mints 00:14 for a task with no time ─────────

def test_reconcile_gives_a_timeless_task_a_morning_slot():
    a = [_day([_t("08:00", "skin", 5, catalog_id="skin-am")])]
    b = [_day([{"title": "no clock", "duration_min": 5, "catalog_id": "neck"}])]
    out = reconcile_schedules({"skinmax": a, "bonemax": b}, user_ctx={"wake_time": "07:00", "sleep_time": "23:00"})
    times = {t["title"]: t["time"] for days in out.values() for d in days for t in d["tasks"]}
    assert times["no clock"] >= "08:00" and not times["no clock"].startswith("00:")
