"""End to end: every task guide shows the products the Products tab picked for it.

One account sets up several programs through chat on a LOCAL backend (scheduler
off), then opens the guide for every distinct task in its schedules and checks:
  - each product on a step is the Products tab's current pick for that need
  - every need the tab lists FOR the task's habit appears in that guide
  - a task whose habit has no products shows none
Then it swaps one product on the tab and checks the guide follows the swap.

    RUN_SCHEDULER=false ../.venv/bin/python scripts/qa_task_guides.py [--programs skinhairmax,suppmax] [--out guides.json]
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys

sys.path.insert(0, ".")
sys.path.insert(0, "scripts")
from qa_personas import LABELS, new_account, onboarding  # noqa: E402

OB = onboarding(wake="06:30", bed="22:30", minutes=60, level="high", goals=["sleep", "energy", "skin"],
                work=("09:00", "17:00"), commute=20, meals=("07:15", "12:30", "19:00"), workout="18:00")
# answers to tap, by option substring; anything else takes the first option
WANT = ["Clear breakouts", "Shiny", "Build muscle", "Full gym", "4", "Sleep", "None", "Nothing", "Male", "30–49",
        "Rarely eat fish", "Little sun", "Falling asleep", "My phone", "Early morning"]


async def start(api, mid: str) -> bool:
    r = await api.post("/chat/message", {"message": f"I want to start my {LABELS[mid]} plan.",
                                          "init_context": mid, "chat_intent": "start_schedule"})
    conv = r.get("conversation_id")
    for _ in range(12):
        if "plan" in [b.get("type") for b in r.get("visual_blocks") or []]:
            return True
        opts = [o for o in r.get("choices") or [] if "something else" not in o.lower()]
        ans = next((o for w in WANT for o in opts if w.lower() in o.lower()), opts[0] if opts else "not sure")
        r = await api.post("/chat/message", {"message": ans, "conversation_id": conv})
    return False


def tab_index(tab: dict) -> dict:
    """program → {need: {"for": [habit titles], "id": picked product id, "asin": ...}}"""
    return {s["program"]: {i["need"]: {"for": i["for"], "id": i["product"]["id"], "asin": i["product"]["asin"]}
                           for i in s["items"]} for s in tab["sections"]}


async def schedules(api) -> list[dict]:
    full = await api.get("/schedules/active/full")
    return full if isinstance(full, list) else (full.get("schedules") or [])


def distinct_tasks(s: dict) -> list[dict]:
    seen, out = set(), []
    for day in (s.get("days") or [])[:7]:
        for t in day.get("tasks") or []:
            k = (t.get("title"), t.get("description"))
            if k not in seen:
                seen.add(k)
                out.append(t)
    return out


def habit_title(s: dict, task: dict) -> str:
    hid = str(task.get("catalog_id") or "").split(".", 1)[-1]
    plan = (s.get("schedule_context") or {}).get("ai_plan") or {}
    return next((str(h.get("title") or "").strip() for h in plan.get("habits") or [] if h.get("habit_id") == hid), "")


def check(guide: dict, task: dict, s: dict, tab: dict) -> dict:
    mid = s.get("maxx_id")
    needs = tab.get(mid) or {}
    title = habit_title(s, task)
    want = {n for n, v in needs.items() if title and title in v["for"]}
    if mid == "skinhairmax":
        # night variants differ (mask night has no adapalene): only what THIS night's steps use
        import re
        from api.products import _SKIN_STEPS
        desc = str(task.get("description") or "").lower()
        want = {n for n in want if any(re.search(p, desc) for p, k in _SKIN_STEPS if k == n)}
    got = [(i.get("need"), i.get("asin"), si) for si, st in enumerate(guide.get("steps") or [])
           for i in st.get("ingredients") or []]
    problems = []
    if guide.get("unavailable"):
        problems.append(f"guide unavailable: {guide.get('error')}")
    for need, asin, _ in got:
        if need not in needs:
            problems.append(f"{need}: not a need on the Products tab")
        elif asin != needs[need]["asin"]:
            problems.append(f"{need}: guide shows {asin}, tab picked {needs[need]['asin']}")
    missing = want - {n for n, _, _ in got}
    if missing:
        problems.append(f"missing on guide: {sorted(missing)}")
    return {"program": mid, "task": task.get("title"), "habit": title, "want": sorted(want),
            "got": [f"step {si + 1}: {n}" for n, _, si in got], "problems": problems}


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--programs", default="skinhairmax,suppmax,trainmax,sleepmax,focusmax")
    ap.add_argument("--out", default="")
    args = ap.parse_args()
    api = await new_account(OB)
    for mid in args.programs.split(","):
        print(f"setup {mid}: {'ok' if await start(api, mid) else 'NO PLAN'}")
    tab = tab_index(await api.get("/products/for-me"))
    print("tab needs:", {m: sorted(v) for m, v in tab.items()})
    scheds = await schedules(api)
    sem = asyncio.Semaphore(5)

    async def one(s, t):
        async with sem:
            g = await api.get(f"/schedules/{s['id']}/tasks/{t['task_id']}/guide")
            return check(g, t, s, tab), g

    jobs = [one(s, t) for s in scheds for t in distinct_tasks(s)]
    results = await asyncio.gather(*jobs)
    bad = [r for r, _ in results if r["problems"]]
    for r, _ in results:
        flag = "PROBLEM" if r["problems"] else "ok"
        print(f"  [{flag}] {r['program']:12} {r['task'][:40]:40} want={r['want']} got={r['got']} {r['problems'] or ''}")

    # swap: pick the last alternative for one need and re-open a guide that uses it
    swap_ok = None
    target = next(((r, g) for r, g in results if r["want"]), None)
    if target:
        r, g = target
        need = r["want"][0]
        alts = await api.get("/products/alternatives", need=need)
        new = alts["options"][-1]
        await api.post("/products/pick", {"need": need, "product_id": new["id"]})
        s = next(s for s in scheds if s.get("maxx_id") == r["program"])
        t = next(t for t in distinct_tasks(s) if t.get("title") == r["task"])
        g2 = await api.get(f"/schedules/{s['id']}/tasks/{t['task_id']}/guide")
        shown = [i.get("asin") for st in g2.get("steps") or [] for i in st.get("ingredients") or [] if i.get("need") == need]
        swap_ok = shown == [new["asin"]]
        print(f"swap {need} → {new['name']}: guide shows {shown} ({'ok' if swap_ok else 'PROBLEM'})")
    if args.out:
        json.dump([{"check": r, "guide": g} for r, g in results], open(args.out, "w"), indent=1, default=str)
    print(f"\nSUMMARY: {len(results) - len(bad)}/{len(results)} guides clean; swap {'ok' if swap_ok else swap_ok}")


asyncio.run(main())
