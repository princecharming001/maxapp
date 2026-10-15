"""Deep check of the program setup quizzes and plans, through the real chat path.

For every program, two people with opposite answers set it up on a LOCAL
backend (scheduler off); then checks: every quiz question was asked, the plan
has 3-4 habits (2 if the day budget can't hold more), habits they already do
are left out, the two plans differ, and each habit's steps name their
specifics. Prints both plans side by side for a human read.

    RUN_SCHEDULER=false ../.venv/bin/python scripts/qa_program_depth.py [--only sleepmax,trainmax] [--out depth.json]
"""
from __future__ import annotations

import argparse
import asyncio
import json
import re
import sys
import time

sys.path.insert(0, ".")
sys.path.insert(0, "scripts")
from qa_personas import LABELS, new_account, onboarding  # noqa: E402

# per program: two people, as {fact_key: option substring to tap}
PEOPLE = {
    "sleepmax": [
        {"sleep_main_issue": "Falling asleep", "caffeine_last_time": "After 3", "evening_screens": "Phone",
         "drinks_alcohol": "3+", "already_doing": "Same wake time"},
        {"sleep_main_issue": "Waking up tired", "caffeine_last_time": "Before noon", "evening_screens": "Reading",
         "drinks_alcohol": "Rarely", "already_doing": "None"},
    ],
    "energymax": [
        {"slump_time": "After lunch", "caffeine_pattern": "4+", "first_meal_style": "Coffee only",
         "can_walk_after_lunch": "Yes", "sitting_hours": "Most", "already_doing": "Water soon"},
        {"slump_time": "Mornings", "caffeine_pattern": "None", "first_meal_style": "Real breakfast",
         "can_walk_after_lunch": "Not really", "sitting_hours": "on my feet", "already_doing": "None"},
    ],
    "focusmax": [
        {"peak_focus_time": "Early morning", "calendar_control": "A lot", "main_distraction": "My phone",
         "work_type": "Deep solo", "can_lie_down": "Yes, at work", "already_doing": "None"},
        {"peak_focus_time": "Afternoon", "calendar_control": "Very little", "main_distraction": "Email",
         "work_type": "calls", "can_lie_down": "No", "already_doing": "Plan my top"},
    ],
    "calmmax": [
        {"stress_peak_time": "Mornings", "breathing_caution": "No", "calm_style": "Moving",
         "social_contact": "Rarely", "writing_ok": "Yes", "already_doing": "None"},
        {"stress_peak_time": "Evenings", "breathing_caution": "Yes", "calm_style": "Talking",
         "social_contact": "Most days", "writing_ok": "No thanks", "already_doing": "Walks outside"},
    ],
    "trainmax": [
        {"fitness_goal": "Build muscle", "training_experience": "Training regularly", "equipment_access": "Full gym",
         "health_flags": "None", "sessions_per_week": "4", "current_steps": "7,000", "already_doing": "Strength"},
        {"fitness_goal": "Move without aches", "training_experience": "New or returning",
         "equipment_access": "Just bodyweight", "health_flags": "pain or injury", "sessions_per_week": "2",
         "current_steps": "Under 4,000", "already_doing": "None"},
    ],
    "longevitymax": [
        {"age_band": "60 or older", "activity_baseline": "Mostly sitting", "health_flags": "Yes",
         "last_checkup": "Longer", "social_frequency": "Less than", "already_doing": "None"},
        {"age_band": "30–49", "activity_baseline": "3+", "health_flags": "No", "last_checkup": "Within",
         "social_frequency": "Most days", "already_doing": "Walking most days"},
    ],
    "suppmax": [
        {"supp_goals": "Sleep", "supp_safety_flags": "None", "supp_medications": "None", "age_band": "30–49",
         "sex": "Male", "supp_diet": "Rarely eat fish", "supp_current_stack": "Nothing"},
        {"supp_goals": "Energy", "supp_safety_flags": "Pregnant", "supp_medications": "Antidepressants",
         "age_band": "30–49", "sex": "Female", "supp_diet": "Vegan", "supp_current_stack": "Multivitamin"},
    ],
}
OB = onboarding(wake="06:30", bed="22:30", minutes=45, level="medium", goals=["sleep", "energy"],
                work=("09:00", "17:00"), commute=20, meals=("07:15", "12:30", "19:00"), workout="18:00")


def _questions(mid: str) -> dict[str, str]:
    """question text → fact key, from the quiz definitions."""
    from services import program_quiz, supp_intake
    qs = supp_intake.QUIZ if mid == "suppmax" else program_quiz.quiz_for(mid)
    return {q["question"].lower(): q["fact_key"] for q in qs}


def _choose(options: list[str], want: str) -> str:
    hits = [o for o in options or [] if want.lower() in o.lower()]
    return hits[0] if hits else (options[0] if options else want)


async def run_one(mid: str, person: dict) -> dict:
    api = await new_account(OB)
    out = {"program": mid, "asked": [], "answers": {}, "ok": False}
    t0 = time.monotonic()
    r = await api.post("/chat/message", {"message": f"I want to start my {LABELS[mid]} plan.",
                                          "init_context": mid, "chat_intent": "start_schedule"})
    conv = r.get("conversation_id")
    for _ in range(10):
        if "plan" in [b.get("type") for b in r.get("visual_blocks") or []]:
            out["ok"] = True
            break
        q = r.get("response") or ""
        opts = r.get("choices") or []
        key = next((k for text, k in _questions(mid).items() if text in q.lower()), None)
        ans = _choose(opts, person.get(key, "")) if key else (opts[0] if opts else "not sure")
        out["asked"].append({"q": q.split("\n")[-1][:90], "options": opts, "a": ans, "key": key})
        out["answers"][key or f"?{len(out['asked'])}"] = ans
        r = await api.post("/chat/message", {"message": ans, "conversation_id": conv})
    out["secs"] = round(time.monotonic() - t0, 1)
    full = await api.get("/schedules/active/full")
    scheds = full if isinstance(full, list) else (full.get("schedules") or [])
    plan = next(((s.get("schedule_context") or {}).get("ai_plan") for s in scheds if s.get("maxx_id") == mid), None)
    if plan is None:
        from uuid import UUID
        from sqlalchemy import select
        from db.sqlalchemy import AsyncSessionLocal
        from models.sqlalchemy_models import UserSchedule
        async with AsyncSessionLocal() as db:
            row = (await db.execute(select(UserSchedule).where(
                (UserSchedule.user_id == UUID(api.user_id)) & (UserSchedule.maxx_id == mid)
                & (UserSchedule.is_active.is_(True))))).scalars().first()
            plan = ((row.schedule_context or {}).get("ai_plan") if row else None) or {}
    out["habits"] = [{k: h.get(k) for k in ("habit_id", "title", "minutes", "time", "days", "how", "why")}
                     for h in plan.get("habits") or []]
    out["summary"] = plan.get("summary")
    return out


def checks(mid: str, a: dict, b: dict) -> list[str]:
    from services import program_quiz
    problems = []
    for who, r in (("A", a), ("B", b)):
        if not r["ok"]:
            problems.append(f"{who}: no plan card")
        n = len(r["habits"])
        lo = 1 if mid == "suppmax" else 2
        if not (lo <= n <= 6):
            problems.append(f"{who}: {n} habits")
        if mid != "suppmax" and n < 3:
            problems.append(f"{who}: only {n} habits (default should be 3-4)")
        skip = program_quiz.skip_ids(mid, r["answers"])
        if skip & {h["habit_id"] for h in r["habits"]}:
            problems.append(f"{who}: scheduled what they already do: {skip & {h['habit_id'] for h in r['habits']}}")
        want = len([q for q in program_quiz.quiz_for(mid)]) if mid in program_quiz.QUIZ_PROGRAMS else 0
        if want and len(r["asked"]) < want - 1:      # the weekend question is skipped on purpose
            problems.append(f"{who}: asked {len(r['asked'])} of ~{want}")
        if any(not (h.get("how") or "").strip() for h in r["habits"]):
            problems.append(f"{who}: a habit has no steps")
    ida = sorted(h["habit_id"] for h in a["habits"])
    idb = sorted(h["habit_id"] for h in b["habits"])
    hows_same = [h["habit_id"] for h in a["habits"] for g in b["habits"]
                 if h["habit_id"] == g["habit_id"] and (h.get("how") or "") == (g.get("how") or "")]
    if ida == idb and hows_same:
        problems.append(f"A and B got the same plan ({ida})")
    return problems


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="")
    ap.add_argument("--out", default="")
    args = ap.parse_args()
    mids = [m for m in PEOPLE if not args.only or m in args.only.split(",")]
    report = {}
    for mid in mids:
        a, b = await asyncio.gather(run_one(mid, PEOPLE[mid][0]), run_one(mid, PEOPLE[mid][1]))
        probs = checks(mid, a, b)
        report[mid] = {"A": a, "B": b, "problems": probs}
        print(f"\n===== {mid}  {'OK' if not probs else 'PROBLEMS: ' + '; '.join(probs)}")
        for who, r in (("A", a), ("B", b)):
            print(f"  -- {who} ({r['secs']}s) asked {len(r['asked'])}: " + " / ".join(x["a"] for x in r["asked"]))
            for h in r["habits"]:
                print(f"     {h['time']} {h['title']} [{h['minutes']}m {len(h['days'] or [])}d] :: {(h['how'] or '')[:170]}")
    if args.out:
        json.dump(report, open(args.out, "w"), indent=1, default=str)
    bad = [m for m, r in report.items() if r["problems"]]
    print(f"\nSUMMARY: {len(report) - len(bad)}/{len(report)} programs clean" + (f"; problems in {bad}" if bad else ""))


asyncio.run(main())
