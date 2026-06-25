"""Onboarding multi-select + custom-answer support (RALPH_ONBOARDING_QA).

Covers:
  SC1/SC2 — schema flags (multi / allow_custom / exclusive) drive the question
            payload and coercion (list answers, accepted custom text).
  SC3     — list/custom values flow through the schedule DSL and deterministic
            generation without breaking, and single-value maxes are unchanged.

Everything here is deterministic — no LLM, no DB.
"""

from __future__ import annotations

import asyncio

import pytest

from services.task_catalog_service import warm_catalog, get_doc, is_loaded
from services.onboarding_questioner import (
    field_to_question_payload,
    coerce_answer,
    CUSTOM_CHOICE_LABEL,
)
from services.schedule_dsl import evaluate
from services.schedule_skeleton import expand_skeleton
from services.skinmax import concern_key_for_state, compose_skincare_routine


def _warm():
    if not is_loaded():
        asyncio.run(warm_catalog())


@pytest.fixture(scope="module", autouse=True)
def _catalog():
    _warm()


def _field(maxx: str, fid: str) -> dict:
    doc = get_doc(maxx)
    return next(f for f in doc.required_fields if f.get("id") == fid)


# --------------------------------------------------------------------------- #
#  SC1 / SC2 — payload                                                        #
# --------------------------------------------------------------------------- #

def test_multi_field_payload_sets_multi_choice():
    p = field_to_question_payload(_field("fitmax", "dietary_restrictions"))
    assert p["multi_choice"] is True
    assert p["allow_custom"] is True
    # allow_custom appends the custom-input chip the client recognises
    assert CUSTOM_CHOICE_LABEL in p["choices"]


def test_single_field_payload_has_no_multi_flag():
    p = field_to_question_payload(_field("fitmax", "goal"))
    assert "multi_choice" not in p
    assert CUSTOM_CHOICE_LABEL not in p["choices"]


def test_skin_concern_multi_no_custom_chip():
    p = field_to_question_payload(_field("skinmax", "skin_concern"))
    assert p["multi_choice"] is True
    # skin_concern is multi but NOT allow_custom, so no "Something else" chip
    assert CUSTOM_CHOICE_LABEL not in p["choices"]


# --------------------------------------------------------------------------- #
#  SC2 — coercion                                                             #
# --------------------------------------------------------------------------- #

def test_multi_returns_list_of_matched_values():
    diet = _field("fitmax", "dietary_restrictions")
    assert coerce_answer(diet, "Vegetarian, Gluten-free") == ["vegetarian", "gluten_free"]


def test_allow_custom_accepts_raw_text():
    diet = _field("fitmax", "dietary_restrictions")
    # unmatched token stored verbatim as a single-item list
    assert coerce_answer(diet, "carnivore diet") == ["carnivore diet"]


def test_multi_mixes_known_and_custom():
    diet = _field("fitmax", "dietary_restrictions")
    assert coerce_answer(diet, "vegan, paleo") == ["vegan", "paleo"]


def test_exclusive_value_collapses_the_list():
    diet = _field("fitmax", "dietary_restrictions")
    # "I eat everything" is exclusive → clears the rest regardless of order
    assert coerce_answer(diet, "I eat everything, vegan") == ["none"]
    sc = _field("skinmax", "skin_concern")
    assert coerce_answer(sc, "acne, maintenance") == ["maintenance"]


def test_injury_multi_and_custom():
    inj = _field("fitmax", "injury_history")
    assert coerce_answer(inj, "Knees, careful with squats and lunges, Shoulder, careful pressing overhead") == ["knee", "shoulder"]
    assert coerce_answer(inj, "tennis elbow") == ["tennis elbow"]


def test_empty_multi_reasks():
    diet = _field("fitmax", "dietary_restrictions")
    assert coerce_answer(diet, "   ") is None
    # tapping the bare custom chip with no real text → re-ask
    assert coerce_answer(diet, CUSTOM_CHOICE_LABEL) is None


def test_single_select_unchanged():
    goal = _field("fitmax", "goal")
    assert coerce_answer(goal, "build muscle") == "muscle_gain"
    barrier = _field("skinmax", "barrier_state")
    assert coerce_answer(barrier, "stable") == "stable"
    # a single-select with no match still re-asks (no allow_custom)
    assert coerce_answer(barrier, "asdf qwerty") is None


# --------------------------------------------------------------------------- #
#  SC3 — DSL list-awareness                                                   #
# --------------------------------------------------------------------------- #

def test_dsl_equality_is_membership_for_lists():
    st = {"dietary_restrictions": ["vegetarian", "gluten_free"]}
    assert evaluate("dietary_restrictions == vegetarian", st) is True
    assert evaluate("dietary_restrictions == gluten_free", st) is True
    assert evaluate("dietary_restrictions == vegan", st) is False
    assert evaluate("dietary_restrictions != none", st) is True


def test_dsl_in_is_intersection_for_lists():
    st = {"skin_concern": ["acne", "pigmentation"]}
    assert evaluate("skin_concern in [acne, pigmentation]", st) is True
    assert evaluate("skin_concern in [rosacea, maintenance]", st) is False
    assert evaluate("skin_concern == rosacea", st) is False


def test_dsl_empty_list_is_none_sentinel():
    st = {"injury_history": []}
    assert evaluate("injury_history == none", st) is True
    assert evaluate("injury_history != none", st) is False


def test_dsl_scalar_behavior_unchanged():
    st = {"dietary_restrictions": "vegan"}
    assert evaluate("dietary_restrictions == vegan", st) is True
    assert evaluate("dietary_restrictions == vegetarian", st) is False
    assert evaluate("dietary_restrictions in [vegan, keto]", st) is True


# --------------------------------------------------------------------------- #
#  SC3 — generation handles list / custom; no single-value regression        #
# --------------------------------------------------------------------------- #

_FIT_BASE = {
    "goal": "muscle_gain", "experience_level": "intermediate", "equipment": "full_gym",
    "days_per_week": 4, "session_minutes": 60, "daily_activity_level": "sedentary",
    "estimated_body_fat": "15_20", "nutrition_tracking_pref": "full_track", "sleep_hours": 7,
    "supplement_openness": "basic",
}


def _gen(maxx, state):
    return expand_skeleton(maxx_id=maxx, user_state=state, wake="07:00", sleep="23:00", cadence_days=14)


def _task_ids(days):
    return sorted(t["catalog_id"] for d in days for t in d["tasks"])


def test_multi_dietary_and_injury_generate_same_as_single_membership():
    multi = {**_FIT_BASE, "dietary_restrictions": ["vegetarian", "gluten_free"],
             "injury_history": ["knee"]}
    single = {**_FIT_BASE, "dietary_restrictions": "vegetarian", "injury_history": "knee"}
    # The fitmax skeleton gates on injury via membership (`!= none`), so a
    # one-item list and the scalar must produce the identical task set.
    assert _task_ids(_gen("fitmax", multi)) == _task_ids(_gen("fitmax", single))


def test_custom_injury_does_not_crash_generation():
    st = {**_FIT_BASE, "dietary_restrictions": ["keto"], "injury_history": ["tennis elbow"]}
    days = _gen("fitmax", st)
    assert sum(len(d["tasks"]) for d in days) > 0


def test_skinmax_multi_concern_generates_and_primary_is_first():
    st = {"skin_concern": ["acne", "pigmentation"], "barrier_state": "stable",
          "skin_type": "oily", "routine_level": "intermediate",
          "outdoor_exposure": "moderate", "tret_history": "never",
          "climate": "temperate", "diet_open": "yes_some"}
    # primary track = first picked concern
    assert concern_key_for_state(st) == "acne"
    days = _gen("skinmax", st)
    assert sum(len(d["tasks"]) for d in days) > 0
    # both concerns honoured: zinc block fires for acne/pigmentation
    cat_ids = _task_ids(days)
    assert "skin.zinc_supp" in cat_ids
    # personalized routine composes without error
    assert compose_skincare_routine(st)["am"]["steps"]


def test_skinmax_single_concern_regression():
    st = {"skin_concern": "rosacea", "barrier_state": "stable", "skin_type": "normal",
          "routine_level": "basic", "outdoor_exposure": "minimal", "tret_history": "never",
          "climate": "temperate", "diet_open": "no"}
    days = _gen("skinmax", st)
    assert sum(len(d["tasks"]) for d in days) > 0
    assert concern_key_for_state(st) == "redness"
