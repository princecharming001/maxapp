"""Conductor hard gates (spec 4.4): pure functions no LLM value can flip."""

from datetime import date, datetime

from services.conductor import (
    DAILY_NUDGE_BUDGET,
    GateContext,
    budget_for,
    hard_gates,
    ignore_count,
    minutes_since_last,
    receptivity,
    record_ignore,
    record_send,
    select_nudge,
)


def _ctx(**over):
    base = dict(
        now_min=14 * 60,
        wake_min=7 * 60,
        sleep_min=23 * 60,
        nudges_sent_today=0,
        checkins_sent_today=0,
        minutes_since_last_nudge=None,
        task_already_nudged=False,
        task_ignore_count=0,
        is_checkin=False,
    )
    base.update(over)
    return GateContext(**base)


# --- each gate individually ---------------------------------------------------

def test_quiet_hours_blocks():
    ok, reason = hard_gates(_ctx(now_min=3 * 60))
    assert not ok and reason == "quiet_hours"


def test_quiet_hours_overnight_sleeper():
    # wake 07:00, sleep 01:00 -> 23:30 is awake, 03:00 is asleep
    ok, _ = hard_gates(_ctx(now_min=23 * 60 + 30, sleep_min=1 * 60))
    assert ok
    ok, reason = hard_gates(_ctx(now_min=3 * 60, sleep_min=1 * 60))
    assert not ok and reason == "quiet_hours"


def test_budget_blocks():
    ok, reason = hard_gates(_ctx(nudges_sent_today=DAILY_NUDGE_BUDGET))
    assert not ok and reason == "nudge_budget"


def test_checkin_budget_separate():
    ok, _ = hard_gates(_ctx(nudges_sent_today=DAILY_NUDGE_BUDGET, is_checkin=True))
    assert ok  # checkins have their own budget
    ok, reason = hard_gates(_ctx(checkins_sent_today=1, is_checkin=True))
    assert not ok and reason == "checkin_budget"


def test_min_interval_blocks():
    ok, reason = hard_gates(_ctx(minutes_since_last_nudge=20))
    assert not ok and reason == "min_interval"


def test_already_nudged_blocks():
    ok, reason = hard_gates(_ctx(task_already_nudged=True))
    assert not ok and reason == "already_nudged"


def test_ignore_floor_blocks():
    ok, reason = hard_gates(_ctx(task_ignore_count=3))
    assert not ok and reason == "ignore_floor"


# --- receptivity: LLM can only LOWER ------------------------------------------

def test_llm_advisory_cannot_raise():
    rule = receptivity(in_free_window=True, minutes_to_slot=5, recent_app_activity=True)
    boosted = receptivity(
        in_free_window=False, minutes_to_slot=300, recent_app_activity=False,
        llm_advisory=1.0,
    )
    assert boosted < rule  # a max advisory still can't beat the rule score


def test_llm_advisory_lowers():
    high = receptivity(in_free_window=True, minutes_to_slot=5, recent_app_activity=True)
    lowered = receptivity(
        in_free_window=True, minutes_to_slot=5, recent_app_activity=True,
        llm_advisory=0.1,
    )
    assert lowered == 0.1 < high


# --- selection: one nudge, asymmetric ladder -----------------------------------

def test_select_at_most_one_prefers_importance():
    out = select_nudge([
        {"task_uuid": "a", "importance": 3, "receptivity": 0.9},
        {"task_uuid": "b", "importance": 5, "receptivity": 0.6},
    ])
    assert out["task_uuid"] == "b"


def test_select_silence_for_low_stakes_low_receptivity():
    out = select_nudge([{"task_uuid": "a", "importance": 2, "receptivity": 0.45}])
    assert out is None  # silence is normal


def test_high_importance_lower_bar():
    out = select_nudge([{"task_uuid": "a", "importance": 5, "receptivity": 0.4}])
    assert out is not None


# --- jitai_state bookkeeping ----------------------------------------------------

def test_budget_record_and_rollover():
    d = date(2026, 6, 10)
    state = record_send({}, d, is_checkin=False, now=datetime(2026, 6, 10, 14, 0))
    state = record_send(state, d, is_checkin=True, now=datetime(2026, 6, 10, 15, 0))
    assert budget_for(state, d) == (1, 1)
    assert minutes_since_last(state, datetime(2026, 6, 10, 15, 30)) == 30


def test_ignore_deescalation_counter():
    state = record_ignore({}, "t1")
    state = record_ignore(state, "t1")
    assert ignore_count(state, "t1") == 2
    assert ignore_count(state, "other") == 0
