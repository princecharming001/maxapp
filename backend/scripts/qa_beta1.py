"""Beta-1 regression harness (BETA1_FIX_PLAN.md W9). Runs the reviewers'
scenarios through the real chat on the LOCAL backend and fails on any
violation. Run before every deploy:

    RUN_SCHEDULER=false ../.venv/bin/python scripts/qa_beta1.py [--only day_shape,coach,...]

Each scenario creates a fresh test account (faux signup + test activation).
"""
from __future__ import annotations

import argparse
import asyncio
import re
import sys

sys.path.insert(0, ".")
sys.path.insert(0, "scripts")
from qa_personas import new_account, onboarding  # noqa: E402

# the beta-1 biohacker: up at 7, 9-5 at an office with a 15 min commute, bed 00:15
OB = onboarding(wake="07:00", bed="00:15", minutes=25, level="medium", goals=["sleep", "energy"],
                work=("09:00", "17:00"), commute=15, meals=("08:00", "12:30", "19:30"), workout="18:00")

WORK_OK = {"post_meal_walk", "outdoor_lunch",   # their lunch break
           "movement_snack", "move_after_sitting", "micro_break", "stair_snack", "vigorous_burst",
           "move_before_focus", "hydrate_to_focus", "fresh_air_flush", "physiological_sigh", "box_breathing",
           "cold_face_reset", "caffeine_for_focus", "green_tea_afternoon", "lunch_balance", "protein_first_lunch"}


def _m(hm: str) -> int:
    h, m = (int(x) for x in str(hm)[:5].split(":"))
    return h * 60 + m


async def chat(api, msg: str, conv: str | None = None, **extra) -> dict:
    body = {"message": msg, **({"conversation_id": conv} if conv else {}), **extra}
    return await api.post("/chat/message", body)


async def start(api, maxx: str, answers: dict[str, str] | None = None) -> tuple[dict, str]:
    """Start a program and answer its quiz: an answer whose key appears in the
    question wins, else the first chip."""
    r = await chat(api, f"I want to start my {maxx} plan.", init_context=maxx, chat_intent="start_schedule")
    conv = r.get("conversation_id")
    for _ in range(14):
        if any((b or {}).get("type") == "plan" for b in r.get("visual_blocks") or []):
            break
        if not r.get("choices") and "?" not in (r.get("response") or ""):
            break
        q = (r.get("response") or "").lower()
        ans = next((v for k, v in (answers or {}).items() if k in q), None) or (r.get("choices") or ["not sure"])[0]
        r = await chat(api, ans, conv)
    return r, conv


async def plans(api) -> dict[str, dict]:
    full = await api.get("/schedules/active/full")
    out = {}
    for s in full.get("schedules") or []:
        plan = (s.get("schedule_context") or {}).get("ai_plan")
        if plan:
            out[s["maxx_id"]] = {"plan": plan, "days": s.get("days") or [], "id": s.get("id")}
    return out


def check(problems: list[str], ok: bool, msg: str) -> None:
    if not ok:
        problems.append(msg)


# ── scenarios ───────────────────────────────────────────────────────────────

async def day_shape(problems: list[str]) -> None:
    api = await new_account(OB)
    await start(api, "sleepmax", {"caffeine": "Before noon"})
    await start(api, "energymax")
    p = await plans(api)
    # F9: nothing that takes time lands inside work (9-5) unless it's a desk habit
    for mid, x in p.items():
        for h in x["plan"].get("habits") or []:
            if h.get("kind") == "rule" or h["habit_id"] in WORK_OK or not set(h.get("days") or []) & {"mon", "tue"}:
                continue
            t = _m(h.get("time") or "00:00")
            check(problems, not (9 * 60 <= t < 17 * 60), f"F9 {mid}.{h['habit_id']} at {h.get('time')} inside work")
    # F33: caffeine before noon -> no cutoff; caffeine asked once
    hids = {h["habit_id"] for x in p.values() for h in x["plan"].get("habits") or []}
    check(problems, "caffeine_cutoff" not in hids, "F33 caffeine cutoff for someone whose caffeine stops before noon")
    # F11: water before light
    times = {h["habit_id"]: h.get("time") for x in p.values() for h in x["plan"].get("habits") or []}
    if times.get("water_on_waking") and times.get("morning_light"):
        check(problems, times["water_on_waking"] < times["morning_light"], "F11 light before water")
    # F5/F8: chat wake change reaches every surface
    r = await chat(api, "I wake at 10am now.")
    check(problems, r.get("day_shape_changed") is True, "F5 day_shape_changed not set")
    me = await api.get("/users/me")
    ob = (me.get("onboarding") or me.get("data", {}).get("onboarding") or {})
    check(problems, str(ob.get("wake_time", "")).startswith("10:00"), f"F5 onboarding wake {ob.get('wake_time')}")
    ww = ob.get("wake_window") or []
    check(problems, not ww or str(ww[1]).startswith("10:"), f"F5 wake_window stale {ww}")
    today = await api.get("/planner/today")
    check(problems, "10:00" in str(today), "F8 planner/today doesn't show 10:00")
    p = await plans(api)
    for mid, x in p.items():
        ff = ((x["plan"].get("fit_for") or {}).get("weekday") or [""])[0]
        check(problems, ff == "10:00", f"F8 {mid} plan fitted to wake {ff}")
        for h in x["plan"].get("habits") or []:
            check(problems, not re.search(r"\b7(:00)?\s?am\b", h.get("how") or "", re.I),
                  f"F8 {mid}.{h['habit_id']} text still says 7am")
    r = await chat(api, "what time do i wake up?")
    check(problems, re.search(r"\b10\b|10:00", r.get("response") or "") is not None,
          f"F5 coach wake answer: {r.get('response', '')[:120]}")


async def coach(problems: list[str]) -> None:
    api = await new_account(OB)
    await start(api, "suppmax", {"help with": "Sleep", "apply to you": "None of these", "regularly": "None", "how old": "30–49",
                       "which fits you": "Male", "most weeks": "None of these", "already take": "Nothing yet"})
    before = await plans(api)
    for msg, must in (
        ("Swap my 6am workout to evenings.", r"don'?t see"),
        ("Remove the alcohol buffer.", r"don'?t see|not in"),
        ("I'm taking a 4-day trek with no phone signal. Pause my plan.", r"can'?t pause"),
        ("I have a flight tomorrow from Mumbai to London, adjust my plan.", r"can'?t plan around a flight"),
    ):
        r = await chat(api, msg)
        text = r.get("response") or ""
        check(problems, re.search(must, text, re.I) is not None, f"F3/F4/F22/F23 '{msg}' -> {text[:140]}")
        check(problems, not r.get("plan_changed"), f"'{msg}' changed the plan")
        check(problems, not re.search(r"plan paused|moved your workout", text, re.I), f"false claim: {text[:120]}")
    after = await plans(api)
    check(problems, {m: [h["habit_id"] for h in x["plan"]["habits"]] for m, x in before.items()}
          == {m: [h["habit_id"] for h in x["plan"]["habits"]] for m, x in after.items()},
          "plans changed after refusals")
    r = await chat(api, "I only have 15 minutes a day. Simplify everything.")
    check(problems, r.get("day_shape_changed") is True, "F24 simplify didn't set the daily minutes")
    r = await chat(api, "what is the plan for my supplements?")
    check(problems, not re.search(r"\bchamp\b|my boy|\bkid\b", r.get("response") or "", re.I), "nickname in reply")


async def supplements(problems: list[str]) -> None:
    api = await new_account(OB)
    await start(api, "suppmax", {"help with": "Energy", "apply to you": "None of these", "regularly": "None", "how old": "30–49",
                       "which fits you": "Male", "most weeks": "None of these", "already take": "Nothing yet"})
    r, conv = await start(api, "sleepmax")
    text = r.get("response") or ""
    chips = r.get("choices") or []
    has_offer = any(c.lower().startswith("yes, add") for c in chips)
    p = await plans(api)
    supp = {h["habit_id"] for h in p.get("suppmax", {}).get("plan", {}).get("habits") or []}
    check(problems, "melatonin" not in supp, "F1 melatonin added before any yes")
    check(problems, has_offer, f"F1 no supplement offer shown: {text[-200:]} {chips}")
    if has_offer:
        check(problems, "skip it if" in text.lower(), "F1 offer doesn't say who should skip it")
        r = await chat(api, "No thanks", conv)
        p = await plans(api)
        supp = {h["habit_id"] for h in p.get("suppmax", {}).get("plan", {}).get("habits") or []}
        check(problems, "melatonin" not in supp, "F1 melatonin added after a no")
    # F18: electrolytes never daily, never within 3 h of bed
    for h in p.get("suppmax", {}).get("plan", {}).get("habits") or []:
        if h["habit_id"] == "electrolytes":
            check(problems, len(h.get("days") or []) < 7, "F18 electrolytes daily")
            check(problems, _m(h["time"]) <= _m("21:15"), f"F18 electrolytes at {h['time']}")


async def planner_sheet(problems: list[str]) -> None:
    api = await new_account(OB)
    await start(api, "sleepmax")
    r = await api.post("/users/planner/chat", {"instruction": "move my wind-down routine 15 minutes earlier"})
    s = str(r.get("summary") or "")
    check(problems, "obligations" not in s.lower(), f"Avni#2 planner sheet: {s}")
    r = await api.post("/users/onboarding", {"get_ready_window": ["09:00", "09:30"]})
    check(problems, any(w.get("code") == "overlap" for w in r.get("warnings") or []),
          "F10 no overlap warning for get-ready inside work")


async def guides(problems: list[str]) -> None:
    api = await new_account(OB)
    await start(api, "sleepmax", {"caffeine": "After 3 pm"})
    p = await plans(api)
    x = p.get("sleepmax")
    if not x:
        problems.append("guides: no sleepmax plan")
        return
    seen = set()
    for d in x["days"][:2]:
        for t in d.get("tasks") or []:
            if t["catalog_id"] in seen:
                continue
            seen.add(t["catalog_id"])
            g = await api.get(f"/schedules/{x['id']}/tasks/{t['task_id']}/guide")
            text = " ".join(str(s.get("text") or s.get("instruction") or "") for s in g.get("steps") or [])
            for clock in re.findall(r"\b\d{1,2}(?::\d{2})?\s?(?:am|pm)\b", text, re.I):
                problems.append(f"F17/F19 {t['catalog_id']} guide names a clock time: {clock}")
            check(problems, not re.search(r"\b(buy|pick up|order|the night before|set (an|your) alarm)\b", text, re.I),
                  f"F20/F21 {t['catalog_id']} guide has setup/shopping: {text[:120]}")
            check(problems, int(g.get("duration_minutes") or t.get("duration_minutes") or 0)
                  == int(t.get("duration_minutes") or 0), f"F14 {t['catalog_id']} guide minutes differ")


async def biohacking(problems: list[str]) -> None:
    """Every planned habit pulls a body lever (no planner habits), the shared
    health answer rules levers out, and asking for a journal gets a no."""
    import services.ai_programs as ap
    from services import biohack_scope
    api = await new_account(OB)
    await start(api, "focusmax", {"caffeine": "1 cup", "sharp": "Start of my workday",
                                  "apply to you": "Raynaud's or cold sensitivity",
                                  "cold water": "Up for a cold finish to my shower", "recline": "No"})
    await start(api, "calmmax", {"hit you hardest": "During the workday", "cold water": "Not for me",
                                 "most weeks": "Neither", "caffeine affect": "No noticeable effect"})
    p = await plans(api)
    check(problems, {"focusmax", "calmmax"} <= set(p), f"plans missing: {sorted(p)}")
    for mid, x in p.items():
        lib = {h.id: h for h in (ap.get_program_doc(mid).habits if ap.get_program_doc(mid) else [])}
        for h in x["plan"].get("habits") or []:
            hid = h["habit_id"]
            check(problems, hid in lib or hid.startswith("custom_"), f"{mid}.{hid} not in the library")
            if hid in lib:
                check(problems, lib[hid].lever in biohack_scope.LEVERS, f"{mid}.{hid} has no lever")
            text = f"{h.get('title')} {h.get('how')} {h.get('why')}"
            check(problems, not biohack_scope.is_productivity(text),
                  f"{mid}.{hid} planner talk: {biohack_scope.productivity_terms(text)}")
        check(problems, not biohack_scope.is_productivity(x["plan"].get("summary") or ""),
              f"{mid} summary planner talk: {x['plan'].get('summary', '')[:120]}")
    hids = {h["habit_id"] for x in p.values() for h in x["plan"].get("habits") or []}
    for bad in ("cold_shower_finish", "cold_face_reset", "power_nap", "nsdr_break", "heat_session", "caffeine_ceiling"):
        check(problems, bad not in hids, f"{bad} planned despite their answers")
    before = {m: [h["habit_id"] for h in x["plan"]["habits"]] for m, x in p.items()}
    r = await chat(api, "can you add a gratitude journal every night?")
    check(problems, "biology" in (r.get("response") or "").lower(), f"journal ask: {r.get('response', '')[:140]}")
    r = await chat(api, "what should I do to focus better this afternoon?")
    check(problems, not biohack_scope.is_productivity(r.get("response") or ""),
          f"coach suggested planner habits: {r.get('response', '')[:200]}")
    after = {m: [h["habit_id"] for h in x["plan"]["habits"]] for m, x in (await plans(api)).items()}
    check(problems, before == after, "plans changed after the journal ask")


SCENARIOS = {"day_shape": day_shape, "coach": coach, "supplements": supplements,
             "planner_sheet": planner_sheet, "guides": guides, "biohacking": biohacking}


async def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="")
    args = ap.parse_args()
    names = [n for n in SCENARIOS if not args.only or n in args.only.split(",")]
    results: dict[str, list[str]] = {}

    async def run(n: str) -> None:
        probs: list[str] = []
        try:
            await SCENARIOS[n](probs)
        except Exception as e:  # noqa: BLE001
            probs.append(f"crashed: {type(e).__name__}: {e}")
        results[n] = probs
    await asyncio.gather(*[run(n) for n in names])
    bad = 0
    for n in names:
        print(f"\n== {n}: {'ok' if not results[n] else 'FAIL'}")
        for p in results[n]:
            print("   -", p)
        bad += len(results[n])
    print("\nSUMMARY:", "all clean" if not bad else f"{bad} problems")
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
