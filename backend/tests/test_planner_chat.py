"""Planner-chat parse + merge logic (the LLM-free, deterministic core).

The /planner/chat endpoint makes a live LLM call, but the robustness-critical
pieces are pure functions:
  - _loads_lenient: tolerant parse of an LLM JSON reply (fences / prose / junk)
  - _apply_planner_diff: presence-based merge of a parsed diff into onboarding

These guard the behaviors that make natural-language plan edits safe:
minimal/presence-based merges, the obligations FULL-LIST-REPLACE contract,
null-clears, and not wiping a field when the model emits an unparseable time.
"""

from __future__ import annotations

from api.users import (
    _loads_lenient,
    _apply_planner_diff,
    _norm_days,
    _norm_window,
    _norm_obligations,
    _migrate_work_to_obligation,
    _public_defaults,
)


# --------------------------------------------------------------------------- #
#  _loads_lenient — tolerate fences / prose / junk around the JSON object      #
# --------------------------------------------------------------------------- #

def test_loads_clean_object():
    assert _loads_lenient('{"defaults":{"wake_time":"07:00"},"summary":"hi"}') == {
        "defaults": {"wake_time": "07:00"}, "summary": "hi"}


def test_loads_json_fence():
    assert _loads_lenient('```json\n{"a":1}\n```') == {"a": 1}


def test_loads_bare_fence():
    assert _loads_lenient('```\n{"a":1}\n```') == {"a": 1}


def test_loads_leading_prose():
    assert _loads_lenient('Sure! Here you go:\n{"a":1}') == {"a": 1}


def test_loads_trailing_prose():
    assert _loads_lenient('{"a":1}\nHope that helps!') == {"a": 1}


def test_loads_fence_plus_trailing_prose():
    assert _loads_lenient('```json\n{"defaults":{"sleep_time":"23:00"}}\n```\nDone!') == {
        "defaults": {"sleep_time": "23:00"}}


def test_loads_brace_inside_string():
    assert _loads_lenient('{"summary":"set {x} to 6","defaults":{"wake_time":"06:00"}}') == {
        "summary": "set {x} to 6", "defaults": {"wake_time": "06:00"}}


def test_loads_junk_and_empty_return_empty():
    assert _loads_lenient("no json here at all") == {}
    assert _loads_lenient("") == {}
    assert _loads_lenient(None) == {}
    assert _loads_lenient("[1,2,3]") == {}  # array is not a dict


# --------------------------------------------------------------------------- #
#  _apply_planner_diff — presence-based, minimal, safe merge                    #
# --------------------------------------------------------------------------- #

def test_weekend_override_leaves_defaults_untouched():
    prev = {"wake_time": "06:30", "sleep_time": "22:45",
            "get_ready_time": "06:45", "preferred_workout_time": "18:00"}
    changed = _apply_planner_diff(prev, {}, {
        "weekly_timings": {"saturday": {"wake_time": "10:00"},
                           "sunday": {"wake_time": "10:00"}}})
    assert changed is True
    assert prev["weekly_timings"] == {"saturday": {"wake_time": "10:00"},
                                      "sunday": {"wake_time": "10:00"}}
    assert prev["wake_time"] == "06:30"  # default untouched


def test_multi_part_default_change():
    prev = {"preferred_workout_time": "12:00", "get_ready_time": "07:00"}
    changed = _apply_planner_diff(prev, {}, {
        "defaults": {"preferred_workout_time": "19:00", "get_ready_time": "06:30"}})
    assert changed is True
    assert prev["preferred_workout_time"] == "19:00"
    assert prev["get_ready_time"] == "06:30"


def test_obligations_are_replaced_wholesale_per_day():
    # "add a dentist Tuesday" — model must re-list the existing Commute, since
    # the merge REPLACES the list rather than appending.
    prev = {"obligations": [{"label": "Commute", "start": "08:15", "end": "09:00"}]}
    changed = _apply_planner_diff(prev, {}, {
        "weekly_timings": {"tuesday": {"obligations": [
            {"label": "Commute", "start": "08:15", "end": "09:00"},
            {"label": "Dentist", "start": "14:00", "end": "15:00"}]}}})
    assert changed is True
    # Normalized obligations gain a default "all" recurrence.
    assert prev["weekly_timings"]["tuesday"]["obligations"] == [
        {"label": "Commute", "start": "08:15", "end": "09:00", "days": "all"},
        {"label": "Dentist", "start": "14:00", "end": "15:00", "days": "all"}]
    # The default-level obligations list is left alone.
    assert prev["obligations"] == [{"label": "Commute", "start": "08:15", "end": "09:00"}]


def test_clear_a_days_overrides_with_empty_dict():
    prev = {}
    cur_weekly = {"wednesday": {"obligations": [{"label": "Class", "start": "10:00", "end": "12:00"}]},
                  "monday": {"wake_time": "07:00"}}
    changed = _apply_planner_diff(prev, cur_weekly, {"weekly_timings": {"wednesday": {}}})
    assert changed is True
    assert prev["weekly_timings"] == {"monday": {"wake_time": "07:00"}}


def test_clear_default_field_with_null():
    prev = {"preferred_workout_time": "18:00"}
    changed = _apply_planner_diff(prev, {}, {"defaults": {"preferred_workout_time": None}})
    assert changed is True
    assert prev["preferred_workout_time"] is None


def test_remove_all_obligations_empty_list_becomes_none():
    prev = {"obligations": [{"label": "Commute", "start": "08:15", "end": "09:00"}]}
    changed = _apply_planner_diff(prev, {}, {"defaults": {"obligations": []}})
    assert changed is True
    assert prev["obligations"] is None


def test_unactionable_request_changes_nothing():
    prev = {"wake_time": "06:30"}
    changed = _apply_planner_diff(prev, {}, {
        "defaults": {}, "weekly_timings": {},
        "summary": "I couldn't tell which day you meant."})
    assert changed is False
    assert prev["wake_time"] == "06:30"


def test_explicit_work_hours_set_fixed():
    prev = {}
    changed = _apply_planner_diff(prev, {}, {
        "defaults": {"work_schedule": "fixed", "work_start": "09:00", "work_end": "17:00"}})
    assert changed is True
    assert prev["work_schedule"] == "fixed"
    assert prev["work_start"] == "09:00"
    assert prev["work_end"] == "17:00"


def test_invalid_time_is_ignored_not_wiped():
    # The model fat-fingers a non-HH:MM time — keep the user's existing value
    # rather than silently clearing it.
    prev = {"wake_time": "06:30"}
    changed = _apply_planner_diff(prev, {}, {"defaults": {"wake_time": "7am"}})
    assert prev["wake_time"] == "06:30"
    assert changed is False


def test_mixed_valid_and_invalid_default_times():
    prev = {"wake_time": "06:30", "sleep_time": "22:45"}
    changed = _apply_planner_diff(prev, {}, {
        "defaults": {"wake_time": "05:45", "sleep_time": "nope"}})
    assert prev["wake_time"] == "05:45"   # valid applied
    assert prev["sleep_time"] == "22:45"  # invalid ignored
    assert changed is True


def test_flexible_work_schedule():
    prev = {"work_schedule": "fixed", "work_start": "09:00", "work_end": "17:00"}
    changed = _apply_planner_diff(prev, {}, {"defaults": {"work_schedule": "flexible"}})
    assert prev["work_schedule"] == "flexible"
    assert changed is True


# --------------------------------------------------------------------------- #
#  _norm_days — canonical recurrence (all / weekdays / weekends / [days])      #
# --------------------------------------------------------------------------- #

def test_norm_days_all_variants():
    for v in (None, "", "all", "everyday", "every day", "daily", "any", 123, {}):
        assert _norm_days(v) == "all"


def test_norm_days_weekday_weekend_tokens():
    assert _norm_days("weekdays") == "weekdays"
    assert _norm_days("Weekday") == "weekdays"
    assert _norm_days("wknd") == "weekends"
    assert _norm_days("weekend") == "weekends"


def test_norm_days_single_and_abbrev():
    assert _norm_days("wednesday") == ["wednesday"]
    assert _norm_days("Wed") == ["wednesday"]
    assert _norm_days("blarg") == "all"  # unknown token never drops the item


def test_norm_days_list_is_sorted_chronologically():
    assert _norm_days(["fri", "mon", "wed"]) == ["monday", "wednesday", "friday"]


def test_norm_days_full_sets_collapse_to_tokens():
    assert _norm_days(["mon", "tue", "wed", "thu", "fri"]) == "weekdays"
    assert _norm_days(["saturday", "sunday"]) == "weekends"
    assert _norm_days(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]) == "all"


def test_norm_days_mixed_tokens_in_list():
    # "weekdays" token + an extra weekend day expands then collapses sanely.
    assert _norm_days(["weekdays", "saturday"]) == [
        "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]


# --------------------------------------------------------------------------- #
#  _norm_window — workout time RANGE                                            #
# --------------------------------------------------------------------------- #

def test_norm_window_valid():
    assert _norm_window(["17:00", "20:00"]) == ["17:00", "20:00"]
    assert _norm_window(["7:30", "8:45"]) == ["07:30", "08:45"]  # zero-pads


def test_norm_window_rejects_degenerate():
    assert _norm_window(["20:00", "17:00"]) is None   # reversed
    assert _norm_window(["09:00", "09:00"]) is None   # zero-length
    assert _norm_window(["09:00"]) is None            # wrong arity
    assert _norm_window("09:00-10:00") is None        # not a list
    assert _norm_window(["x", "y"]) is None           # not clocks


# --------------------------------------------------------------------------- #
#  _norm_obligations — preserves `days` recurrence                              #
# --------------------------------------------------------------------------- #

def test_norm_obligations_defaults_days_to_all():
    out = _norm_obligations([{"label": "Commute", "start": "08:15", "end": "09:00"}])
    assert out == [{"label": "Commute", "start": "08:15", "end": "09:00", "days": "all"}]


def test_norm_obligations_preserves_and_canonicalizes_days():
    out = _norm_obligations([
        {"label": "Gym", "start": "18:00", "end": "19:00", "days": ["fri", "mon", "wed"]},
        {"label": "Work", "start": "09:00", "end": "17:00", "days": "weekdays"},
        {"label": "bad", "start": "10:00", "end": "10:00", "days": "all"},  # zero-length dropped
    ])
    assert out == [
        {"label": "Gym", "start": "18:00", "end": "19:00", "days": ["monday", "wednesday", "friday"]},
        {"label": "Work", "start": "09:00", "end": "17:00", "days": "weekdays"},
    ]


# --------------------------------------------------------------------------- #
#  preferred_workout_window — set / sync scalar / clear / ignore-invalid       #
# --------------------------------------------------------------------------- #

def test_workout_window_set_syncs_midpoint_scalar():
    prev = {"preferred_workout_time": "12:00"}
    changed = _apply_planner_diff(prev, {}, {
        "defaults": {"preferred_workout_window": ["17:00", "20:00"]}})
    assert changed is True
    assert prev["preferred_workout_window"] == ["17:00", "20:00"]
    assert prev["preferred_workout_time"] == "18:30"  # midpoint, for back-compat


def test_workout_window_null_clears_both():
    prev = {"preferred_workout_window": ["17:00", "20:00"], "preferred_workout_time": "18:30"}
    changed = _apply_planner_diff(prev, {}, {"defaults": {"preferred_workout_window": None}})
    assert changed is True
    assert prev["preferred_workout_window"] is None
    assert prev["preferred_workout_time"] is None


def test_workout_window_invalid_is_ignored_not_wiped():
    prev = {"preferred_workout_window": ["17:00", "20:00"], "preferred_workout_time": "18:30"}
    changed = _apply_planner_diff(prev, {}, {
        "defaults": {"preferred_workout_window": ["20:00", "17:00"]}})  # reversed = invalid
    assert changed is False
    assert prev["preferred_workout_window"] == ["17:00", "20:00"]  # untouched
    assert prev["preferred_workout_time"] == "18:30"


# --------------------------------------------------------------------------- #
#  _migrate_work_to_obligation — legacy fixed work block → "Work" obligation    #
# --------------------------------------------------------------------------- #

def test_migrate_fixed_work_becomes_weekday_obligation():
    prev = {"work_schedule": "fixed", "work_start": "09:00", "work_end": "17:00",
            "wake_time": "06:30"}
    touched = _migrate_work_to_obligation(prev)
    assert touched is True
    assert prev["obligations"] == [
        {"label": "Work", "start": "09:00", "end": "17:00", "days": "weekdays"}]
    assert prev["work_schedule"] is None
    assert prev["work_start"] is None
    assert prev["work_end"] is None
    assert prev["wake_time"] == "06:30"  # unrelated field untouched


def test_migrate_is_idempotent_no_duplicate_work():
    prev = {"work_schedule": "fixed", "work_start": "09:00", "work_end": "17:00"}
    _migrate_work_to_obligation(prev)
    again = _migrate_work_to_obligation(prev)
    assert again is False
    assert len([o for o in prev["obligations"] if o["label"].lower() == "work"]) == 1


def test_migrate_skips_when_work_obligation_already_present():
    prev = {"work_schedule": "fixed", "work_start": "09:00", "work_end": "17:00",
            "obligations": [{"label": "School", "start": "08:00", "end": "15:00", "days": "weekdays"}]}
    _migrate_work_to_obligation(prev)
    # Did not append a second work/school block; just dropped legacy scaffolding.
    assert prev["obligations"] == [
        {"label": "School", "start": "08:00", "end": "15:00", "days": "weekdays"}]
    assert prev["work_schedule"] is None


def test_migrate_flexible_just_clears_scaffolding():
    prev = {"work_schedule": "flexible", "wake_time": "07:00"}
    touched = _migrate_work_to_obligation(prev)
    assert touched is True
    assert prev["work_schedule"] is None
    assert prev.get("obligations") in (None, [])  # nothing synthesized


def test_migrate_noop_when_no_work_fields():
    prev = {"wake_time": "07:00"}
    assert _migrate_work_to_obligation(prev) is False


# --------------------------------------------------------------------------- #
#  _public_defaults — workout-window-first view for client + LLM                #
# --------------------------------------------------------------------------- #

def test_public_defaults_presents_legacy_scalar_as_window():
    out = _public_defaults({
        "wake_time": "06:30", "sleep_time": "22:45", "get_ready_time": "06:45",
        "preferred_workout_time": "18:00"})
    assert out["preferred_workout_window"] == ["18:00", "19:30"]  # 90-min window
    assert out["wake_time"] == "06:30"
    assert "preferred_workout_time" not in out  # scalar suppressed from the view


def test_public_defaults_prefers_explicit_window_and_includes_obligations():
    out = _public_defaults({
        "preferred_workout_window": ["17:00", "19:00"],
        "preferred_workout_time": "18:00",
        "obligations": [{"label": "Work", "start": "09:00", "end": "17:00", "days": "weekdays"}]})
    assert out["preferred_workout_window"] == ["17:00", "19:00"]
    assert out["obligations"] == [
        {"label": "Work", "start": "09:00", "end": "17:00", "days": "weekdays"}]


def test_public_defaults_omits_absent_fields():
    assert _public_defaults({}) == {}
