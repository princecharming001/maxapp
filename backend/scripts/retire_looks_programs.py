"""Retire the old looks programs (skinmax, hairmax, heightmax, bonemax, fitmax)
for every account: deactivate their active schedules and take them off the
user's entered programs, so stale tasks stop showing on Home and stop sending
reminders. Users then add the new AI programs (Sleepmax, …) themselves.

Only plan data is touched. Subscriptions, entitlements, purchases of creator
courses, XP, streaks and achievements are left exactly as they are.

    python scripts/retire_looks_programs.py            # dry run (default)
    RETIRE_APPLY_CONFIRM=yes python scripts/retire_looks_programs.py --apply
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
from services.ai_programs import RETIRED_PROGRAMS  # noqa: E402


async def main(apply: bool) -> None:
    if apply and os.environ.get("RETIRE_APPLY_CONFIRM") != "yes":
        print("refusing to write: set RETIRE_APPLY_CONFIRM=yes")
        sys.exit(2)
    retired = set(RETIRED_PROGRAMS)
    by_max: Counter = Counter()
    users_touched: set = set()
    async with AsyncSessionLocal() as db:
        rows = (await db.execute(
            select(UserSchedule).where(
                UserSchedule.is_active.is_(True) & UserSchedule.maxx_id.in_(retired)
            )
        )).scalars().all()
        for sched in rows:
            by_max[sched.maxx_id] += 1
            users_touched.add(sched.user_id)
            if apply:
                sched.is_active = False
                sched.updated_at = datetime.utcnow()

        users = (await db.execute(select(User))).scalars().all()
        entered_cleared = 0
        for user in users:
            ob = dict(user.onboarding or {})
            entered = list(ob.get("entered_maxxes") or [])
            keep = [m for m in entered if m not in retired]
            if keep == entered:
                continue
            entered_cleared += 1
            users_touched.add(user.id)
            if apply:
                ob["entered_maxxes"] = keep
                at = dict(ob.get("maxx_entered_at") or {})
                for m in retired:
                    at.pop(m, None)
                ob["maxx_entered_at"] = at
                user.onboarding = ob
                flag_modified(user, "onboarding")
        if apply:
            await db.commit()

    verb = "deactivated" if apply else "would deactivate"
    print(f"{verb} {sum(by_max.values())} active schedules: {dict(by_max)}")
    print(f"{'cleared' if apply else 'would clear'} retired programs from {entered_cleared} users' entered list")
    print(f"accounts affected: {len(users_touched)}")
    if not apply:
        print("dry run only. re-run with RETIRE_APPLY_CONFIRM=yes ... --apply to write.")


if __name__ == "__main__":
    asyncio.run(main(apply="--apply" in sys.argv))
