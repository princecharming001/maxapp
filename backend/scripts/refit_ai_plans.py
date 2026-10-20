"""Refit and re-expand every active AI plan against the current libraries.

Used when a library change has to reach stored plans (2026-10-19: things you
can do at a moment — dim the lights, screens off, veg first, the step check —
moved from rules to tasks). The dry run refits each plan in memory and prints
what changes; nothing is written. --apply runs the normal regeneration for each
user (status-preserving merge, done tasks kept).

    python scripts/refit_ai_plans.py                       # dry run
    REFIT_APPLY_CONFIRM=yes python scripts/refit_ai_plans.py --apply
"""
from __future__ import annotations

import asyncio
import os
import sys
from collections import Counter, defaultdict

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("RUN_SCHEDULER", "false")

from sqlalchemy import select  # noqa: E402

from db.sqlalchemy import AsyncSessionLocal  # noqa: E402
from models.sqlalchemy_models import UserSchedule  # noqa: E402
from services.ai_programs import _lib, _user_state, build_profile, is_ai_program, refit_template  # noqa: E402


def _kind(mid: str, hid: str) -> str:
    h = _lib(mid).get(hid)
    return h.habit_kind if h is not None else "custom"


async def main(apply: bool) -> None:
    if apply and os.environ.get("REFIT_APPLY_CONFIRM") != "yes":
        print("refusing to write: set REFIT_APPLY_CONFIRM=yes")
        sys.exit(2)
    from services.schedule_runtime import regenerate_active_schedules

    became_tasks: Counter = Counter()
    dropped: list[str] = []
    users: dict[str, list] = defaultdict(list)
    async with AsyncSessionLocal() as db:
        rows = (await db.execute(select(UserSchedule).where(UserSchedule.is_active.is_(True)))).scalars().all()
        for s in rows:
            if is_ai_program(s.maxx_id) and (s.schedule_context or {}).get("ai_plan"):
                users[str(s.user_id)].append(s)
        for uid, scheds in users.items():
            try:
                profile = build_profile((await _user_state(uid, db))[2])
            except Exception as e:  # noqa: BLE001
                print(f"skip {uid}: {e}")
                continue
            plans = {s.maxx_id: s.schedule_context["ai_plan"] for s in scheds}
            for s in scheds:
                before = plans[s.maxx_id]
                others = {m: p for m, p in plans.items() if m != s.maxx_id}
                after = refit_template(s.maxx_id, before, profile, others=others)
                b = {h.get("habit_id") for h in before.get("habits") or []}
                a = {h.get("habit_id") for h in after.get("habits") or []}
                for hid in sorted(b - a):
                    dropped.append(f"{uid[:8]} {s.maxx_id}.{hid}")
                for hid in sorted(a & b):
                    if _kind(s.maxx_id, hid) != "rule" and any(
                            h.get("habit_id") == hid and int(h.get("minutes") or 0) == 0 for h in before["habits"]):
                        became_tasks[f"{s.maxx_id}.{hid}"] += 1
        print(f"{len(users)} users with AI plans")
        print("rule -> task:", dict(became_tasks))
        print("WOULD DROP:" if not apply else "dropped:", dropped or "none")
        if apply:
            for uid in users:
                await regenerate_active_schedules(user_id=uid, db=db, only_ai=True, reason="refit_ai_plans")
            await db.commit()
            print(f"APPLIED: regenerated {len(users)} users")


if __name__ == "__main__":
    asyncio.run(main("--apply" in sys.argv))
