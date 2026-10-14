"""QA personas: run real onboarding → real Claude intake/planning → stored plans
for throwaway accounts on a LOCAL backend (scheduler off), then check every
invariant in qa_checks against what each persona actually told onboarding.

    RUN_SCHEDULER=false ../.venv/bin/python scripts/qa_personas.py --out qa.json [--only p1,p2] [--flows basic,redo,...]

Accounts are minted with the dev-only faux-signup-fresh + test-activate (the
DEV drawer's Onb → paid path). Only rows of accounts created here are touched.
"""
from __future__ import annotations

import asyncio
import base64
import json
import re
import sys
import time
from datetime import date, datetime, timedelta

import httpx

sys.path.insert(0, ".")
sys.path.insert(0, "scripts")
from qa_checks import SUMMARY_KEYS, check_stack  # noqa: E402

BASE = "http://localhost:8002/api"


def _w(start: int, mins: int) -> list[str]:
    return [f"{start // 60 % 24:02d}:{start % 60:02d}", f"{(start + mins) // 60 % 24:02d}:{(start + mins) % 60:02d}"]


def onboarding(*, wake, bed, minutes, level, goals, work=None, commute=0, location="office",
               meals=("07:30", "12:30", "19:00"), workout="18:00", weekend_shift=False, weekly_timings=None):
    wh, wm = map(int, wake.split(":"))
    bh, bm = map(int, bed.split(":"))
    wake_m, bed_m = wh * 60 + wm, bh * 60 + bm
    lv = {"low": ("chill", "light"), "medium": ("standard", "moderate"), "high": ("sweatmode", "intense")}[level]
    ob = {
        "goals": goals, "priority_order": goals, "daily_minutes": minutes, "biohack_level": level,
        "intensity_preference": lv[0], "effort_level": lv[1],
        "wake_time": wake, "get_ready_window": _w(wake_m, 30), "get_ready_time": wake, "get_ready_minutes": 30,
        "wind_down_window": _w(bed_m - 45, 45), "sleep_window": _w(bed_m - 45, 45), "sleep_time": bed,
        "obligations": ([{"label": "Work", "start": work[0], "end": work[1], "days": "weekdays"}] if work else []),
        "work_location": location if work else "home", "commute_minutes": commute,
        "timezone": "America/Los_Angeles",
        "breakfast_time": meals[0], "lunch_time": meals[1], "dinner_time": meals[2], "meals_skipped": [],
        "shower_time": "morning", "workout_time": workout, "weekend_shift": weekend_shift, "completed": True,
    }
    if weekly_timings:
        ob["weekly_timings"] = weekly_timings
    return ob


PERSONAS = {
    "p1_early": dict(
        label="Early riser, 5 min/day, one goal, desk job, no commute",
        ob=onboarding(wake="05:30", bed="21:30", minutes=5, level="low", goals=["focus"],
                      work=("07:30", "16:00"), commute=0, meals=("06:00", "12:00", "17:30"), workout="06:15"),
        stack=["suppmax", "focusmax"],          # Suppmax FIRST, then a program
    ),
    "p2_owl": dict(
        label="Night owl (bed 1:30, wake 9:30), 60 min/day, two goals, long commute",
        ob=onboarding(wake="09:30", bed="01:30", minutes=60, level="high", goals=["focus", "training"],
                      work=("11:00", "19:00"), commute=60, meals=("10:00", "14:30", "20:30"), workout="21:30",
                      weekend_shift=True),
        stack=["focusmax", "trainmax"],
    ),
    "p3_shift": dict(
        label="Shift-style: weekend wake 3h later, odd meals",
        ob=onboarding(wake="06:00", bed="22:30", minutes=25, level="medium", goals=["energy", "sleep"],
                      work=("07:00", "15:00"), commute=20, meals=("09:30", "15:30", "21:00"), workout="16:30",
                      weekly_timings={"saturday": {"wake_time": "09:00", "sleep_time": "01:00"},
                                      "sunday": {"wake_time": "09:00", "sleep_time": "01:00"}}),
        stack=["energymax", "sleepmax"],
    ),
    "p4_parent": dict(
        label="Parent, 6:30 wake, hard 9 pm bed, 15 min/day",
        ob=onboarding(wake="06:30", bed="21:00", minutes=15, level="low", goals=["stress", "sleep"],
                      work=("09:00", "17:00"), commute=20, meals=("07:00", "12:30", "18:00"), workout="18:30"),
        stack=["calmmax", "sleepmax"],
    ),
    "p5_athlete": dict(
        label="Athlete: 7 pm workouts, high budget, Fitmax + Longevitymax + Suppmax",
        ob=onboarding(wake="06:30", bed="23:00", minutes=60, level="high", goals=["training", "longevity"],
                      work=("09:00", "17:00"), commute=0, location="home", meals=("07:30", "12:30", "20:00"),
                      workout="19:00"),
        stack=["trainmax", "longevitymax", "suppmax"],   # Suppmax LAST (reverse order)
    ),
    "p6_vague": dict(
        label="Short/unclear intake answers",
        ob=onboarding(wake="07:30", bed="23:30", minutes=25, level="medium", goals=["skin_hair", "energy"],
                      work=("10:00", "18:00"), commute=30, meals=("08:00", "13:30", "19:30"), workout="18:30"),
        stack=["skinhairmax", "energymax"],
        vague=True,
    ),
}

VAGUE = ["idk", "kinda",
         "honestly my days are all over the place. some days i'm up at 6 and some days 9, i have two kids, "
         "i try to get to the gym but it doesn't always happen and i drink coffee most of the day"]

LABELS = {"sleepmax": "Sleepmax", "energymax": "Energymax", "focusmax": "Focusmax", "calmmax": "Calmmax",
          "trainmax": "Fitmax", "skinhairmax": "Skin & Hair", "longevitymax": "Longevitymax",
          "suppmax": "Suppmax", "peptidemax": "Peptidemax"}


class Api:
    def __init__(self, token: str):
        self.token = token
        self.c = httpx.AsyncClient(base_url=BASE, timeout=180, headers={"Authorization": f"Bearer {token}"})

    @property
    def user_id(self) -> str:
        p = self.token.split(".")[1]
        return json.loads(base64.urlsafe_b64decode(p + "=" * (-len(p) % 4)))["sub"]

    async def post(self, path, body=None):
        r = await self.c.post(path, json=body or {})
        r.raise_for_status()
        return r.json()

    async def put(self, path, body=None):
        r = await self.c.put(path, json=body or {})
        r.raise_for_status()
        return r.json()

    async def get(self, path, **params):
        r = await self.c.get(path, params=params)
        r.raise_for_status()
        return r.json()


async def new_account(ob: dict) -> Api:
    async with httpx.AsyncClient(base_url=BASE, timeout=60) as c:
        r = await c.post("/auth/faux-signup-fresh")
        r.raise_for_status()
        api = Api(r.json()["access_token"])
    await api.post("/payments/test-activate", {"tier": "premium"})
    await api.post("/users/onboarding", ob)
    return api


def pick_answer(persona: dict, mid: str, q: str, choices: list, multi: bool, idx: int, sup: str | None) -> str:
    ql = (q or "").lower()
    if mid == "peptidemax":
        if re.search(r"who (set|prescrib)|supervis|clinician|prescrib|where.*(get|from)", ql) and choices and sup:
            m = [c for c in choices if sup.lower()[:12] in c.lower()]
            return m[0] if m else sup
        if re.search(r"which|what peptide|protocol|schedule|how often", ql):
            return ("i'm only thinking about it, haven't started anything" if sup and "consider" in sup.lower()
                    else "semaglutide, once a week on sunday mornings, the dose my doctor set")
    if persona.get("vague"):
        return VAGUE[idx % len(VAGUE)]
    opts = [c for c in (choices or []) if "something else" not in c.lower()]
    if not opts:
        return "not sure"
    none_like = [c for c in opts if re.match(r"^(none|no\b|nothing|not really|rarely)", c.strip().lower())]
    if none_like and re.search(r"apply|pregnan|kidney|medication|meds|take any|already take|condition|drink", ql):
        return none_like[0]
    return opts[0]


async def start_program(api: Api, persona: dict, mid: str, *, sup: str | None = None, prefetch=True) -> dict:
    out = {"program": mid, "questions": [], "ok": False}
    if prefetch:
        try:
            await api.post(f"/maxes/{mid}/prefetch-intake")
        except Exception:
            pass
        await asyncio.sleep(7)      # a person reading the program page
    t0 = time.monotonic()
    r = await api.post("/chat/message", {"message": f"I want to start my {LABELS[mid]} plan.",
                                          "init_context": mid, "chat_intent": "start_schedule"})
    out["first_reply_secs"] = round(time.monotonic() - t0, 1)
    conv = r.get("conversation_id")
    out["conversation_id"] = conv
    for i in range(7):
        blocks = [b.get("type") for b in r.get("visual_blocks") or []]
        if "plan" in blocks:
            out["ok"] = True
            out["plan_reply"] = r.get("response")
            break
        out["questions"].append({"q": r.get("response"), "choices": r.get("choices"), "multi": r.get("multi_choice")})
        if r.get("conversation_id") and r.get("conversation_id") != conv:
            out.setdefault("thread_changes", []).append(r.get("conversation_id"))
        ans = pick_answer(persona, mid, r.get("response") or "", r.get("choices") or [], bool(r.get("multi_choice")), i, sup)
        out["questions"][-1]["a"] = ans
        r = await api.post("/chat/message", {"message": ans, "conversation_id": conv})
    out["total_secs"] = round(time.monotonic() - t0, 1)
    out["n_questions"] = len(out["questions"])
    return out


# ── in-process DB reads (own throwaway accounts only) ───────────────────────

async def db_state(user_id: str) -> dict:
    from sqlalchemy import select
    from uuid import UUID
    from db.sqlalchemy import AsyncSessionLocal
    from models.sqlalchemy_models import User, UserSchedule
    import services.ai_programs as ap
    async with AsyncSessionLocal() as db:
        user = await db.get(User, UUID(user_id))
        rows = (await db.execute(select(UserSchedule).where(
            (UserSchedule.user_id == UUID(user_id)) & (UserSchedule.is_active.is_(True))))).scalars().all()
        sched = {r.maxx_id: r for r in rows if ap.is_ai_program(r.maxx_id)}
        return {
            "truth": dict(user.onboarding or {}),
            "rows": {m: list(r.days or []) for m, r in sched.items()},
            "templates": {m: (r.schedule_context or {}).get("ai_plan") or {} for m, r in sched.items()},
            "ids": {m: str(r.id) for m, r in sched.items()},
        }


def lib_anchors() -> dict:
    import services.ai_programs as ap
    return {m: {h.id: h.anchor for h in ap.get_program_doc(m).habits} for m in ap.AI_PROGRAMS}


def lib_titles() -> dict:
    import services.ai_programs as ap
    return {m: {h.id: h.title for h in ap.get_program_doc(m).habits} for m in ap.AI_PROGRAMS}


def local_today(truth: dict) -> date:
    from services.schedule_streak import local_today_date
    return local_today_date(truth)


async def check_user(api: Api) -> dict:
    st = await db_state(api.user_id)
    res = check_stack(st["truth"], st["rows"], st["templates"], lib_anchors(), start=local_today(st["truth"]),
                      lib_titles=lib_titles())
    return {"violations": res, "programs": sorted(st["rows"]),
            "summaries": {m: t.get("summary") for m, t in st["templates"].items()},
            "fit_notes": {m: t.get("fit_notes") for m, t in st["templates"].items() if t.get("fit_notes")},
            "templates": {m: [{k: h.get(k) for k in ("habit_id", "title", "time", "weekend_time", "minutes", "days",
                                                  "linked_to", "keep")}
                              for h in t.get("habits") or []] for m, t in st["templates"].items()}}


def snapshot(rows: dict, today: date) -> dict:
    out = {}
    for mid, days in rows.items():
        for d in days:
            if str(d.get("date", "")) >= today.isoformat():
                for t in d.get("tasks") or []:
                    out[(mid, d["date"], t.get("catalog_id"))] = (t.get("time"), t.get("status"))
    return out


async def drift_check(api: Api) -> list[str]:
    """#9: regenerate (= what edit-lifestyle, horizon and redo run) must not
    move anything that nothing asked to move."""
    from uuid import UUID
    from db.sqlalchemy import AsyncSessionLocal
    from services.schedule_runtime import regenerate_active_schedules
    st = await db_state(api.user_id)
    today = local_today(st["truth"])
    before = snapshot(st["rows"], today)
    async with AsyncSessionLocal() as db:
        await regenerate_active_schedules(user_id=api.user_id, db=db, reason="qa_drift")
        await db.commit()
    after = snapshot((await db_state(api.user_id))["rows"], today)
    last = max((k[1] for k in before), default="")
    diffs = [f"{k}: {before.get(k)} -> {after.get(k)}" for k in sorted(set(before) | set(after), key=str)
             if before.get(k) != after.get(k) and k[1] <= last]
    return diffs[:40] + ([f"... {len(diffs) - 40} more"] if len(diffs) > 40 else [])


async def horizon_check(api: Api) -> list[str]:
    """Trim this throwaway account's runway to 4 days, let the horizon extend
    it, and require the overlapping days to keep their times."""
    from uuid import UUID
    from sqlalchemy.orm.attributes import flag_modified
    from db.sqlalchemy import AsyncSessionLocal
    from models.sqlalchemy_models import User, UserSchedule
    from services.horizon import ensure_plan_horizon
    from sqlalchemy import select
    st = await db_state(api.user_id)
    today = local_today(st["truth"])
    before = snapshot(st["rows"], today)
    async with AsyncSessionLocal() as db:
        rows = (await db.execute(select(UserSchedule).where(
            (UserSchedule.user_id == UUID(api.user_id)) & (UserSchedule.is_active.is_(True))))).scalars().all()
        for r in rows:
            r.days = [d for d in (r.days or []) if str(d.get("date", "")) < (today + timedelta(days=4)).isoformat()]
            flag_modified(r, "days")
        await db.commit()
        user = await db.get(User, UUID(api.user_id))
        res = await ensure_plan_horizon(user, db)
        await db.commit()
    after_rows = (await db_state(api.user_id))["rows"]
    after = snapshot(after_rows, today)
    out = []
    for k, v in before.items():
        if k in after and after[k] != v:
            out.append(f"{k}: {v} -> {after[k]}")
    n_days = {m: len([d for d in days if str(d.get('date', '')) >= today.isoformat()]) for m, days in after_rows.items()}
    if any(n < 14 for n in n_days.values()):
        out.append(f"runway not restored: {n_days} ({res})")
    return out[:40]


# ── flows ────────────────────────────────────────────────────────────────────

async def flow_basic(name: str, persona: dict, rep: dict) -> Api:
    api = await new_account(persona["ob"])
    rep["user_id"] = api.user_id
    rep["starts"] = []
    for mid in persona["stack"]:
        rep["starts"].append(await start_program(api, persona, mid))
    rep["check"] = await check_user(api)
    rep["drift"] = await drift_check(api)
    return api


async def flow_redo(api: Api, persona: dict, rep: dict) -> None:
    """Redo via chat on the first non-supp program: lighter / later / swap / exact time."""
    mid = next(m for m in persona["stack"] if m not in ("suppmax", "peptidemax"))
    start = next(s for s in rep["starts"] if s["program"] == mid)
    conv = start["conversation_id"]
    st = await db_state(api.user_id)
    # mark today's first task of this program done, so a redo must keep it
    today = local_today(st["truth"]).isoformat()
    done = None
    for d in st["rows"].get(mid, []):
        if d.get("date") == today and d.get("tasks"):
            done = d["tasks"][0]
            await api.put(f"/schedules/{st['ids'][mid]}/tasks/{done['task_id']}/complete")
            break
    out = []
    tmpl0 = st["templates"][mid]
    prev = tmpl0

    def title_of(t, i):
        hs = (t or {}).get("habits") or [{}]
        return str(hs[i].get("title") or "that habit").lower()
    for ask_fn in (lambda t: "make it lighter", lambda t: "move things later",
                   lambda t: f"swap {title_of(t, 0)} for something else",
                   lambda t: f"move my {title_of(t, -1)} to 7:15pm"):
        ask = ask_fn(prev)
        r = await api.post("/chat/message", {"message": ask, "conversation_id": conv})
        st2 = await db_state(api.user_id)
        new = st2["templates"].get(mid) or {}
        a = {h["habit_id"]: h for h in prev.get("habits") or []}
        b = {h["habit_id"]: h for h in new.get("habits") or []}
        out.append({
            "ask": ask, "thread_kept": r.get("conversation_id") == conv,
            "plan_card": "plan" in [x.get("type") for x in r.get("visual_blocks") or []],
            "added": sorted(set(b) - set(a)), "removed": sorted(set(a) - set(b)),
            "moved": sorted(h for h in set(a) & set(b) if a[h].get("time") != b[h].get("time")),
            "minutes": [sum(int(h.get("minutes") or 0) * len(h.get("days") or []) for h in x.get("habits") or []) / 7
                        for x in (prev, new)],
            "reply": (r.get("response") or "")[:240],
        })
        prev = new
    if done:
        st3 = await db_state(api.user_id)
        kept = any(t.get("status") == "completed" and t.get("catalog_id") == done.get("catalog_id")
                   for d in st3["rows"].get(mid, []) if d.get("date") == today for t in d.get("tasks") or [])
        out.append({"done_task_kept_after_redos": kept, "task": done.get("catalog_id")})
    rep["redo"] = out
    rep["check_after_redo"] = await check_user(api)


async def flow_stack_all(api: Api, persona: dict, rep: dict) -> None:
    """Stack every program, check, then stop/re-add for Suppmax sync."""
    import services.ai_programs as ap
    have = set((await db_state(api.user_id))["rows"])
    rep["stack_all"] = []
    for mid in ap.AI_PROGRAMS:
        if mid not in have:
            rep["stack_all"].append(await start_program(api, persona, mid, sup="A licensed clinician prescribes it"))
    await asyncio.sleep(3)
    rep["check_all9"] = await check_user(api)
    rep["drift_all9"] = await drift_check(api)
    # Suppmax sync: stop each synced program one at a time, then re-add it.
    st = await db_state(api.user_id)
    supp = lambda s: sorted((h["habit_id"], tuple(h.get("linked_to") or []), bool(h.get("keep")))  # noqa: E731
                            for h in (s["templates"].get("suppmax") or {}).get("habits") or [])
    log = [{"step": "all9", "supp": supp(st)}]
    async def settled(prev):
        # the stop/start kicks a background stack refit + Suppmax sync: poll for it
        for _ in range(20):
            await asyncio.sleep(3)
            cur = await db_state(api.user_id)
            if supp(cur) != prev:
                await asyncio.sleep(3)
                return await db_state(api.user_id)
        return cur
    for mid in ("sleepmax", "calmmax", "peptidemax"):
        if mid not in st["ids"]:
            continue
        before = supp(st)
        await api.post(f"/schedules/{st['ids'][mid]}/stop")
        st = await settled(before) if mid != "peptidemax" else (await asyncio.sleep(10) or await db_state(api.user_id))
        log.append({"step": f"stop {mid}", "supp": supp(st)})
    # re-add sleepmax → melatonin should come back
    before = supp(st)
    res = await start_program(api, persona, "sleepmax", prefetch=False)
    st = await settled(before)
    log.append({"step": "re-add sleepmax", "supp": supp(st), "plan_reply": (res.get("plan_reply") or "")[:200]})
    rep["supp_sync"] = log


async def flow_peptide(api: Api, persona: dict, rep: dict) -> None:
    out = []
    for sup in ("A licensed clinician prescribes it", "A clinic or telehealth oversees it",
                "I'm sourcing it myself", "I'm only considering peptides"):
        st = await db_state(api.user_id)
        if "peptidemax" in st["ids"]:
            await api.post(f"/schedules/{st['ids']['peptidemax']}/stop")
            await asyncio.sleep(2)
        supp_before = (st["templates"].get("suppmax") or {}).get("habits")
        res = await start_program(api, persona, "peptidemax", sup=sup, prefetch=False)
        st = await db_state(api.user_id)
        tmpl = st["templates"].get("peptidemax") or {}
        text = json.dumps(tmpl.get("habits") or []).lower() + " " + (res.get("plan_reply") or "").lower()
        out.append({
            "supervision": sup, "ok": res["ok"], "questions": [q["q"][:120] for q in res["questions"]],
            "habits": [(h["habit_id"], h["title"]) for h in tmpl.get("habits") or []],
            "dose_numbers": re.findall(r"\b\d+(?:\.\d+)?\s?(?:mg|mcg|units?|iu|ml)\b", text),
            "sourcing": re.findall(r"\b(?:buy|purchase|vendor|supplier|research[- ]chem\w*)\b", text),
            "clinician_task": any(re.search(r"clinician|clinic|prescriber|doctor|telehealth|provider",
                                            (h.get("title") or "") + (h.get("how") or ""), re.I)
                                  for h in tmpl.get("habits") or []),
            # Peptidemax never syncs supplements: same picks before and after (times may refit)
            "supp_unchanged": sorted(h.get("habit_id") for h in supp_before or []) ==
                              sorted(h.get("habit_id") for h in (st["templates"].get("suppmax") or {}).get("habits") or []),
            "reply": (res.get("plan_reply") or "")[:300],
        })
    rep["peptide"] = out


async def flow_rewake(api: Api, persona: dict, rep: dict, *, wake: str, bed: str) -> None:
    """#7: the person changes wake/bed (Edit lifestyle re-saves onboarding)."""
    ob = dict(persona["ob"])
    ob.update(onboarding(wake=wake, bed=bed, minutes=ob["daily_minutes"], level=ob["biohack_level"],
                         goals=ob["goals"], work=(ob["obligations"][0]["start"], ob["obligations"][0]["end"])
                         if ob["obligations"] else None, commute=ob["commute_minutes"],
                         meals=(ob["breakfast_time"], ob["lunch_time"], ob["dinner_time"]), workout=ob["workout_time"],
                         weekend_shift=ob["weekend_shift"]))
    await api.post("/users/onboarding", ob)
    await asyncio.sleep(2)
    rep["rewake"] = {"to": [wake, bed], "check": await check_user(api)}


async def flow_resume(api: Api, persona: dict, rep: dict) -> None:
    """#8: kill mid-intake → history must bring back the pending question + chips."""
    mid = "focusmax" if "focusmax" not in persona["stack"] else "calmmax"
    r = await api.post("/chat/message", {"message": f"I want to start my {LABELS[mid]} plan.",
                                          "init_context": mid, "chat_intent": "start_schedule"})
    conv = r.get("conversation_id")
    h = await api.get("/chat/history", conversation_id=conv, limit=80)
    pq = h.get("pendingQuestion") or h.get("pending_question")
    rep["resume"] = {"program": mid, "asked": (r.get("response") or "")[:160], "choices": r.get("choices"),
                     "restored": pq, "ok": bool(pq and pq.get("choices") == r.get("choices"))}


def summarize(rep: dict) -> dict:
    def s(check):
        v = (check or {}).get("violations") or {}
        return {k: len(v.get(k) or []) for k in SUMMARY_KEYS}
    return {k: s(rep.get(k)) for k in ("check", "check_after_redo", "check_all9") if rep.get(k)} | (
        {"rewake": s((rep.get("rewake") or {}).get("check"))} if rep.get("rewake") else {})


async def run_persona(name: str, flows: set[str]) -> dict:
    persona = PERSONAS[name]
    rep: dict = {"persona": name, "label": persona["label"]}
    try:
        api = await flow_basic(name, persona, rep)
        if "redo" in flows:
            await flow_redo(api, persona, rep)
        if "resume" in flows:
            await flow_resume(api, persona, rep)
        if "rewake" in flows and name in ("p2_owl", "p4_parent"):
            await flow_rewake(api, persona, rep, **({"wake": "07:00", "bed": "23:00"} if name == "p2_owl"
                                                   else {"wake": "05:45", "bed": "22:30"}))
        if "stack" in flows and name in ("p2_owl", "p4_parent", "p5_athlete"):
            await flow_stack_all(api, persona, rep)
        if "peptide" in flows and name == "p5_athlete":
            await flow_peptide(api, persona, rep)
        rep["summary"] = summarize(rep)
    except Exception as e:
        import traceback
        rep["error"] = f"{type(e).__name__}: {e}"
        rep["trace"] = traceback.format_exc()[-1500:]
    return rep


async def main() -> None:
    args = sys.argv[1:]
    out = args[args.index("--out") + 1] if "--out" in args else "qa.json"
    only = args[args.index("--only") + 1].split(",") if "--only" in args else list(PERSONAS)
    flows = set(args[args.index("--flows") + 1].split(",")) if "--flows" in args else {"basic"}
    reps = await asyncio.gather(*[run_persona(n, flows) for n in only])
    json.dump(reps, open(out, "w"), indent=1, default=str)
    for r in reps:
        print(r["persona"], "ERROR " + r["error"] if r.get("error") else json.dumps(r.get("summary")))


if __name__ == "__main__":
    asyncio.run(main())
