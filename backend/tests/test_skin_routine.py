"""Skin & Hair routine builder (services/skin_routine.py): a real AM/PM routine
from a 3-question quiz, one main active introduced slowly and rotated so strong
actives never share a night, pregnancy/prescription gates, and the plumbing that
keeps the routine intact through fitting, expansion, refits and redos."""
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
    return sr.routine_variant(am, day, t["started_on"])


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


def test_weeks_one_and_two_are_basics_then_the_active_builds_up():
    t = sr.build_template(_ans(), started_on=MON)
    assert "retinol" not in _night(t, MON)["how"].lower()                        # week 1
    assert "vitamin c" not in _am(t, MON)["how"].lower()
    wk3 = [_night(t, MON + timedelta(days=14 + i))["title"] for i in range(7)]
    assert wk3.count("PM skin routine · retinoid night") == 2                  # 2 nights in week 3
    wk7 = [_night(t, MON + timedelta(days=42 + i))["title"] for i in range(7)]
    assert wk7.count("PM skin routine · retinoid night") == 4
    assert "vitamin c" in _am(t, MON + timedelta(days=14))["how"].lower()
    assert "PM skin routine · recovery night" in wk3


def test_never_two_strong_actives_the_same_night_for_anyone():
    for goal, feel, flag in product(sr.GOALS, sr.FEELS, list(sr.FLAGS) + ["I already use retinol or acids"]):
        t = sr.build_template(_ans(goal, feel, flag), started_on=MON)
        for i in range(70):
            how = _night(t, MON + timedelta(days=i))["how"].lower()
            strong = sum(w in how for w in ("retinol", "adapalene", "exfoliant", "azelaic"))
            assert strong <= 1, (goal, feel, flag, i, how)


def test_pregnancy_means_no_retinoids_anywhere():
    for goal in sr.GOALS:
        t = sr.build_template(_ans(goal, flags="Pregnant, trying, or breastfeeding"), started_on=MON)
        text = " ".join(v["how"].lower() for h in t["habits"] for v in (h.get("variants") or {}).values())
        assert "retinol" not in text and "adapalene" not in text, goal
        assert "pregnancy-safe" in t["summary"]


def test_prescription_users_get_their_treatment_and_nothing_on_top():
    t = sr.build_template(_ans("Clear breakouts", flags="I use a prescription skin product"), started_on=MON)
    nights = {_night(t, MON + timedelta(days=i))["how"] for i in range(21)}
    assert all("prescribed" in n for n in nights)
    assert all(w not in " ".join(nights).lower() for w in ("retinol", "adapalene", "exfoliant", "vitamin c"))


def test_sensitive_skin_gets_mineral_spf_and_a_slower_ramp():
    t = sr.build_template(_ans("Fade dark spots", "Stings or gets red easily"), started_on=MON)
    assert "mineral" in _am(t, MON)["how"].lower()
    wk3 = [_night(t, MON + timedelta(days=14 + i))["title"] for i in range(7)]
    assert wk3.count("PM skin routine · retinoid night") == 1


def test_one_task_each_morning_and_night_with_steps_inside_and_scalp_only_when_asked():
    t = sr.build_template(_ans(), started_on=MON)
    assert [h["habit_id"] for h in t["habits"]] == ["am_routine", "pm_routine"]
    t = sr.build_template(_ans(flags="My hair is thinning, Dandruff or an itchy scalp"), started_on=MON)
    assert {"keto_wash", "scalp_massage"} <= {h["habit_id"] for h in t["habits"]}
    assert t["summary"].startswith("your routine: ")


def test_plan_survives_fit_expand_and_refit_and_shows_the_right_night():
    raw = sr.build_template(_ans(), started_on=MON)
    t = ap.validate_template("skinhairmax", raw, PROF)
    assert t["started_on"] == "2026-10-12" and all(h.get("variants") for h in t["habits"])
    days = ap.expand_template("skinhairmax", t, start_date=MON + timedelta(days=14), n_days=7)
    titles = [x["title"] for d in days for x in d["tasks"] if x["catalog_id"] == "skinhairmax.pm_routine"]
    assert titles[0] == "PM skin routine · retinoid night" and titles[1] == "PM skin routine · recovery night"
    t2 = ap.refit_template("skinhairmax", t, PROF)
    key = lambda x: [(h["habit_id"], h["time"], h.get("schedule")) for h in x["habits"]]  # noqa: E731
    assert key(t) == key(t2) and t2["started_on"] == t["started_on"]


def test_a_five_minute_person_still_gets_both_routines():
    raw = sr.build_template(_ans(), started_on=MON)
    t = ap.validate_template("skinhairmax", raw, {**PROF, "minutes_per_day_total": 5})
    assert {h["habit_id"] for h in t["habits"]} == {"am_routine", "pm_routine"}


def test_chat_changes_irritation_steps_back_simpler_drops_serums_new_goal_rebuilds():
    cur = ap.validate_template("skinhairmax", sr.build_template(_ans(), started_on=MON), PROF)
    cur["answers"] = _ans()
    back = ap.skin_redo(cur, "my skin is stinging", PROF, {})
    assert back["started_on"] == (MON + timedelta(days=14)).isoformat()
    simple = ap.skin_redo(cur, "make it simpler", PROF, {})
    assert "vitamin c" not in _am(simple, MON + timedelta(days=30))["how"].lower()
    new = ap.skin_redo(cur, "actually I want to clear breakouts", PROF, {})
    assert "adapalene" in _night(new, MON + timedelta(days=14))["how"].lower()
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
