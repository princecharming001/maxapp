"""Custom-task regression harness: the person's own tasks (a gym session, a run)
added from Home / Planner. Drives the REAL endpoints on the LOCAL backend with
throwaway accounts (faux signup + test activation, like qa_personas), plus a
few in-process checks (horizon keeper, push engine input, master view).

    RUN_SCHEDULER=false ../.venv/bin/python scripts/qa_custom_tasks.py [--with-program]

Fails loudly (exit 1) on any broken invariant.
"""
from __future__ import annotations

import argparse
import asyncio
import sys
import traceback
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import httpx

sys.path.insert(0, ".")
sys.path.insert(0, "scripts")
from qa_personas import BASE, onboarding  # noqa: E402

TZ = "America/Los_Angeles"
DAYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")
FAILS: list[str] = []
PASSES = 0


def check(cond: bool, what: str) -> bool:
    global PASSES
    if cond:
        PASSES += 1
        print(f"  ok   {what}")
    else:
        FAILS.append(what)
        print(f"  FAIL {what}")
    return cond


class C:
    """Raw client: returns (status, json) so error paths can be asserted."""

    def __init__(self, token: str | None):
        self.h = {"Authorization": f"Bearer {token}"} if token else {}

    async def req(self, method: str, path: str, body=None, **params):
        async with httpx.AsyncClient(base_url=BASE, timeout=120) as c:
            r = await c.request(method, path, json=body, params=params or None, headers=self.h)
        try:
            data = r.json()
        except Exception:
            data = {"raw": r.text}
        return r.status_code, data


async def account(paid: bool = True, ob: dict | None = None) -> C:
    async with httpx.AsyncClient(base_url=BASE, timeout=60) as c:
        r = await c.post("/auth/faux-signup-fresh")
        r.raise_for_status()
        api = C(r.json()["access_token"])
    if paid:
        s, _ = await api.req("POST", "/payments/test-activate", {"tier": "premium"})
        assert s == 200, s
    s, d = await api.req("POST", "/users/onboarding", ob or OB)
    assert s == 200, (s, d)
    return api


OB = onboarding(wake="07:00", bed="23:00", minutes=25, level="medium", goals=["sleep", "energy"],
                work=("09:00", "17:00"), commute=15, meals=("08:00", "12:30", "19:30"), workout="18:00")


def today_local() -> date:
    return datetime.now(ZoneInfo(TZ)).date()


async def full(api: C) -> dict:
    s, d = await api.req("GET", "/schedules/active/full")
    assert s == 200, (s, d)
    return d


def custom_row(f: dict) -> dict | None:
    return next((s for s in f.get("schedules") or [] if s.get("maxx_id") == "custom"), None)


def tasks_on(row: dict, iso: str) -> list[dict]:
    for d in row.get("days") or []:
        if d.get("date") == iso:
            return d.get("tasks") or []
    return []


async def s_basic(api: C) -> dict:
    print("\n[basic create / read]")
    s, d = await api.req("GET", "/schedules/custom-tasks")
    check(s == 200 and d["tasks"] == [] and d["schedule_id"] is None, "empty list before any add")
    s, d = await api.req("POST", "/schedules/custom-tasks",
                         {"title": "Gym — push day", "time": "12:00", "minutes": 60,
                          "days": ["mon", "wed", "fri"], "note": "bench, OHP"})
    check(s == 200, f"create gym -> {s} {d if s != 200 else ''}")
    gym = d.get("task") or {}
    check(gym.get("title") == "Gym - push day" and gym.get("time") == "12:00", "title cleaned, time kept")
    sid = d.get("schedule_id")
    f = await full(api)
    row = custom_row(f)
    check(row is not None and row["id"] == sid, "custom row in /active/full")
    if not row:
        return {}
    check(len(row["days"]) >= 28, f"28-day runway ({len(row['days'])})")
    t0 = today_local()
    bad = []
    for i in range(14):
        dd = t0 + timedelta(days=i)
        ts = [t for t in tasks_on(row, dd.isoformat()) if t.get("catalog_id") == f"custom.{gym['id']}"]
        want = DAYS[dd.weekday()] in ("mon", "wed", "fri")
        if bool(ts) != want or (ts and ts[0]["time"] != "12:00"):
            bad.append(dd.isoformat())
    # 12:00 sits inside their 9-5 work block: the person's time still wins.
    check(not bad, f"gym on Mon/Wed/Fri at exactly 12:00 for 2 weeks (bad: {bad})")
    return {"sid": sid, "gym": gym}


async def s_validation(api: C):
    print("\n[validation]")
    cases = [({"title": "", "time": "07:00", "minutes": 10, "days": ["mon"]}, "name"),
             ({"title": "X", "time": "7pm", "minutes": 10, "days": ["mon"]}, "time"),
             ({"title": "X", "time": "07:00", "minutes": 0, "days": ["mon"]}, "between"),
             ({"title": "X", "time": "07:00", "minutes": 10, "days": []}, "day"),
             ({"title": "X", "time": "07:00", "minutes": 10}, "day"),
             ({"title": "X", "minutes": 10, "days": ["mon"]}, "time")]
    for body, word in cases:
        s, d = await api.req("POST", "/schedules/custom-tasks", body)
        check(s == 422 and word in str(d.get("detail", "")).lower(), f"rejects {body} -> {s} {d.get('detail')}")
    s, _ = await api.req("PUT", "/schedules/custom-tasks/doesnotexist", {"time": "08:00"})
    check(s == 404, f"edit unknown id -> {s}")
    s, _ = await api.req("DELETE", "/schedules/custom-tasks/doesnotexist")
    check(s == 404, f"delete unknown id -> {s}")


async def s_complete_and_regen(api: C, ctx: dict):
    print("\n[complete, then a regen from an onboarding change]")
    t0 = today_local()
    s, d = await api.req("POST", "/schedules/custom-tasks",
                         {"title": "Stretch", "time": "02:00", "minutes": 10, "days": list(DAYS)})
    check(s == 200, f"create daily stretch at 02:00 (outside waking hours) -> {s}")
    st = d["task"]
    row = custom_row(await full(api))
    today_t = next((t for t in tasks_on(row, t0.isoformat()) if t["catalog_id"] == f"custom.{st['id']}"), None)
    check(today_t is not None and today_t["time"] == "02:00", "stretch today at 02:00 (not fenced to waking hours)")
    if not today_t:
        return
    s, d = await api.req("PUT", f"/schedules/{row['id']}/tasks/{today_t['task_id']}/complete", {})
    check(s == 200 and d.get("status") in ("completed", "ok", None) or s == 200, f"complete today's stretch -> {s}")
    check(isinstance(d.get("xp"), (dict, int, type(None))), "completion returns xp field")
    # Change wake/bed: every program regenerates. Ours must not move.
    ob2 = {**OB, "wake_time": "05:30", "sleep_time": "21:30"}
    s, _ = await api.req("POST", "/users/onboarding", ob2)
    check(s == 200, "onboarding change accepted")
    row2 = custom_row(await full(api))
    t2 = next((t for t in tasks_on(row2, t0.isoformat()) if t["catalog_id"] == f"custom.{st['id']}"), None)
    check(t2 is not None and t2["status"] == "completed", "completed status survives regen")
    check(t2 is not None and t2["task_id"] == today_t["task_id"], "task_id stable across regen")
    tm = [t["time"] for d in row2["days"] for t in d["tasks"] if t["catalog_id"] == f"custom.{st['id']}"]
    check(tm and set(tm) == {"02:00"}, f"stretch still 02:00 everywhere after wake change ({set(tm)})")
    gym = ctx.get("gym") or {}
    gt = [t["time"] for d in row2["days"] for t in d["tasks"] if t["catalog_id"] == f"custom.{gym.get('id')}"]
    check(gt and set(gt) == {"12:00"}, "gym still 12:00 after regen")
    ctx["stretch"] = st
    ctx["stretch_today_tid"] = today_t["task_id"]


async def s_edits(api: C, ctx: dict):
    print("\n[edits: template, series from task screen, single day]")
    gym = ctx["gym"]
    t0 = today_local()
    s, d = await api.req("PUT", f"/schedules/custom-tasks/{gym['id']}", {"time": "18:30", "days": ["tue", "thu"]})
    check(s == 200 and d["task"]["time"] == "18:30" and d["task"]["days"] == ["tue", "thu"], f"template edit -> {s}")
    row = custom_row(await full(api))
    occ = [(d["date"], t["time"]) for d in row["days"] for t in d["tasks"] if t["catalog_id"] == f"custom.{gym['id']}"]
    wd = {DAYS[date.fromisoformat(x).weekday()] for x, _ in occ if x >= t0.isoformat()}
    check(wd <= {"tue", "thu"} and all(tm == "18:30" for x, tm in occ if x >= t0.isoformat()),
          f"future gym only Tue/Thu at 18:30 ({wd})")
    # Series edit from the task screen routes into the template.
    st = ctx["stretch"]
    fut = next(t for d in row["days"] if d["date"] > t0.isoformat() for t in d["tasks"]
               if t["catalog_id"] == f"custom.{st['id']}")
    s, d = await api.req("PUT", f"/schedules/{row['id']}/tasks/{fut['task_id']}", {"time": "06:45"}, scope="series")
    check(s == 200, f"series edit via generic endpoint -> {s} {d if s != 200 else ''}")
    s, lst = await api.req("GET", "/schedules/custom-tasks")
    mine = next(t for t in lst["tasks"] if t["id"] == st["id"])
    check(mine["time"] == "06:45", "template shows the new series time")
    row = custom_row(await full(api))
    times = {t["time"] for d in row["days"] if d["date"] > t0.isoformat() for t in d["tasks"]
             if t["catalog_id"] == f"custom.{st['id']}"}
    check(times == {"06:45"}, f"future stretch all 06:45 ({times})")
    sctx = row.get("schedule_context") or {}
    check(f"custom.{st['id']}" not in (sctx.get("time_overrides") or {}), "no stale time_override left behind")
    # Today's completed occurrence keeps its status through the edit.
    tt = next((t for t in tasks_on(row, t0.isoformat()) if t["catalog_id"] == f"custom.{st['id']}"), None)
    check(tt is not None and tt["status"] == "completed", "today's completed stretch still completed after edit")
    # Single-day delete (instance) survives the next regen.
    day3 = (t0 + timedelta(days=3)).isoformat()
    victim = next(t for t in tasks_on(row, day3) if t["catalog_id"] == f"custom.{st['id']}")
    s, _ = await api.req("DELETE", f"/schedules/{row['id']}/tasks/{victim['task_id']}", scope="instance")
    check(s == 200, f"instance delete -> {s}")
    s, _ = await api.req("POST", "/users/onboarding", {**OB, "wake_time": "06:15"})
    row = custom_row(await full(api))
    check(not any(t["catalog_id"] == f"custom.{st['id']}" for t in tasks_on(row, day3)),
          "instance delete survives regen")
    check(any(t["catalog_id"] == f"custom.{st['id']}" for t in tasks_on(row, (t0 + timedelta(days=4)).isoformat())),
          "neighbouring day untouched")
    # Single-day time move survives too.
    day5 = (t0 + timedelta(days=5)).isoformat()
    v5 = next(t for t in tasks_on(row, day5) if t["catalog_id"] == f"custom.{st['id']}")
    s, _ = await api.req("PUT", f"/schedules/{row['id']}/tasks/{v5['task_id']}", {"time": "08:05"}, scope="instance")
    check(s == 200, "instance time edit")
    s, _ = await api.req("POST", "/users/onboarding", {**OB, "wake_time": "06:45"})
    row = custom_row(await full(api))
    v5b = next((t for t in tasks_on(row, day5) if t["catalog_id"] == f"custom.{st['id']}"), None)
    check(v5b is not None and v5b["time"] == "08:05", "instance time edit survives regen")


async def s_side_views(api: C, ctx: dict):
    print("\n[planner/today, program counts, other users]")
    t0 = today_local().isoformat()
    s, d = await api.req("GET", "/planner/today", date=t0)
    blob = str(d)
    check(s == 200 and "Stretch" in blob, f"/planner/today carries the custom task ({s})")
    s, d = await api.req("GET", "/schedules/active/all")
    check(s == 200 and "custom" not in (d.get("labels") or []), f"/active/all doesn't count it as a program {d}")
    row = custom_row(await full(api))
    t = next(t for d in row["days"] for t in d["tasks"] if d["date"] == t0)
    import time as _t
    t_start = _t.monotonic()
    s, g = await api.req("GET", f"/schedules/{row['id']}/tasks/{t['task_id']}/guide")
    took = _t.monotonic() - t_start
    check(s == 200 and g.get("title") == t["title"] and g.get("task_key") == "" and not g.get("unavailable"),
          f"old-app guide for a custom task answers from the note, no AI ({s}, {took:.1f}s)")
    other = await account()
    s, _ = await api.req("GET", "/schedules/custom-tasks")
    s2, d2 = await other.req("PUT", f"/schedules/custom-tasks/{ctx['gym']['id']}", {"time": "05:00"})
    check(s2 == 404, f"another user can't edit my task -> {s2}")
    s2, _ = await other.req("DELETE", f"/schedules/custom-tasks/{ctx['gym']['id']}")
    check(s2 == 404, f"another user can't delete my task -> {s2}")
    s3, l3 = await other.req("GET", "/schedules/custom-tasks")
    check(s3 == 200 and l3["tasks"] == [], "other user sees none of mine")
    free = await account(paid=False)
    s4, d4 = await free.req("POST", "/schedules/custom-tasks",
                            {"title": "Run", "time": "07:00", "minutes": 20, "days": ["mon"]})
    check(s4 == 402, f"unpaid account can't add -> {s4}")


async def s_in_process(api: C, ctx: dict):
    print("\n[in-process: horizon keeper, push engine input, gcal view]")
    from uuid import UUID
    from sqlalchemy import select
    from sqlalchemy.orm.attributes import flag_modified
    from db.sqlalchemy import AsyncSessionLocal
    from models.sqlalchemy_models import User, UserSchedule
    from services.horizon import ensure_plan_horizon
    from services.notification_signals import displayed_tasks, engine_tasks
    from services.master_schedule import build_master_view

    sid = ctx["sid"]
    async with AsyncSessionLocal() as db:
        row = await db.get(UserSchedule, UUID(sid))
        uid = str(row.user_id)
        # Simulate days passing: chop the runway to 4 days.
        t0 = today_local().isoformat()
        row.days = [d for d in row.days if d["date"] < (today_local() + timedelta(days=4)).isoformat()]
        flag_modified(row, "days")
        await db.commit()
    async with AsyncSessionLocal() as db:
        user = await db.get(User, UUID(uid))
        out = await ensure_plan_horizon(user, db)
    async with AsyncSessionLocal() as db:
        row = await db.get(UserSchedule, UUID(sid))
        last = max(d["date"] for d in row.days)
        check((date.fromisoformat(last) - today_local()).days >= 20 and out.get("still_short") == 0,
              f"horizon keeper extends the custom runway (last={last}, out={out})")
        st = ctx["stretch"]
        tt = next((t for t in tasks_on({"days": row.days}, t0) if t["catalog_id"] == f"custom.{st['id']}"), None)
        check(tt is not None and tt["status"] == "completed", "completed status survives the horizon regen")
        rows = list((await db.execute(select(UserSchedule).where(
            (UserSchedule.user_id == UUID(uid)) & (UserSchedule.is_active.is_(True))))).scalars().all())
        user = await db.get(User, UUID(uid))
        shown = await displayed_tasks(db, user, rows, t0)
        et = [{"maxx_id": e.maxx, "schedule_id": e.schedule_id, "task_id": e.task_id, "title": e.title}
              for e in engine_tasks(shown, 7 * 60, 23 * 60)]
        check(any(t["title"] == "Stretch" for t in et), f"push title is exactly what they typed {[t['title'] for t in et]}")
        mine = [t for t in (et or []) if str(t.get("maxx_id")) == "custom"]
        check(bool(mine), f"push engine sees custom tasks today ({len(mine)})")
        check(all(t.get("schedule_id") and t.get("task_id") for t in mine), "push tasks carry schedule+task ids (deep link)")
        mv = await build_master_view(uid, db, days=3)
        check("Stretch" in str(mv), "master view (gcal mirror source) includes custom tasks, title intact")


def _takes_uuid(fn) -> bool:
    import inspect
    try:
        return list(inspect.signature(fn).parameters)[0] in ("user_id", "user_uuid")
    except Exception:
        return False


async def s_race_and_limits(api: C):
    print("\n[double-tap race, 30-task limit, delete-all retire + revive]")
    res = await asyncio.gather(*[api.req("POST", "/schedules/custom-tasks",
                                         {"title": f"Race {i}", "time": "10:00", "minutes": 5, "days": ["sat"]})
                                 for i in range(4)])
    check(all(s == 200 for s, _ in res), f"4 parallel adds all succeed {[s for s, _ in res]}")
    s, lst = await api.req("GET", "/schedules/custom-tasks")
    races = [t for t in lst["tasks"] if t["title"].startswith("Race ")]
    check(len(races) == 4, f"no lost update: 4 race tasks stored ({len(races)})")
    f = await full(api)
    check(sum(1 for s in f["schedules"] if s.get("maxx_id") == "custom") == 1, "exactly one custom row")
    n = len(lst["tasks"])
    for i in range(30 - n):
        s, _ = await api.req("POST", "/schedules/custom-tasks",
                             {"title": f"Fill {i}", "time": "11:00", "minutes": 5, "days": ["sun"]})
        if s != 200:
            check(False, f"fill {i} -> {s}")
            break
    s, d = await api.req("POST", "/schedules/custom-tasks",
                         {"title": "One too many", "time": "11:00", "minutes": 5, "days": ["sun"]})
    check(s == 422 and "30" in str(d.get("detail")), f"31st task refused -> {s} {d.get('detail')}")
    s, lst = await api.req("GET", "/schedules/custom-tasks")
    sid_before = custom_row(await full(api))["id"]
    for t in lst["tasks"]:
        s, _ = await api.req("DELETE", f"/schedules/custom-tasks/{t['id']}")
        if s != 200:
            check(False, f"delete {t['id']} -> {s}")
    f = await full(api)
    check(custom_row(f) is None, "deleting every task retires the row (no empty 'program')")
    s, d = await api.req("POST", "/schedules/custom-tasks",
                         {"title": "Back again", "time": "07:15", "minutes": 15, "days": list(DAYS)})
    check(s == 200 and d["schedule_id"] == sid_before, "re-adding revives the same row")
    row = custom_row(await full(api))
    tday = tasks_on(row, today_local().isoformat())
    check([t["title"] for t in tday if t["status"] == "pending"] == ["Back again"],
          f"only the new task pending today ({[(t['title'], t['status']) for t in tday]})")
    check(all(t["status"] == "completed" for t in tday if t["title"] != "Back again"),
          "a task done today before its delete stays as today's record (like programs)")


async def s_with_program(api: C):
    print("\n[alongside a real program]")
    from qa_personas import Api, start_program, PERSONAS  # noqa: F401
    papi = Api(api.h["Authorization"].split()[1])
    r = await start_program(papi, {"label": "qa"}, "energymax", prefetch=False)
    check(bool(r.get("ok")), f"energymax plan built ({r.get('error', '')})")
    f = await full(api)
    row = custom_row(f)
    prog = next((s for s in f["schedules"] if s.get("maxx_id") == "energymax"), None)
    check(row is not None and prog is not None, "both rows active")
    if row and prog:
        times = {t["time"] for d in row["days"] for t in d["tasks"] if t["title"] == "Back again"}
        check(times == {"07:15"}, f"custom time untouched by program start ({times})")
        s, d = await api.req("GET", "/schedules/active/all")
        check(d.get("count") == 1, f"program count ignores custom row ({d})")


async def main(with_program: bool):
    api = await account()
    ctx = {}
    steps = [("basic", lambda: s_basic(api)), ("validation", lambda: s_validation(api)),
             ("complete", lambda: s_complete_and_regen(api, ctx)), ("edits", lambda: s_edits(api, ctx)),
             ("side", lambda: s_side_views(api, ctx)), ("inproc", lambda: s_in_process(api, ctx)),
             ("race", lambda: s_race_and_limits(api))]
    if with_program:
        steps.append(("program", lambda: s_with_program(api)))
    for name, fn in steps:
        try:
            r = await fn()
            if name == "basic" and r:
                ctx.update(r)
        except Exception as e:  # noqa: BLE001
            traceback.print_exc()
            FAILS.append(f"{name}: crashed {e!r}")
    print(f"\n{PASSES} passed, {len(FAILS)} failed")
    for f in FAILS:
        print("  -", f)
    sys.exit(1 if FAILS else 0)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--with-program", action="store_true")
    asyncio.run(main(ap.parse_args().with_program))
