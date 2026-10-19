"""Take the planner / journaling habits out of every stored plan (2026-10-18).

The libraries dropped them (services/biohack_scope.py): Focusmax's top-3 plan,
deep-work block, inbox batching, shutdown ritual, weekly review…; Calmmax's
brain dump, gratitude note, expressive writing, friend ping; Sleepmax's
tomorrow list; Longevitymax's social connection.

  * Focusmax plans were built from planner questions ("what distracts you?",
    "what kind of work?"), so they are restarted: the schedule is deactivated,
    its intake answers cleared, and the program comes off entered_maxxes. The
    person adds it again in Explore and gets the new biology quiz.
  * Every other AI plan is refit in place (refit_template drops ids that are no
    longer in the library, and productivity custom_ habits), and its days are
    regenerated so Home and reminders follow.

Only plan data is touched: subscriptions, XP, streaks and history stay.

    python scripts/retire_planner_habits.py                     # dry run (default)
    RETIRE_APPLY_CONFIRM=yes python scripts/retire_planner_habits.py --apply
"""
from __future__ import annotations

import asyncio
import os
import sys
from collections import Counter
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("RUN_SCHEDULER", "false")

from sqlalchemy import select  # noqa: E402
from sqlalchemy.orm.attributes import flag_modified  # noqa: E402

from db.sqlalchemy import AsyncSessionLocal  # noqa: E402
from models.sqlalchemy_models import User, UserSchedule  # noqa: E402
from services import biohack_scope  # noqa: E402
from services.ai_programs import INTAKE_KEY, _lib, is_ai_program  # noqa: E402

RESTART = {"focusmax"}


def _stale(maxx_id: str, plan: dict) -> list[str]:
    lib = _lib(maxx_id)
    out = []
    for h in plan.get("habits") or []:
        hid = str((h or {}).get("habit_id") or "")
        if hid.startswith("custom_"):
            if biohack_scope.is_productivity(f"{hid.replace('_', ' ')} {h.get('title') or ''} {h.get('how') or ''}"):
                out.append(hid)
        elif hid not in lib:
            out.append(hid)
    return out


async def main(apply: bool) -> None:
    if apply and os.environ.get("RETIRE_APPLY_CONFIRM") != "yes":
        print("refusing to write: set RETIRE_APPLY_CONFIRM=yes")
        sys.exit(2)
    from services.schedule_runtime import regenerate_active_schedules
    from services.user_context_service import get_context, merge_context

    dropped: Counter = Counter()
    restarted, refit_users = 0, set()
    async with AsyncSessionLocal() as db:
        rows = (await db.execute(select(UserSchedule).where(UserSchedule.is_active.is_(True)))).scalars().all()
        for s in rows:
            if not is_ai_program(s.maxx_id):
                continue
            plan = (s.schedule_context or {}).get("ai_plan") or {}
            if s.maxx_id in RESTART:
                restarted += 1
                print(f"restart {s.maxx_id} user={s.user_id} habits={[h.get('habit_id') for h in plan.get('habits') or []]}")
                if apply:
                    s.is_active = False
                    s.updated_at = datetime.utcnow()
                    user = await db.get(User, s.user_id)
                    if user:
                        ob = dict(user.onboarding or {})
                        ob["entered_maxxes"] = [m for m in ob.get("entered_maxxes") or [] if m != s.maxx_id]
                        user.onboarding = ob
                        flag_modified(user, "onboarding")
                    ctx = await get_context(str(s.user_id), db)
                    intake = dict(ctx.get(INTAKE_KEY) or {})
                    if intake.get("maxx_id") == s.maxx_id:
                        await merge_context(str(s.user_id), {INTAKE_KEY: None}, db)
                continue
            stale = _stale(s.maxx_id, plan)
            if stale:
                dropped.update(f"{s.maxx_id}.{h}" for h in stale)
                refit_users.add(str(s.user_id))
                print(f"refit {s.maxx_id} user={s.user_id} drops={stale}")
        if apply:
            await db.flush()
            for uid in sorted(refit_users):
                await regenerate_active_schedules(user_id=uid, db=db, only_ai=True, reason="retire_planner_habits")
            await db.commit()
    print(f"\n{'APPLIED' if apply else 'DRY RUN'}: restarted {restarted} focusmax plans; "
          f"refit {len(refit_users)} users; dropped {dict(dropped)}")


if __name__ == "__main__":
    asyncio.run(main("--apply" in sys.argv))
