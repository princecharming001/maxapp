"""Apply the day fence (services.day_fence) to every ACTIVE schedule's
FUTURE days — a one-off for plans persisted before the fence existed.

Today and past days are left alone (completions are judged against the time
that was printed when the task was done). Idempotent: a re-run moves nothing.

    python scripts/fence_existing_schedules.py            # dry run (default)
    FENCE_APPLY_CONFIRM=yes python scripts/fence_existing_schedules.py --apply
"""
from __future__ import annotations

import asyncio
import copy
import os
import sys
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("RUN_SCHEDULER", "false")

from sqlalchemy import select  # noqa: E402
from sqlalchemy.orm.attributes import flag_modified  # noqa: E402

from db.sqlalchemy import AsyncSessionLocal  # noqa: E402
from models.sqlalchemy_models import User, UserSchedule  # noqa: E402
from services.day_fence import fence_days, fence_violations  # noqa: E402
from services.schedule_streak import local_today_date  # noqa: E402


async def main(apply: bool) -> None:
    if apply and os.environ.get("FENCE_APPLY_CONFIRM") != "yes":
        print("refusing to write: set FENCE_APPLY_CONFIRM=yes")
        sys.exit(2)
    moved_total = rows_changed = 0
    async with AsyncSessionLocal() as db:
        rows = (await db.execute(
            select(UserSchedule).where(UserSchedule.is_active.is_(True))
        )).scalars().all()
        users: dict = {}
        for sched in rows:
            user = users.get(sched.user_id)
            if user is None:
                user = users[sched.user_id] = await db.get(User, sched.user_id)
            if user is None:
                continue
            ob = dict(user.onboarding or {})
            today = local_today_date(ob).isoformat()
            future = [d for d in (sched.days or []) if str(d.get("date") or "") > today]
            before = len(fence_violations(future, ob))
            if not before:
                continue
            new_days = copy.deepcopy(sched.days or [])
            fence_days([d for d in new_days if str(d.get("date") or "") > today], ob)
            moved_total += before
            rows_changed += 1
            print(f"{'APPLY' if apply else 'would fix'} user={str(sched.user_id)[:8]} max={sched.maxx_id} tasks={before}")
            if apply:
                sched.days = new_days
                flag_modified(sched, "days")
                sched.updated_at = datetime.utcnow()
        if apply:
            await db.commit()
    print(f"{'moved' if apply else 'would move'} {moved_total} tasks across {rows_changed} schedules")


if __name__ == "__main__":
    asyncio.run(main(apply="--apply" in sys.argv))
