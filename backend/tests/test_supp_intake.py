"""Suppmax fixed quiz (services/supp_intake.py) and answer-driven picks."""
import services.ai_programs as ap
from services import supp_intake as si


def _run(answers_by_key, profile=None):
    asked, answers = [], {}
    while True:
        step = si.next_question(answers, asked, profile)
        if step["done"]:
            return asked, answers
        asked.append({"fact_key": step["fact_key"], "question": step["question"]})
        answers[step["fact_key"]] = answers_by_key.get(step["fact_key"], step["options"][0])


def _picks(answers, active=(), profile=None):
    return ap.supp_answer_picks(answers, set(active), profile or {}, 0)


BASE = {"supp_goals": "Sleep", "supp_safety_flags": "None of these", "supp_medications": "None",
        "age_band": "30–49", "sex": "Male", "supp_diet": "None of these", "supp_current_stack": "Nothing yet"}


def test_quiz_asks_goals_screen_age_sex_gaps_stack_in_order():
    asked, _ = _run(BASE)
    assert [a["fact_key"] for a in asked] == [
        "supp_goals", "supp_safety_flags", "supp_medications", "age_band", "sex", "supp_diet", "supp_current_stack"]


def test_known_age_and_sex_are_not_asked_again():
    asked, _ = _run(BASE, {"about": {"age_band": "30–49", "sex": "Female"}})
    assert "age_band" not in {a["fact_key"] for a in asked} and "sex" not in {a["fact_key"] for a in asked}


def test_under_18_stops_and_gets_nothing():
    asked, answers = _run({**BASE, "age_band": "Under 18"})
    assert [a["fact_key"] for a in asked][-1] == "age_band"
    assert _picks(answers) == []


def test_goal_sleep_gets_its_default_and_gaps_come_first():
    assert _picks(BASE) == ["melatonin"]
    gaps = {**BASE, "supp_diet": "Vegan or vegetarian, Little sun, indoors most days"}
    assert _picks(gaps)[:2] == ["b12", "vitamin_d3"]


def test_screen_rules_things_out_but_goal_words_never_do():
    on_ssri = {**BASE, "supp_medications": "Antidepressants, anxiety or sleep meds"}
    assert "melatonin" not in _picks(on_ssri)
    assert _picks(on_ssri), "an alternative sleep pick should still fill in"
    stress = {**BASE, "supp_goals": "Stress"}
    assert _picks(stress) == ["l_theanine"]


def test_pregnancy_excludes_iron_and_melatonin():
    preg = {**BASE, "supp_safety_flags": "Pregnant, trying, or breastfeeding",
            "supp_diet": "A blood test showed low iron"}
    p = _picks(preg)
    assert "iron" not in p and "melatonin" not in p


def test_low_iron_on_bloodwork_gets_iron():
    assert _picks({**BASE, "supp_diet": "A blood test showed low iron"})[0] == "iron"


def test_over_50_gets_b12():
    assert "b12" in _picks({**BASE, "age_band": "50–59"})


def test_picks_capped_to_open_slots_but_never_zero():
    many = {**BASE, "supp_goals": "Sleep, Energy, Focus, Stress",
            "supp_diet": "Rarely eat fish, Little sun, indoors most days, Hard to get enough protein"}
    assert len(ap.supp_answer_picks(many, set(), {}, 0)) == 3
    assert len(ap.supp_answer_picks(many, set(), {}, 5)) == 1


def test_safety_text_ignores_goals_and_diet():
    t = si.safety_text({**BASE, "supp_goals": "Stress", "supp_diet": "Rarely eat fish"})
    assert "stress" not in t.lower() and "fish" not in t.lower()


def test_give_me_more_never_adds_a_supplement_unscreened():
    prof = {"wake_time": "06:30", "bed_time": "22:30", "meals": {"breakfast": "07:15", "lunch": "12:30", "dinner": "19:00"}}
    t = {"habits": [{"habit_id": "melatonin", "title": "melatonin", "minutes": 1, "time": "21:45",
                     "days": list(ap.WEEKDAYS), "how": "x", "why": "y"}]}
    added = {h["habit_id"] for h in ap._harden("suppmax", t, prof, {})["habits"]} - {"melatonin"}
    assert added <= ap._SUPP_ROUTINES


def test_filled_in_picks_read_as_steps_for_the_person():
    pd = ap.get_program_doc("suppmax")
    tmpl = {"habits": []}
    ap._insert_supps(tmpl, [pd.habit("b12"), pd.habit("iron")], {})
    for h in tmpl["habits"]:
        assert "(" not in h["title"] and "the user" not in h["how"].lower(), h


def test_filled_in_picks_land_at_their_anchor_not_a_word_in_the_notes():
    prof = {"wake_time": "06:30", "bed_time": "22:30", "workout_time": "18:00",
            "meals": {"breakfast": "07:15", "lunch": "12:30", "dinner": "19:00"}}
    pd = ap.get_program_doc("suppmax")
    at = lambda hid: ap._default_supp_time(pd.habit(hid), prof)
    assert at("electrolytes") == "18:00"            # its notes say "not close to bedtime"
    assert at("caffeine_theanine") == "07:15" and at("rhodiola") == "07:15"
    assert at("melatonin") == "21:45" and at("magnesium_glycinate") == "19:00"
