"""Peptidemax protocol check (services/peptide_intake.py): the quiz walks the
right questions for each person, the rules give each peptide the right
verdict, and the plan never holds a dose reminder it shouldn't."""
from __future__ import annotations

from datetime import date, timedelta

import pytest

import services.ai_programs as ap
import services.peptide_intake as P

PROFILE = {"wake_time": "07:00", "bed_time": "23:00", "workout_time": "18:00",
           "meals": {"breakfast": "07:30", "lunch": "12:30", "dinner": "19:00"}}


def walk(script: dict, profile: dict | None = None, max_steps: int = 60):
    """Answer the quiz from `script` (question fact_key prefix -> answer, or a
    callable); unscripted single-choice questions take the first option."""
    answers, asked = {}, []
    for _ in range(max_steps):
        step = P.next_question(answers, asked, profile)
        if step["done"]:
            return answers, [a["fact_key"] for a in asked]
        k = step["fact_key"]
        asked.append({"fact_key": k, "question": step["question"]})
        hits = [pre for pre in script if k == pre or k.startswith(pre)]
        ans = script[max(hits, key=len)] if hits else None
        if callable(ans):
            ans = ans(step)
        if ans is None:
            ans = step["options"][0] if step["options"] else "not sure"
        answers[k] = ans
    raise AssertionError(f"quiz did not finish: {asked[-5:]}")


FULL_LABEL = "My name, Who dispensed it (pharmacy or clinic) and a phone, My prescriber's name, How often to take it"

BASE = {
    "pep_consent": "Yes, I agree", "age_band": "30–49", "pep_situation": "Prescribed, and I'm taking it",
    "pep_prescriber": "A telehealth service", "pep_evaluation": "A video or in-person visit",
    "pep_label": FULL_LABEL, "pep_pharmacy": "Belmar Pharmacy, CO",
    "pep_screen": P.NONE_OPT, "pep_oral_bc": "No",
    "pep_monitoring": "Labs and check-ins", "pep_supply": "In 2 to 4 weeks", "pep_confirm": "Yes, it matches my label",
}


def glp1(**over):
    s = {**BASE, "pep_names": "Tirzepatide (Zepbound, Mounjaro)", "pep_source": "A regular pharmacy",
         "pep_form": "Pre-filled pen", "pep_freq": "Once a week", "pep_day": "Sunday", "pep_time": "Evening"}
    s.update(over)
    return s


def plan(answers, profile=PROFILE, **kw):
    return P.build_template(answers, profile, started_on="2026-10-19", **kw)


def ids(t):
    return [h["habit_id"] for h in t["habits"]]


# ── who doesn't get a plan at all ───────────────────────────────────────────

def test_no_consent_stops_before_any_health_question():
    a, keys = walk({"pep_consent": "No thanks"})
    assert keys == ["pep_consent"]
    d = P.decide(a)
    assert d["track"] == "no_consent" and P.blocked_reply(d)


def test_minors_never_get_peptidemax():
    a, keys = walk({**BASE, "age_band": "Under 18"})
    assert keys[-1] == "age_band"
    assert P.decide(a)["track"] == "blocked_minor"
    assert "18" in P.blocked_reply(P.decide(a))


def test_known_age_is_not_asked_again():
    _, keys = walk(glp1(), {"about": {"age_band": "30–49", "sex": "Male"}})
    assert "age_band" not in keys


# ── considering: learn first, never a reminder ──────────────────────────────

def test_considering_gets_course_and_a_clinician_not_reminders():
    a, keys = walk({**BASE, "pep_situation": "Just considering peptides", "pep_interest": "Recovery and training"})
    assert keys[-1] == "pep_interest" and not any(k.startswith("pep_names") for k in keys)
    t = plan(a)
    assert P.decide(a)["track"] == "learn_first"
    assert set(ids(t)) == {"learn_first", "prescriber_followup"}
    assert not any(i.startswith("custom_dose") for i in ids(t))


# ── the standard case ───────────────────────────────────────────────────────

def test_prescribed_glp1_from_a_pharmacy_gets_reminders_and_supports():
    a, keys = walk(glp1(), {"about": {"sex": "Female"}})
    assert "pep_oral_bc" in keys                      # tirzepatide + not male
    d = P.decide(a, {"about": {"sex": "Female"}})
    assert d["track"] == "protocol" and d["peptides"][0]["verdict"] == "remind"
    t = plan(a)
    dose = next(h for h in t["habits"] if h["habit_id"] == "custom_dose_tirzepatide")
    assert dose["days"] == ["sun"] and dose["time"] == "20:00"
    assert "exactly the dose on your label" in dose["how"] and "never sets or changes an amount" in dose["how"]
    assert {"side_effect_log", "weekly_protocol_review", "sharps_disposal", "bloodwork_checkin", "prescriber_followup",
            "refill_planning", "protein_at_meals", "resistance_training", "hydration_fiber"} <= set(ids(t))
    log = next(h for h in t["habits"] if h["habit_id"] == "side_effect_log")
    assert log["days"] == ["sun", "mon"]               # dose day and the day after


def test_men_are_not_asked_about_birth_control_pills():
    _, keys = walk(glp1(), {"about": {"sex": "Male"}})
    assert "pep_oral_bc" not in keys


def test_fitmax_users_get_their_strength_credited_not_doubled():
    a, _ = walk(glp1())
    assert "resistance_training" not in ids(plan(a, runs_fitmax=True))


# ── hard flags: the prescriber's decision stands, but only if they know ────

@pytest.mark.parametrize("screen,flag", [
    ("Thyroid cancer (MTC) or MEN 2, me or family", "mtc_men2"),
    ("An eating disorder, now or before", "eating_disorder"),
])
def test_glp1_hard_flags_hold_unless_the_prescriber_knows(screen, flag):
    a, keys = walk(glp1(pep_screen_glp1=screen, pep_aware="No, or I'm not sure"))
    assert "pep_aware" in keys
    d = P.decide(a)
    assert d["track"] == "hold" and d["peptides"][0]["verdict"] == "hold"
    t = plan(a)
    assert not any(i.startswith("custom_dose") for i in ids(t))
    assert "Talk to your prescriber before your next dose" in [h["title"] for h in t["habits"]]
    a2, _ = walk(glp1(pep_screen_glp1=screen, pep_aware="Yes, they know and still prescribed it"))
    assert P.decide(a2)["peptides"][0]["verdict"] == "remind"
    t2 = plan(a2)
    assert "custom_dose_tirzepatide" in ids(t2) and "prescriber_review" in ids(t2)
    if flag == "eating_disorder":
        assert "protein_at_meals" not in ids(t2)        # no weight-focused supports


def test_pregnancy_holds_every_injected_peptide():
    a, _ = walk(glp1(pep_screen_general="Pregnant, trying, or breastfeeding", pep_aware="No, or I'm not sure"))
    assert P.decide(a)["track"] == "hold"


def test_soft_flags_keep_reminders_and_go_to_week_1_review():
    a, keys = walk(glp1(pep_screen_glp1="Pancreatitis, ever, Gallbladder problems"))
    assert "pep_aware" not in keys                    # soft flags don't need it
    t = plan(a)
    review = next(h for h in t["habits"] if h["habit_id"] == "prescriber_review")
    assert "pancreatitis" in review["how"] and "gallbladder" in review["how"] and review["weeks"] == [1]


def test_gh_axis_cancer_history_holds_and_diabetes_flags():
    s = {**BASE, "pep_names": "Tesamorelin", "pep_source": "A regular pharmacy", "pep_form": "Vial I draw from",
         "pep_freq": "Every day", "pep_time": "Before bed"}
    a, keys = walk({**s, "pep_screen_gh": "Cancer, now or in the past", "pep_aware": "No, or I'm not sure"})
    assert "pep_screen_gh" in keys and "pep_screen_glp1" not in keys
    assert P.decide(a)["peptides"][0]["verdict"] == "hold"
    a2, _ = walk({**s, "pep_screen_gh": "Diabetes or high blood sugar"})
    d2 = P.decide(a2)
    assert d2["peptides"][0]["verdict"] == "remind" and "diabetes" in {f["code"] for f in d2["flags"]}


# ── sources and prescribers: who can't get reminders ────────────────────────

def test_research_use_only_never_gets_dose_reminders():
    s = {**BASE, "pep_names": "BPC-157", "pep_prescriber": "A peptide, wellness or med spa clinic",
         "pep_source": "It says 'research use only'", "pep_form": "Powder I mix", "pep_freq": "Every day",
         "pep_time": "Morning", "pep_screen_research": P.NONE_OPT}
    a, _ = walk(s)
    d = P.decide(a)
    assert d["track"] == "safety_first" and d["peptides"][0]["verdict"] == "safety_only"
    t = plan(a)
    assert not any(i.startswith("custom_dose") for i in ids(t))
    assert {"clinician_visit", "side_effect_log", "sharps_disposal", "weekly_protocol_review"} <= set(ids(t))


def test_self_sourced_skips_schedule_questions_entirely():
    s = {**BASE, "pep_situation": "Taking it without a prescription", "pep_names": "BPC-157, TB-500",
         "pep_source": "A website, no prescription needed", "pep_form": "Powder I mix"}
    a, keys = walk(s)
    assert not any(k.startswith(("pep_freq", "pep_day", "pep_time", "pep_prescriber", "pep_confirm", "pep_monitoring"))
                   for k in keys)
    assert P.decide(a)["track"] == "safety_first"


def test_a_coach_is_not_a_prescriber():
    a, _ = walk(glp1(pep_prescriber="A coach, trainer or friend"))
    assert P.decide(a)["peptides"][0]["verdict"] == "safety_only"


def test_retatrutide_cannot_be_prescribed_so_no_reminders():
    s = {**BASE, "pep_names": "retatrutide", "pep_source": "A compounding pharmacy, my name on the label",
         "pep_form": "Vial I draw from", "pep_freq": "Once a week", "pep_day": "Monday", "pep_time": "Morning",
         "pep_screen_research": P.NONE_OPT}
    a, _ = walk(s)
    p = P.decide(a)["peptides"][0]
    assert p["verdict"] == "safety_only" and "still in trials" in p["reasons"][0]


def test_mixed_protocol_reminds_the_prescribed_one_only():
    s = glp1(pep_names="Tirzepatide (Zepbound, Mounjaro), BPC-157",
             pep_source_bpc157="A website, no prescription needed", pep_form_bpc157="Powder I mix",
             pep_freq_bpc157="Every day", pep_time_bpc157="Morning", pep_screen_research=P.NONE_OPT)
    a, _ = walk(s)
    verdicts = {p["slug"]: p["verdict"] for p in P.decide(a)["peptides"]}
    assert verdicts == {"tirzepatide": "remind", "bpc157": "safety_only"}
    t = plan(a)
    assert "custom_dose_tirzepatide" in ids(t) and "custom_dose_bpc157" not in ids(t)
    assert "clinician_visit" in ids(t) and "prescriber_followup" in ids(t)   # both kept, distinct ids


def test_prescribed_research_peptide_is_flagged_as_not_compoundable():
    s = {**BASE, "pep_names": "BPC-157", "pep_prescriber": "My doctor or nurse practitioner",
         "pep_source": "A compounding pharmacy, my name on the label", "pep_form": "Vial I draw from",
         "pep_freq": "Every day", "pep_time": "Morning", "pep_screen_research": P.NONE_OPT}
    a, _ = walk(s)
    d = P.decide(a)
    assert d["peptides"][0]["verdict"] == "remind" and "not_compoundable" in {f["code"] for f in d["flags"]}


# ── names, athletes, on-demand, unknowns ────────────────────────────────────

def test_typed_names_and_brands_resolve():
    got = [p.slug for p in P.parse_names("I'm on wegovy and bpc, plus ipamorelin")]
    assert got == ["semaglutide", "bpc157", "ipamorelin"]
    assert [p.slug for p in P.parse_names("CJC-1295 or Ipamorelin")] == ["cjc1295", "ipamorelin"]
    unk = P.parse_names("foxo4-dri")
    assert unk and unk[0].klass == P.UNKNOWN


def test_unreadable_name_is_asked_once_more_then_kept_generic():
    a, keys = walk({**BASE, "pep_names": "idk", "pep_names_typed": "no idea",
                    "pep_source": "A regular pharmacy", "pep_form": "Pill", "pep_freq": "Every day",
                    "pep_time": "Morning", "pep_screen_research": P.NONE_OPT})
    assert "pep_names_typed" in keys


def test_tested_athletes_get_a_global_dro_check_for_banned_peptides():
    s = {**BASE, "pep_names": "Ipamorelin", "pep_prescriber": "My doctor or nurse practitioner",
         "pep_source": "A compounding pharmacy, my name on the label", "pep_form": "Vial I draw from",
         "pep_freq": "Every day", "pep_time": "Before bed", "pep_screen_general": "I compete in a drug-tested sport",
         "pep_screen_gh": P.NONE_OPT}
    a, _ = walk(s)
    assert "anti_doping_check" in ids(plan(a))
    # a tested athlete on an approved GLP-1 (not prohibited) gets no such task
    a2, _ = walk(glp1(pep_screen_general="I compete in a drug-tested sport"))
    assert "anti_doping_check" not in ids(plan(a2))


def test_on_demand_bremelanotide_is_logged_not_reminded_and_men_are_flagged():
    s = {**BASE, "pep_names": "PT-141", "pep_source": "A regular pharmacy", "pep_form": "Pre-filled pen",
         "pep_freq": "Only when needed", "pep_screen_melano": P.NONE_OPT}
    a, keys = walk(s, {"about": {"sex": "Male"}})
    assert "pep_screen_melano" in keys and not any(k.startswith("pep_time") for k in keys)
    t = plan(a, {**PROFILE, "about": {"sex": "Male"}})
    assert not any(i.startswith("custom_dose") for i in ids(t))
    log = next(h for h in t["habits"] if h["habit_id"] == "side_effect_log")
    assert "each time you take Bremelanotide" in log["how"]
    assert "male_bremelanotide" in {f["code"] for f in P.decide(a, {"about": {"sex": "Male"}})["flags"]}


def test_melanotan_ii_is_always_a_hard_flag():
    s = {**BASE, "pep_names": "melanotan 2", "pep_source": "My clinic hands it to me", "pep_form": "Vial I draw from",
         "pep_freq": "Some days on, some off", "pep_cycle": "5 days on, 2 off", "pep_time": "Evening",
         "pep_screen_melano": P.NONE_OPT, "pep_screen_research": P.NONE_OPT, "pep_aware": "No, or I'm not sure"}
    a, _ = walk(s)
    assert P.decide(a)["peptides"][0]["verdict"] == "hold"


def test_cycles_map_to_days_and_unmappable_schedules_get_no_reminder():
    s = {**BASE, "pep_names": "Sermorelin", "pep_source": "A compounding pharmacy, my name on the label",
         "pep_form": "Vial I draw from", "pep_freq": "Some days on, some off", "pep_cycle": "5 days on, 2 off",
         "pep_time": "Before bed", "pep_screen_gh": P.NONE_OPT}
    a, _ = walk(s)
    dose = next(h for h in plan(a)["habits"] if h["habit_id"] == "custom_dose_sermorelin")
    assert dose["days"] == ["mon", "tue", "wed", "thu", "fri"] and "5 days on, 2 off" in dose["how"]
    a2, _ = walk({**s, "pep_freq": "Something else (type it)", "pep_freq_sermorelin": "every third day"})
    t2 = plan(a2)
    assert "custom_dose_sermorelin" not in ids(t2) and "label_check" in ids(t2)


# ── the label confirmation and corrections ──────────────────────────────────

def test_a_correction_reasks_only_that_part_and_the_answer_wins():
    script = glp1(pep_confirm="Something's different", pep_fix_1="How often or when")
    answers, asked = {}, []
    seen_fix = False
    for _ in range(60):
        step = P.next_question(answers, asked, {"about": {"sex": "Male"}})
        if step["done"]:
            break
        k = step["fact_key"]
        asked.append({"fact_key": k})
        if k == "pep_freq_tirzepatide~1":
            seen_fix = True
            answers[k] = "Once a week"
        elif k == "pep_day_tirzepatide~1":
            answers[k] = "Wednesday"
        elif k == "pep_time_tirzepatide~1":
            answers[k] = "Morning"
        elif k == "pep_confirm~1":
            answers[k] = "Yes, it matches my label"
        else:
            hits = [pre for pre in script if k.startswith(pre)]
            answers[k] = script[max(hits, key=len)] if hits else (step["options"][0] if step["options"] else "x")
    assert seen_fix and "pep_source_tirzepatide~1" not in answers   # the source wasn't re-asked
    dose = next(h for h in plan(answers)["habits"] if h["habit_id"] == "custom_dose_tirzepatide")
    assert dose["days"] == ["wed"] and dose["time"] == "07:30"


def test_still_different_after_two_rounds_holds_reminders():
    s = glp1(pep_confirm="Something's different", pep_fix="The form it comes in")
    a, keys = walk(s, {"about": {"sex": "Male"}})
    assert "pep_fix_2" in keys and "pep_confirm~2" in keys
    assert P.decide(a)["peptides"][0]["verdict"] == "hold"


def test_no_label_handy_keeps_reminders_with_a_label_check():
    a, _ = walk(glp1(pep_confirm="I don't have the label handy"), {"about": {"sex": "Male"}})
    t = plan(a)
    assert "custom_dose_tirzepatide" in ids(t) and "label_check" in ids(t)
    dose = next(h for h in t["habits"] if h["habit_id"] == "custom_dose_tirzepatide")
    assert "Check this reminder against your pharmacy label" in dose["how"]


# ── the plan never states a dose or a recommendation ────────────────────────

def test_no_plan_text_ever_names_an_amount_or_recommends():
    import re
    bad = re.compile(r"\b\d+(\.\d+)?\s*(mg|mcg|iu|units?|ml|cc)\b|you should (try|take|start)|recommend", re.I)
    cases = [glp1(), glp1(pep_screen_glp1="Pancreatitis, ever")]
    for s in cases:
        a, _ = walk(s)
        t = plan(a)
        for h in t["habits"]:
            assert not bad.search(h["how"] + " " + h["why"] + " " + h["title"]), (h["habit_id"], h["how"])
        assert not bad.search(t["summary"])


# ── wiring: the fit keeps everything, weeks limit tasks, the guard holds ────

def test_validated_plan_keeps_every_protocol_habit_and_week_limits():
    a, _ = walk(glp1())
    raw = plan(a)
    tmpl = ap.validate_template("peptidemax", raw, {**PROFILE, "minutes_per_day_total": 25},
                                keep_ids={h["habit_id"] for h in raw["habits"]})
    assert set(ids(tmpl)) == set(ids(raw))
    sharps = next(h for h in tmpl["habits"] if h["habit_id"] == "sharps_disposal")
    assert sharps["weeks"] == [1] and sharps["every_weeks"] == 4
    days = ap.expand_template("peptidemax", tmpl, start_date=date(2026, 10, 19), n_days=35)
    sharps_dates = [d["date"] for d in days for t in d["tasks"] if t["catalog_id"].endswith("sharps_disposal")]
    assert sharps_dates == ["2026-10-24", "2026-11-21"]              # week 1 and week 5 Saturdays


def test_chat_edits_cannot_add_or_reword_dose_reminders():
    current = {"habits": [{"habit_id": "custom_dose_tirzepatide", "title": "Tirzepatide dose", "how": "label first"}],
               "peptide_profile": {"track": "protocol"}, "started_on": "2026-10-19"}
    new = {"habits": [{"habit_id": "custom_dose_bpc157", "title": "BPC-157 dose", "how": "500mcg daily"},
                      {"habit_id": "custom_dose_tirzepatide", "title": "Tirz", "how": "take 5mg"}]}
    out = ap._peptide_guard(new, current)
    assert ids(out) == ["custom_dose_tirzepatide"] and out["habits"][0]["how"] == "label first"
    assert out["peptide_profile"] == {"track": "protocol"}
    dropped = ap._peptide_guard({"habits": []}, current)
    assert ids(dropped) == ["custom_dose_tirzepatide"]                # can't drop one silently either


# ── iteration 2: emergency check, incretin overlap, compounding, wording ───

def test_urgent_symptoms_stop_setup_and_point_to_care():
    a, keys = walk(glp1(pep_urgent="Severe belly pain that won't go away"))
    assert keys[-1] == "pep_urgent"
    d = P.decide(a)
    assert d["track"] == "urgent" and "911" in P.blocked_reply(d)
    a2, _ = walk(glp1(pep_urgent="Thoughts of harming myself"))
    assert "988" in P.blocked_reply(P.decide(a2))


def test_people_only_considering_get_no_emergency_screen():
    _, keys = walk({**BASE, "pep_situation": "Just considering peptides"})
    assert "pep_urgent" not in keys


def test_two_glp1_drugs_at_once_is_a_hard_flag():
    s = glp1(pep_names="Ozempic and Mounjaro", pep_aware="No, or I'm not sure")
    a, keys = walk(s)
    assert "pep_aware" in keys
    assert {p["verdict"] for p in P.decide(a)["peptides"]} == {"hold"}


def test_compounded_glp1_is_flagged():
    a, _ = walk(glp1(pep_source="A compounding pharmacy, my name on the label"))
    d = P.decide(a)
    assert d["peptides"][0]["verdict"] == "remind" and "compounded_glp1" in {f["code"] for f in d["flags"]}


def test_bad_sources_skip_schedule_questions():
    s = {**BASE, "pep_names": "BPC-157", "pep_prescriber": "A peptide, wellness or med spa clinic",
         "pep_source": "It says 'research use only'", "pep_form": "Powder I mix", "pep_screen_research": P.NONE_OPT}
    _, keys = walk(s)
    assert not any(k.startswith(("pep_freq", "pep_day", "pep_time")) for k in keys)


def test_hold_never_tells_anyone_to_stop_their_medicine():
    a, _ = walk(glp1(pep_screen_glp1="Thyroid cancer (MTC) or MEN 2, me or family", pep_aware="No, or I'm not sure"))
    t = plan(a)
    text = t["summary"] + " ".join(h["how"] for h in t["habits"])
    assert "isn't me telling you to stop" in t["summary"]
    assert "Don't stop or change anything on your own" in text


def test_unapproved_gh_peptides_get_the_pharmacy_question_too():
    s = {**BASE, "pep_names": "CJC-1295", "pep_source": "A compounding pharmacy, my name on the label",
         "pep_form": "Vial I draw from", "pep_freq": "Every day", "pep_time": "Before bed", "pep_screen_gh": P.NONE_OPT}
    a, _ = walk(s)
    assert "not_compoundable" in {f["code"] for f in P.decide(a)["flags"]}


# ── iteration 3: label checks, label-accurate flags, consent, registry, deletion ──

def test_how_its_made_or_sold_is_not_read_as_another_peptide():
    assert [p.slug for p in P.parse_names("compounded semaglutide")] == ["semaglutide"]
    assert [p.slug for p in P.parse_names("sema + b12")] == ["semaglutide"]
    assert [p.slug for p in P.parse_names("zepbound kwikpen")] == ["tirzepatide"]
    assert [p.slug for p in P.parse_names("hgh frag 176-191")] == ["aod9604"]
    assert [p.slug for p in P.parse_names("Genotropin")] == ["somatropin"]


def test_salt_forms_never_get_reminders_or_schedule_questions():
    a, keys = walk(glp1(**{"pep_names": "semaglutide sodium", "pep_source": "A compounding pharmacy, my name on the label",
                           "pep_form": "Vial I draw from"}))
    p = P.decide(a)["peptides"][0]
    assert p["verdict"] == "safety_only" and "salt form" in p["reasons"][0]
    assert not any(k.startswith(("pep_label", "pep_freq")) for k in keys)


@pytest.mark.parametrize("label,why", [
    ("How often to take it", "doesn't show your name"),
    ("There's no pharmacy label", "no pharmacy label"),
    (FULL_LABEL + ", A use-by date that has passed", "use-by date"),
    ("My name, How often to take it", "who dispensed it"),
])
def test_a_label_that_doesnt_show_it_was_dispensed_for_you_holds(label, why):
    a, keys = walk(glp1(pep_label=label))
    p = P.decide(a)["peptides"][0]
    assert p["verdict"] == "hold" and p["hold_kind"] == "label" and why in p["reasons"][0]
    assert not any(k.startswith("pep_freq") for k in keys)      # no schedule questions while held
    t = plan(a)
    assert "custom_label_fix" in ids(t) and not any(i.startswith("custom_dose") for i in ids(t))
    assert "pharmacy" in next(h for h in t["habits"] if h["habit_id"] == "custom_label_fix")["how"]
    assert "sort the label out" in t["summary"]


def test_cant_check_the_label_keeps_reminders_with_a_label_check():
    a, _ = walk(glp1(pep_label="I can't check right now"))
    t = plan(a)
    assert P.decide(a)["peptides"][0]["verdict"] == "remind" and "label_check" in ids(t)
    dose = next(h for h in t["habits"] if h["habit_id"].startswith("custom_dose"))
    assert "Check this reminder against your pharmacy label" in dose["how"]


def test_a_label_without_a_schedule_or_prescriber_is_flagged_not_held():
    a, _ = walk(glp1(pep_label="My name, Who dispensed it (pharmacy or clinic) and a phone, Just 'use as directed'"))
    d = P.decide(a)
    codes = {f["code"] for f in d["flags"]}
    assert d["peptides"][0]["verdict"] == "remind" and {"as_directed", "label_prescriber"} <= codes
    t = plan(a)
    assert "in writing" in next(h for h in t["habits"] if h["habit_id"] == "label_check")["how"]
    review = next(h for h in t["habits"] if h["habit_id"] == "prescriber_review")["how"]
    assert "real prescription" in review and "spell out" not in review


def test_typed_all_of_it_counts_as_a_full_label():
    a, _ = walk(glp1(pep_label="yes it has all of that"))
    assert not {"as_directed", "label_prescriber"} & {f["code"] for f in P.decide(a)["flags"]}


def test_online_form_only_prescribing_is_flagged_and_doctors_arent_asked():
    a, _ = walk(glp1(pep_evaluation="Only an online form"))
    d = P.decide(a)
    assert d["peptides"][0]["verdict"] == "remind" and "questionnaire_only" in {f["code"] for f in d["flags"]}
    _, keys = walk(glp1(pep_prescriber="My doctor or nurse practitioner"))
    assert "pep_evaluation" not in keys


def test_typed_prescribers_are_understood():
    assert P._prescriber("Dr. Patel") == "clinician"
    assert P._prescriber("my trainer at the gym") == "unlicensed"
    assert P._prescriber("hims") == "telehealth"
    assert P._prescriber("I do not know") is None


def test_hgh_is_never_compounded_and_pituitary_doesnt_hold_it():
    base = {**BASE, "pep_names": "norditropin", "pep_form": "Pre-filled pen", "pep_freq": "Every day",
            "pep_time": "Before bed"}
    a, _ = walk({**base, "pep_source": "A compounding pharmacy, my name on the label"})
    assert P.decide(a)["peptides"][0]["verdict"] == "safety_only"
    a, _ = walk({**base, "pep_source": "A regular pharmacy", "pep_screen_gh": "A pituitary or hypothalamus condition"})
    d = P.decide(a)
    assert d["peptides"][0]["verdict"] == "remind" and "scope_somatropin" in {f["code"] for f in d["flags"]}


def test_category_2_mk677_is_safety_only_and_heart_failure_is_asked():
    a, keys = walk({**BASE, "pep_names": "mk-677", "pep_source": "A compounding pharmacy, my name on the label",
                    "pep_form": "Pill", "pep_screen_gh": lambda step: "Heart failure" if "Heart failure" in step["options"] else None})
    d = P.decide(a)
    assert d["peptides"][0]["verdict"] == "safety_only" and "heart_failure" in {f["code"] for f in d["flags"]}
    visit = next(h for h in plan(a)["habits"] if h["habit_id"] == "clinician_visit")
    assert "heart failure" in visit["how"]


def test_sermorelin_is_compoundable_and_unknown_names_go_to_the_pharmacist():
    a, _ = walk({**BASE, "pep_names": "Sermorelin", "pep_source": "A compounding pharmacy, my name on the label",
                 "pep_form": "Vial I draw from", "pep_freq": "Every day", "pep_time": "Before bed"})
    assert "not_compoundable" not in {f["code"] for f in P.decide(a)["flags"]}
    seen = {}
    a, _ = walk({**BASE, "pep_names": "Something else (type it)", "pep_names_typed": "foxo4-dri",
                 "pep_source": "A compounding pharmacy, my name on the label", "pep_form": "Vial I draw from",
                 "pep_freq": "Every day", "pep_time": "Morning",
                 "pep_screen_research": lambda step: seen.setdefault("q", step["question"]) and P.NONE_OPT})
    codes = {f["code"] for f in P.decide(a)["flags"]}
    assert "unknown_name" in codes and "not_compoundable" not in codes
    assert "don't have" in seen["q"] and "FDA-approved" not in seen["q"]


def test_oral_semaglutide_gets_the_pill_rules_and_levothyroxine_check():
    a, _ = walk(glp1(**{"pep_names": "rybelsus", "pep_form": "Pill", "pep_freq": "Every day", "pep_time": "Morning",
                        "pep_screen_glp1": lambda step: "Thyroid medicine (levothyroxine)"
                        if "Thyroid medicine (levothyroxine)" in step["options"] else None}))
    assert "levothyroxine" in {f["code"] for f in P.decide(a)["flags"]}
    dose = next(h for h in plan(a)["habits"] if h["habit_id"] == "custom_dose_semaglutide")
    assert "empty stomach" in dose["how"]
    a, _ = walk(glp1(pep_names="ozempic"))       # injection users never see the pill-only option
    assert "levothyroxine" not in {f["code"] for f in P.decide(a)["flags"]}


def test_tesamorelin_and_vials_get_their_label_specific_steps():
    a, _ = walk({**BASE, "pep_names": "egrifta", "pep_source": "A regular pharmacy", "pep_form": "Powder I mix",
                 "pep_freq": "Every day", "pep_time": "Morning"})
    d = P.decide(a)
    assert "scope_tesamorelin" in {f["code"] for f in d["flags"]}
    how = next(h for h in plan(a)["habits"] if h["habit_id"] == "custom_dose_tesamorelin")["how"]
    assert "WR and Egrifta SV" in how and "mL, units and mg" in how


def test_missed_doses_point_to_the_label_never_to_doubling():
    how = next(h for h in plan(walk(glp1())[0])["habits"] if h["habit_id"].startswith("custom_dose"))["how"]
    assert "missed-dose steps on your label" in how and "double" not in how.lower()


def test_bremelanotide_gets_its_labels_8_week_check():
    s = {**BASE, "pep_names": "vyleesi", "pep_source": "A regular pharmacy", "pep_form": "Pre-filled pen",
         "pep_freq": "Only when needed", "pep_screen_melano": P.NONE_OPT}
    t = plan(walk(s)[0])
    h = next(h for h in t["habits"] if h["habit_id"] == "custom_review_bremelanotide")
    assert h["weeks"] == [8]
    v = ap.validate_template("peptidemax", t, {**PROFILE, "minutes_per_day_total": 25}, keep_ids=set(ids(t)))
    assert v is not None and "custom_review_bremelanotide" in ids(v)
    v["started_on"] = "2026-10-19"
    week8 = ap.expand_template("peptidemax", v, start_date=date(2026, 12, 7), n_days=7)
    week1 = ap.expand_template("peptidemax", v, start_date=date(2026, 10, 19), n_days=7)
    has = lambda days: any(task["catalog_id"].endswith("custom_review_bremelanotide") for d in days for task in d["tasks"])
    assert has(week8) and not has(week1)


def test_transplant_holds_thymosin_and_blood_thinners_flag_semax():
    s = {**BASE, "pep_names": "thymosin alpha-1, semax", "pep_source": "A compounding pharmacy, my name on the label",
         "pep_form": "Vial I draw from", "pep_freq": "Every day", "pep_time": "Morning",
         "pep_screen_research": lambda step: ", ".join(o for o in step["options"] if o.startswith(("A transplant", "Blood thinners"))),
         "pep_aware": "No, or I'm not sure"}
    a, _ = walk(s)
    d = P.decide(a)
    v = {p["slug"]: p["verdict"] for p in d["peptides"]}
    assert v == {"thymosin_a1": "hold", "semax": "remind"} and "bleeding" in {f["code"] for f in d["flags"]}


def test_consent_says_what_why_who_and_how_to_withdraw():
    c = P.CONSENT_TEXT.lower()
    for must in ("what i'll ask and save", "only your reminders", "ai providers", "never sold", "ads",
                 "delete", "isn't medical advice", "never chooses or doses"):
        assert must in c
    a, _ = walk(glp1())
    assert P.read(a)["consent"] is True


def test_pharmacy_is_parsed_for_the_registry():
    assert P._parse_pharmacy("Belmar Pharmacy, CO") == ("belmar pharmacy", "CO")
    assert P._parse_pharmacy("Empower Pharmacy in Texas") == ("empower pharmacy", "TX")
    assert P._parse_pharmacy("Hallandale Pharmacy FL") == ("hallandale pharmacy", "FL")
    assert P._parse_pharmacy("Strive Compounding Pharmacy LLC") == ("strive compounding pharmacy", "")


class _Res:
    def __init__(self, data):
        self.data = data

    def raise_for_status(self):
        return None

    def json(self):
        return self.data


class _Client:
    """A stand-in NPPES: answers only the queries it was built for."""
    def __init__(self, hits_for=None, fail=False):
        self.hits_for, self.fail, self.calls = hits_for or {}, fail, []

    async def get(self, url, params=None):
        self.calls.append(dict(params or {}))
        if self.fail:
            raise RuntimeError("down")
        key = (params["organization_name"], params.get("state", ""))
        return _Res({"results": self.hits_for.get(key, [])})


CO = {"basic": {"organization_name": "KEBD ENTERPRISES, LLC", "status": "A"},
      "other_names": [{"organization_name": "BELMAR PHARMACY"}],
      "addresses": [{"address_purpose": "LOCATION", "city": "GOLDEN", "state": "CO"}]}
FL = {"basic": {"organization_name": "BELMAR PHARMACY FLORIDA, LLC.", "status": "A"},
      "addresses": [{"address_purpose": "MAILING", "city": "GOLDEN", "state": "CO"},
                    {"address_purpose": "LOCATION", "city": "ODESSA", "state": "FL"}]}


def _registry(answers, client):
    import asyncio
    return asyncio.run(P.check_registry(answers, client=client))


def test_registry_found_is_said_in_the_plan_and_not_found_is_a_review_item():
    a, keys = walk(glp1(**{"pep_source": "A compounding pharmacy, my name on the label", "pep_form": "Vial I draw from"}))
    assert "pep_pharmacy" in keys
    # NPPES's state filter also returns pharmacies that only have a mailing address there
    found = _registry(a, _Client({("belmar pharmacy*", "CO"): [FL, CO]}))
    assert found["pep_registry"] == {"status": "found", "name": "Belmar Pharmacy", "where": "Golden, CO"}
    assert "Belmar Pharmacy (Golden, CO)" in plan(found)["summary"]
    other = _registry(a, _Client({("belmar pharmacy*", "CO"): [FL]}))
    assert other["pep_registry"]["status"] == "elsewhere"
    assert "pharmacy_elsewhere" in {f["code"] for f in P.decide(other)["flags"]}
    c = _Client()
    missing = _registry(a, c)
    assert missing["pep_registry"]["status"] == "not_found" and any("state" not in q for q in c.calls)
    d = P.decide(missing)
    assert d["peptides"][0]["verdict"] == "remind" and "pharmacy_not_found" in {f["code"] for f in d["flags"]}


def test_registry_skip_and_outage_change_nothing():
    a, _ = walk(glp1(**{"pep_source": "A compounding pharmacy, my name on the label", "pep_form": "Vial I draw from",
                        "pep_pharmacy": "Skip this"}))
    assert _registry(a, _Client())["pep_registry"] == {"status": "skipped"}
    down = _registry(walk(glp1(**{"pep_source": "A compounding pharmacy, my name on the label",
                                  "pep_form": "Vial I draw from"}))[0], _Client(fail=True))
    assert down["pep_registry"] == {"status": "error"}
    assert P.decide(down)["peptides"][0]["verdict"] == "remind"
    assert "pharmacy_not_found" not in {f["code"] for f in P.decide(down)["flags"]}
    retail, keys = walk(glp1())
    assert "pep_pharmacy" not in keys and "pep_registry" not in _registry(retail, _Client())


def test_stopping_peptidemax_deletes_its_health_details():
    from types import SimpleNamespace
    sched = SimpleNamespace(
        maxx_id="peptidemax",
        schedule_context={"summary": "x", "thread_id": "t1", "ai_plan": {"answers": {"pep_names": "ozempic"},
                                                                         "peptide_profile": {}, "started_on": "2026-10-19"}},
        days=[{"date": "2026-10-19", "tasks": [{"title": "Semaglutide dose", "description": "MTC", "why": "w",
                                               "catalog_id": "peptidemax.custom_dose_semaglutide", "status": "done",
                                               "time": "07:30"}]}])
    ap.scrub_peptide_details(sched)
    blob = repr(sched.days) + repr(sched.schedule_context)
    assert "emaglutide" not in blob and "ozempic" not in blob and "MTC" not in blob
    assert sched.days[0]["tasks"][0]["status"] == "done" and sched.schedule_context["thread_id"] == "t1"
    other = SimpleNamespace(maxx_id="sleepmax", schedule_context={"ai_plan": {"answers": {"a": 1}}}, days=[])
    ap.scrub_peptide_details(other)
    assert other.schedule_context["ai_plan"]["answers"] == {"a": 1}


def test_nothing_remindable_skips_follow_up_supply_and_label_match():
    s = {**BASE, "pep_names": "hgh", "pep_prescriber": "A peptide, wellness or med spa clinic",
         "pep_source": "A compounding pharmacy, my name on the label", "pep_form": "Powder I mix"}
    _, keys = walk(s)
    assert not {"pep_monitoring", "pep_supply", "pep_confirm"} & set(keys)
    _, keys = walk(glp1(**{"pep_screen_glp1": "Thyroid cancer (MTC) or MEN 2, me or family",
                           "pep_aware": "No, or I'm not sure"}))
    assert "pep_aware" in keys and "pep_confirm" not in keys
