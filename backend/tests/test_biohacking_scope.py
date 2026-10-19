"""Superpower schedules biology, never productivity (services/biohack_scope.py).

Focusmax shipped as a planner (top 3, deep-work block, inbox batching, shutdown
ritual) and Calmmax as a journal. These tests keep every surface that names a
habit inside the biohacking scope: the program docs, the program blurbs, the
quiz labels, the fit engine's id lists, the product catalog and custom habits
written at runtime."""
from pathlib import Path

import pytest
import yaml

import services.ai_programs as ap
from services import ai_fit, biohack_scope, program_quiz
from tests.test_program_docs_kinds import ALL, ALL_IDS, DOCS, _ids

ROOT = Path(__file__).resolve().parent.parent


@pytest.mark.parametrize("doc,hid,fields", ALL, ids=_ids())
def test_every_habit_names_one_physiological_lever(doc, hid, fields):
    levers = [v.split()[0].strip("`,;").lower() for k, v in fields if k == "lever" and v.split()]
    assert len(levers) == 1, f"{doc}.{hid}: {len(levers)} lever lines"
    assert levers[0] in biohack_scope.LEVERS, f"{doc}.{hid}: lever {levers[0]!r}"
    kind = next((v for k, v in fields if k == "kind"), "")
    if kind == "checkin":
        assert levers[0] == "tracking", f"{doc}.{hid}: a check-in logs a body signal (lever tracking)"


@pytest.mark.parametrize("doc,hid,fields", ALL, ids=_ids())
def test_no_habit_is_a_productivity_habit(doc, hid, fields):
    for k, v in fields:          # titles are checked on the parsed library below
        if k in ("how", "why"):
            assert not biohack_scope.is_productivity(v), \
                f"{doc}.{hid} {k}: {biohack_scope.productivity_terms(v)} in {v[:160]!r}"
    assert not biohack_scope.is_productivity(hid.replace("_", " ")), hid


def test_parser_reads_the_lever():
    for mid in ap.AI_PROGRAMS:
        pd = ap.get_program_doc(mid)
        assert pd and pd.habits, mid
        for h in pd.habits:
            assert h.lever in biohack_scope.LEVERS, f"{mid}.{h.id}: {h.lever!r}"
            assert not biohack_scope.is_productivity(h.title), f"{mid}.{h.id}: {h.title}"


@pytest.mark.parametrize("path", DOCS, ids=[p.stem for p in DOCS])
def test_what_it_is_and_scheduling_rules_are_biology(path):
    text = path.read_text(encoding="utf-8")
    for head in ("## What it is", "## Scheduling rules", "## What the AI needs to know"):
        if head not in text:
            continue
        body = text.split(head, 1)[1].split("\n## ", 1)[0]
        assert not biohack_scope.is_productivity(body), \
            f"{path.stem} {head}: {biohack_scope.productivity_terms(body)}"


def test_program_blurbs_and_quiz_labels_are_biology():
    from api.marketplace import _MAXX_DETAIL
    for mid, p in ap.AI_PROGRAMS.items():
        for k in ("tagline", "description"):
            assert not biohack_scope.is_productivity(p.get(k, "")), f"{mid}.{k}: {p.get(k)}"
    for mid, d in _MAXX_DETAIL.items():
        text = " ".join([d.get("long_description", "")] + list(d.get("outcomes") or []))
        assert not biohack_scope.is_productivity(text), f"{mid}: {biohack_scope.productivity_terms(text)}"
    for mid, labels in program_quiz.ALREADY.items():
        for label in labels:
            assert not biohack_scope.is_productivity(label), f"{mid}: {label}"


def _lib_ids(mid: str) -> set[str]:
    pd = ap.get_program_doc(mid)
    return {h.id for h in pd.habits} if pd else set()


def test_engine_id_lists_only_name_library_habits():
    """A habit removed from the docs can't linger in the engine's lists."""
    named = set(ai_fit.WORK_NATIVE) | {h for g in ai_fit.CONCEPT_GROUPS for h in g} | set(ai_fit.WORKOUT)
    named -= {"resistance_training", "protein_at_meals"}      # legacy aliases kept for stored plans
    assert named <= ALL_IDS, sorted(named - ALL_IDS)
    for mid, labels in program_quiz.ALREADY.items():
        for label, ids in labels.items():
            assert set(ids) <= _lib_ids(mid), f"{mid} '{label}': {sorted(set(ids) - _lib_ids(mid))}"


RETIRED_NEEDS = {"daily_planner", "weekly_planner", "focus_timer", "phone_lockbox", "gratitude_journal", "notebook"}


def test_catalog_recommends_no_planner_or_journal_gear():
    data = yaml.safe_load((ROOT / "data" / "product_catalog.yaml").read_text(encoding="utf-8"))
    for p in data["products"]:
        if p.get("module") == "retired":
            continue
        assert p.get("need") not in RETIRED_NEEDS, f"{p['id']}: need {p.get('need')}"
        assert not biohack_scope.is_productivity(p.get("rationale", "")), f"{p['id']}: {p.get('rationale')}"


def _prof():
    return {"wake_time": "07:00", "bed_time": "23:00", "work": {"start": "09:00", "end": "17:00"},
            "meals": {"breakfast": "07:30", "lunch": "12:30", "dinner": "19:00"}, "minutes_per_day_total": 30}


def test_validate_template_drops_a_custom_productivity_habit():
    raw = {"habits": [
        {"habit_id": "custom_gratitude_journal", "title": "Gratitude journal", "how": "Write three lines.",
         "why": "x", "minutes": 5, "time": "21:00", "weekend_time": "", "days": ap.WEEKDAYS},
        {"habit_id": "custom_cold_rinse", "title": "Cold rinse", "how": "End the shower with 30 s cold.",
         "why": "x", "minutes": 2, "time": "07:20", "weekend_time": "", "days": ap.WEEKDAYS},
    ]}
    t = ap.validate_template("calmmax", raw, _prof())
    ids = {h["habit_id"] for h in t["habits"]}
    assert "custom_gratitude_journal" not in ids
    assert "custom_cold_rinse" in ids


@pytest.mark.parametrize("msg,hit", [
    ("can you add a gratitude journal every night?", True),
    ("add a daily top 3 plan before work", True),
    ("schedule a deep work block for me", True),
    ("add a cold shower in the morning", False),
    ("move my journaling", False),          # not an add; plan_intents resolves the target
    ("what's my plan for tomorrow?", False),
])
def test_asks_for_productivity_habit(msg, hit):
    assert biohack_scope.asks_for_productivity_habit(msg) is hit


# ── who a lever is wrong for (the shared health question + avoid-if lines) ────

@pytest.mark.parametrize("flags,mid,must_skip,must_keep", [
    ("Raynaud's or cold sensitivity", "calmmax", {"cold_shower_finish", "cold_face_reset"}, {"heat_session"}),
    ("Heart or blood-pressure condition", "calmmax", {"cold_shower_finish", "heat_session", "cold_face_reset"},
     {"move_it_out", "physiological_sigh"}),
    ("Heart or blood-pressure condition", "longevitymax", {"sauna_session", "interval_4x4", "stair_snack"},
     {"zone2_cardio", "strength_2x", "move_after_sitting"}),
    ("Pregnant or breastfeeding", "sleepmax", {"warm_shower"}, {"wind_down"}),
    ("Panic attacks, seizures or fainting", "calmmax", {"box_breathing"}, {"physiological_sigh"}),
    ("Prefer not to say", "focusmax", {"cold_shower_finish", "caffeine_for_focus"}, {"morning_light", "micro_break"}),
    ("None of these", "focusmax", set(), {"cold_shower_finish", "caffeine_for_focus"}),
])
def test_health_flags_rule_out_the_levers_that_are_wrong_for_them(flags, mid, must_skip, must_keep):
    skip = program_quiz.safety_skip_ids(mid, {"health_flags": flags})
    assert must_skip <= skip, sorted(must_skip - skip)
    assert not (must_keep & skip), sorted(must_keep & skip)


def test_under_18s_get_no_caffeine_habits():
    assert {"caffeine_for_focus", "green_tea_afternoon"} <= program_quiz.safety_skip_ids("focusmax", {"age_band": "Under 18"})


def test_cold_heat_rest_and_caffeine_answers_skip_what_they_rule_out():
    s = program_quiz.skip_ids
    assert {"cold_shower_finish", "cold_face_reset"} <= s("calmmax", {"cold_tolerance": "Not for me"})
    face = s("calmmax", {"cold_tolerance": "Cold on my face is my limit"})
    assert "cold_shower_finish" in face and "cold_face_reset" not in face
    assert {"sauna_session"} <= s("longevitymax", {"heat_access": "Neither"})
    assert "sauna_session" in s("longevitymax", {"heat_access": "A bathtub"})
    assert "heat_session" not in s("calmmax", {"heat_access": "A bathtub"})
    assert {"power_nap", "nsdr_break"} <= s("focusmax", {"rest_spot": "No"})
    assert {"caffeine_for_focus", "caffeine_cutoff"} <= s("focusmax", {"caffeine_pattern": "None"})
    assert "caffeine_ceiling" in s("calmmax", {"caffeine_jitters": "No noticeable effect"})
    assert "caffeine_ceiling" not in s("calmmax", {"caffeine_jitters": "Jittery even after 1 cup"})


def test_shared_body_questions_are_asked_once_with_one_set_of_options():
    for key in ("health_flags", "cold_tolerance", "heat_access"):
        seen = [(mid, q) for mid in program_quiz.QUIZ_PROGRAMS for q in program_quiz.quiz_for(mid)
                if q["fact_key"] == key]
        assert seen, key
        assert len({tuple(q["options"]) for _, q in seen}) == 1, key
    # answered in one program, never asked again in another
    about = {"health_flags": "None of these", "cold_tolerance": "Not for me", "heat_access": "Neither"}
    for mid in program_quiz.QUIZ_PROGRAMS:
        asked = []
        for _ in range(12):
            q = program_quiz.next_question(mid, {k: "x" for k in [a["fact_key"] for a in asked]}, asked,
                                           {"about": about})
            if q["done"]:
                break
            assert q["fact_key"] not in about, (mid, q["fact_key"])
            asked.append({"fact_key": q["fact_key"]})


@pytest.mark.asyncio
async def test_a_request_for_a_planner_habit_gets_an_honest_no():
    from services import plan_intents
    text = await plan_intents.handle("00000000-0000-0000-0000-000000000000", "add a gratitude journal every night", None)
    assert text and "biology" in text and "haven't added" in text


def test_planner_talk_in_claudes_steps_falls_back_to_the_library():
    raw = {"habits": [{"habit_id": "caffeine_for_focus", "title": "x", "minutes": 1, "time": "08:30",
                       "weekend_time": "", "days": ap.WEEKDAYS[:5],
                       "how": "1) Over your coffee, plan your top 3 for the day. 2) Write down your goals.",
                       "why": "a to-do list keeps you on track"}]}
    t = ap.validate_template("focusmax", raw, _prof())
    h = t["habits"][0]
    assert not biohack_scope.is_productivity(h["how"]) and not biohack_scope.is_productivity(h["why"])
    assert "30 min before" in h["how"]
