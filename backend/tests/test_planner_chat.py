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

from api.users import _loads_lenient, _apply_planner_diff


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
    assert prev["weekly_timings"]["tuesday"]["obligations"] == [
        {"label": "Commute", "start": "08:15", "end": "09:00"},
        {"label": "Dentist", "start": "14:00", "end": "15:00"}]
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
