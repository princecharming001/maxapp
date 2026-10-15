"""Fixed setup quizzes for the six habit programs (services/program_quiz.py)."""
import pytest

import services.ai_programs as ap
from services import program_quiz as pq


def _asked(mid, profile=None, pick=0):
    asked, answers = [], {}
    while True:
        s = pq.next_question(mid, answers, asked, profile or {})
        if s["done"]:
            return [a["fact_key"] for a in asked], answers
        assert s["options"], (mid, s["fact_key"])
        asked.append({"fact_key": s["fact_key"]})
        answers[s["fact_key"]] = s["options"][min(pick, len(s["options"]) - 1)]


@pytest.mark.parametrize("mid", pq.QUIZ_PROGRAMS)
def test_every_program_asks_its_whole_doc_quiz_and_what_they_already_do(mid):
    keys, _ = _asked(mid)
    assert len(keys) >= 5, keys
    assert keys[-1] == "already_doing"
    assert all(not ap.asks_known_fact(q["question"]) for q in pq.quiz_for(mid) if q["fact_key"] in keys)


def test_onboarding_facts_are_never_asked_again():
    keys, _ = _asked("sleepmax")
    assert "weekend_wake_shift" not in keys            # onboarding already has weekends


def test_fitmax_asks_the_goal_first_and_health_is_multi():
    keys, _ = _asked("trainmax")
    assert keys[0] == "fitness_goal"
    assert next(q for q in pq.quiz_for("trainmax") if q["fact_key"] == "health_flags")["multi"]


def test_shared_age_is_asked_once_across_programs():
    keys, _ = _asked("longevitymax")
    assert keys[0] == "age_band"
    keys, _ = _asked("longevitymax", {"about": {"age_band": "30–49"}})
    assert "age_band" not in keys
    q = next(q for q in pq.quiz_for("longevitymax") if q["fact_key"] == "age_band")
    assert q["options"] == pq.AGE_OPTIONS


def test_already_doing_skips_simple_habits_but_levels_up_training():
    a = {"already_doing": "Water soon after waking, Daylight in the morning"}
    assert pq.skip_ids("energymax", a) == {"water_on_waking", "morning_light"}
    t = {"already_doing": "Strength training, Getting enough protein"}
    assert pq.already_doing("trainmax", t) == {"strength_full_body", "protein_each_meal"}
    assert pq.skip_ids("trainmax", t) == {"protein_each_meal"}
    assert pq.skip_ids("sleepmax", {"already_doing": "None of these"}) == set()


@pytest.mark.parametrize("mid", pq.QUIZ_PROGRAMS)
def test_already_doing_options_map_to_real_library_habits(mid):
    lib = {h.id for h in ap.get_program_doc(mid).habits}
    for label, ids in pq.ALREADY[mid].items():
        assert set(ids) <= lib, (mid, label, set(ids) - lib)


def test_intake_routes_the_six_programs_to_the_quiz():
    import asyncio
    for mid in pq.QUIZ_PROGRAMS:
        step = asyncio.run(ap.next_intake_step(mid, {}, {}, []))
        assert not step["done"] and step["fact_key"] == pq.quiz_for(mid)[0]["fact_key"]
