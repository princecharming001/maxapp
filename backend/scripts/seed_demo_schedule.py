"""seed_demo_schedule.py — give a demo/faux user an active maxx schedule with tasks.

For Maestro UI verification: the faux "Paid" user lands on Home with no program, so
there are no habits to tap to open a task guide. This seeds a real schedule via the
normal schedule service (correct structure HomeScreen expects) and pre-warms guides.

Usage: .venv312/bin/python scripts/seed_demo_schedule.py <user_id> [maxx_id]
"""
from __future__ import annotations

import asyncio
import sys

sys.path.insert(0, ".")

from db import AsyncSessionLocal  # noqa: E402


async def main(user_id: str, maxx_id: str) -> int:
    from services.schedule_service import schedule_service
    from services.task_guide_service import pregenerate_for_schedule

    async with AsyncSessionLocal() as db:
        # Drop any existing schedule for this maxx so we get a clean active one.
        try:
            await schedule_service.deactivate_schedule_by_maxx(user_id, maxx_id, db)
        except Exception:
            pass
        sched = await schedule_service.generate_maxx_schedule(
            user_id=user_id,
            maxx_id=maxx_id,
            db=db,
            subscription_tier="premium",
        )
        sid = sched.get("id") or sched.get("schedule_id")
        print(f"created {maxx_id} schedule {sid} for {user_id}")

    # Pre-warm guides (separate session, like the BackgroundTask path).
    if sid:
        await pregenerate_for_schedule(str(sid), user_id)
        print("pregenerated task guides")
    return 0


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("usage: seed_demo_schedule.py <user_id> [maxx_id]")
        sys.exit(2)
    uid = sys.argv[1]
    maxx = sys.argv[2] if len(sys.argv) > 2 else "skinmax"
    sys.exit(asyncio.run(main(uid, maxx)))
