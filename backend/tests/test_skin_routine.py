"""Skin & Hair routine builder (services/skin_routine.py): a real AM/PM routine
from a 3-question quiz, the same every day from day 1 (only rare fixed mask /
microneedling nights differ), pregnancy/prescription gates, and the plumbing
that keeps the routine intact through fitting, expansion, refits and redos."""
from datetime import date, timedelta
from itertools import product

import pytest

import services.ai_programs as ap
from services import skin_routine as sr

MON = date(2026, 10, 12)          # a Monday, week 1
PROF = {"wake_time": "07:00", "bed_time": "23:00", "weekend_shift": False, "weekly_timings": {},
        "minutes_per_day_total": 25, "meals": {}, "obligations": []}


def _ans(goal="Smooth fine lines", feel="Comfortable", flags="None of these", **kw):
    return {"skin_goal": goal, "skin_feel": feel, "skin_flags": flags, **kw}


def _night(t, day):
    pm = next(h for h in t["habits"] if h["habit_id"] == "pm_routine")
    return sr.routine_variant(pm, day, t["started_on"])


def _am(t, day):
    am = next(h for h in t["habits"] if h["habit_id"] == "am_routine")
    return sr.routine_variant(am, day, t["started_on"]) or am          # the morning has no variants


def test_quiz_is_three_tap_questions_then_done():
    asked = []
    for i in range(3):
        q = sr.next_question({}, asked)
        assert not q["done"] and len(q["options"]) >= 4
        asked.append(q)
    assert asked[2]["multi"] is True and "None of these" in asked[2]["options"]
    assert sr.next_question({}, asked)["done"] is True
    # the app serves the quiz instead of Claude
    import asyncio
    step = asyncio.run(ap.next_intake_step("skinhairmax", PROF, {}, []))
    assert step["fact_key"] == "skin_goal"


def test_same_routine_every_day_from_day_one_except_rare_treatment_nights():
    t = sr.build_template(_ans(), started_on=MON)
    assert "retinol" in _night(t, MON)["how"].lower()                          # day 1
    assert "vitamin c" in _am(t, MON)["how"].lower()
    ams = {_am(t, MON + timedelta(days=i))["how"] for i in range(70)}
    assert len(ams) == 1
    titles = [_night(t, MON + timedelta(days=i))["title"] for i in range(70)]
    assert set(titles) == {"PM skin routine", "PM skin routine · mask night", "PM skin routine · microneedling night"}
    assert titles.count("PM skin routine · mask night") == 10 and titles.count("PM skin routine · microneedling night") == 10
    assert titles[:7] == titles[63:70]                                         # week 1 == week 10
    assert "every day" in t["summary"]


def test_treatment_nights_never_carry_an_active_and_needling_is_only_for_safe_cases():
    for goal, feel, flag in product(sr.GOALS, sr.FEELS, list(sr.FLAGS) + ["I already use retinol or acids"]):
        t = sr.build_template(_ans(goal, feel, flag), started_on=MON)
        for i in range(7):
            v = _night(t, MON + timedelta(days=i))
            if "nightly" not in v["title"] and v["title"] != "PM skin routine":
                assert not any(w in v["how"].lower() for w in ("retinol", "adapalene", "salicylic", "prescribed")), (goal, v)
            if "microneedling" in v["title"]:
                assert sr.GOALS[goal] in ("aging", "spots", "texture")
                assert feel != "Stings or gets red easily" and flag not in (
                    "Eczema or rosacea", "Pregnant, trying, or breastfeeding", "I use a prescription skin product")


def test_acne_gets_adapalene_nightly_with_a_clay_mask_and_no_needling():
    t = sr.build_template(_ans("Clear breakouts", "Shiny all over"), started_on=MON)
    week = [_night(t, MON + timedelta(days=i)) for i in range(7)]
    assert sum("adapalene" in v["how"] for v in week) == 6
    assert "clay" in week[6]["how"].lower() and not any("microneedling" in v["title"] for v in week)


def test_pregnancy_means_no_retinoids_anywhere():
    for goal in sr.GOALS:
        t = sr.build_template(_ans(goal, flags="Pregnant, trying, or breastfeeding"), started_on=MON)
        text = " ".join(v["how"].lower() for h in t["habits"] for v in (h.get("variants") or {}).values())
        assert "retinol" not in text and "adapalene" not in text, goal
        assert "pregnancy-safe" in t["summary"]


def test_prescription_users_get_their_treatment_and_nothing_on_top():
    t = sr.build_template(_ans("Clear breakouts", flags="I use a prescription skin product"), started_on=MON)
    week = [_night(t, MON + timedelta(days=i)) for i in range(7)]
    nights = {v["how"] for v in week}
    assert all("prescribed" in v["how"] for v in week if v["title"] == "PM skin routine")
    assert not any("microneedling" in v["title"] for v in week)
    assert all(w not in " ".join(nights).lower() for w in ("retinol", "adapalene", "exfoliant", "vitamin c"))


def test_sensitive_skin_gets_mineral_spf_a_buffered_active_and_a_soothing_mask():
    t = sr.build_template(_ans("Fade dark spots", "Stings or gets red easily"), started_on=MON)
    assert "mineral" in _am(t, MON)["how"].lower()
    assert "moisturizer first, then a pea-sized amount of retinol" in _night(t, MON)["how"]
    assert "soothing" in _night(t, MON + timedelta(days=6))["how"]


def test_one_task_each_morning_and_night_with_steps_inside_and_scalp_only_when_asked():
    t = sr.build_template(_ans(), started_on=MON)
    assert [h["habit_id"] for h in t["habits"]] == ["am_routine", "pm_routine"]
    t = sr.build_template(_ans(flags="My hair is thinning, Dandruff or an itchy scalp"), started_on=MON)
    assert {"keto_wash", "scalp_massage"} <= {h["habit_id"] for h in t["habits"]}
    assert t["summary"].startswith("your routine: ")


def test_plan_survives_fit_expand_and_refit_and_shows_the_right_night():
    raw = sr.build_template(_ans(), started_on=MON)
    t = ap.validate_template("skinhairmax", raw, PROF)
    assert t["started_on"] == "2026-10-12" and _night(t, MON)["title"] == "PM skin routine"
    days = ap.expand_template("skinhairmax", t, start_date=MON, n_days=7)
    titles = [x["title"] for d in days for x in d["tasks"] if x["catalog_id"] == "skinhairmax.pm_routine"]
    assert titles[0] == "PM skin routine" and titles[2] == "PM skin routine · microneedling night"
    assert titles[6] == "PM skin routine · mask night"
    t2 = ap.refit_template("skinhairmax", t, PROF)
    key = lambda x: [(h["habit_id"], h["time"], h.get("schedule")) for h in x["habits"]]  # noqa: E731
    assert key(t) == key(t2) and t2["started_on"] == t["started_on"]


def test_a_five_minute_person_still_gets_both_routines():
    raw = sr.build_template(_ans(), started_on=MON)
    t = ap.validate_template("skinhairmax", raw, {**PROF, "minutes_per_day_total": 5})
    assert {h["habit_id"] for h in t["habits"]} == {"am_routine", "pm_routine"}


def test_chat_changes_irritation_gentler_simpler_drops_extras_new_goal_rebuilds():
    cur = ap.validate_template("skinhairmax", sr.build_template(_ans(), started_on=MON), PROF)
    cur["answers"] = _ans()
    calm = ap.skin_redo(cur, "my skin is stinging", PROF, {})
    assert "moisturizer first" in _night(calm, MON)["how"] and "vitamin c" not in _am(calm, MON)["how"].lower()
    assert all("microneedling" not in _night(calm, MON + timedelta(days=i))["title"] for i in range(7))
    simple = ap.skin_redo(cur, "make it simpler", PROF, {})
    assert "vitamin c" not in _am(simple, MON)["how"].lower()
    assert {_night(simple, MON + timedelta(days=i))["title"] for i in range(7)} == {"PM skin routine"}
    new = ap.skin_redo(cur, "actually I want to clear breakouts", PROF, {})
    assert "adapalene" in _night(new, MON)["how"].lower()
    assert ap.skin_redo(cur, "move my night routine to 9pm", PROF, {}) is None   # Claude handles times


def test_claude_redo_keeps_the_nightly_steps():
    cur = ap.validate_template("skinhairmax", sr.build_template(_ans(), started_on=MON), PROF)
    claude = {"habits": [{"habit_id": "pm_routine", "title": "PM skin routine", "time": "21:00", "days": sr.ALL}]}
    ap._keep_routines(claude, cur)
    assert claude["habits"][0]["variants"] and claude["started_on"] == "2026-10-12"


def test_legacy_skin_plans_are_rebuilt_not_emptied():
    old = {"habits": [{"habit_id": "am_spf", "title": "SPF", "time": "07:30", "days": sr.ALL, "minutes": 2}],
           "answers": {"skin_type": "Oily"}}
    t = ap.refit_template("skinhairmax", old, PROF)
    assert {"am_routine", "pm_routine"} <= {h["habit_id"] for h in t["habits"]}
