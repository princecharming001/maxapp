"""verify_sc3_habit_prefs.py — SC3: opt-ins actually shape the real tasks.

Asserts (backend, not the sim):
  1. Setting habit prefs with a subset WANTED + the complement AVOIDED and regenerating
     yields a schedule that CONTAINS the wanted catalog ids and EXCLUDES the avoided ones
     (non-essential ones; the essential daily floor is protected by design).
  2. Changing the selection changes the tasks (an id avoided in run A but wanted in run B
     comes back).
  3. Every habit chip id in the mobile catalog maps to a real backend task_catalog id.

Run: .venv312/bin/python scripts/verify_sc3_habit_prefs.py <user_id>
"""
from __future__ import annotations

import asyncio
import sys

sys.path.insert(0, ".")

from sqlalchemy import text  # noqa: E402
from db import AsyncSessionLocal  # noqa: E402
from services.schedule_service import schedule_service  # noqa: E402
from services.schedule_runtime import regenerate_active_schedules  # noqa: E402

# Mirror of mobile/data/habitCatalog.ts skinmax ids (must match backend task_catalog).
SKIN_CHIP_IDS = [
    "skin.am_routine", "skin.pm_routine", "skin.spf", "skin.facial_massage",
    "skin.weekly_exfoliation", "skin.pillowcase_change", "skin.hydration_water",
    "skin.diet_anti_inflammatory", "skin.zinc_supp", "skin.progress_photo",
]


def _catalog_ids_in_schedule(sched: dict) -> set[str]:
    out: set[str] = set()
    for day in (sched.get("days") or []):
        for t in (day.get("tasks") or []):
            cid = t.get("catalog_id")
            if cid:
                out.add(str(cid))
    return out


async def _ensure_skinmax(db, user_id) -> str:
    sched = await schedule_service.get_maxx_schedule(user_id, "skinmax", db)
    if sched:
        return str(sched["id"])
    await schedule_service.generate_maxx_schedule(
        user_id=user_id, maxx_id="skinmax", db=db, subscription_tier="premium"
    )
    sched = await schedule_service.get_maxx_schedule(user_id, "skinmax", db)
    return str(sched["id"])


async def _apply(db, user_id, sid, wanted, avoided):
    await schedule_service.set_habit_prefs(
        user_id=user_id, schedule_id=sid, db=db,
        wanted_catalog_ids=wanted, avoided_catalog_ids=avoided,
    )
    await regenerate_active_schedules(user_id=user_id, db=db, only_max="skinmax", reason="sc3_test")
    return await schedule_service.get_maxx_schedule(user_id, "skinmax", db)


async def main(user_id: str) -> int:
    ok = True
    # 3. catalog id mapping
    from services.task_catalog_service import warm_catalog, get_doc
    await warm_catalog()
    doc = get_doc("skinmax")
    backend_ids = {getattr(t, "id", None) for t in (getattr(doc, "task_catalog", None) or getattr(doc, "tasks", []))}
    missing = [c for c in SKIN_CHIP_IDS if c not in backend_ids]
    try:
        assert not missing, f"SC3 FAILED: chip ids not in backend catalog: {missing}"
        print(f"[SC3] all {len(SKIN_CHIP_IDS)} skinmax chip ids map to real task_catalog ids")

        async with AsyncSessionLocal() as db:
            sid = await _ensure_skinmax(db, user_id)

            # Run A: drop two specific non-essential habits.
            drop_a = ["skin.facial_massage", "skin.weekly_exfoliation"]
            want_a = [c for c in SKIN_CHIP_IDS if c not in drop_a]
            sched_a = await _apply(db, user_id, sid, want_a, drop_a)
            ids_a = _catalog_ids_in_schedule(sched_a)
            for d in drop_a:
                assert d not in ids_a, f"SC3 FAILED: avoided {d} still present in run A"
            print(f"[1] run A: avoided {drop_a} dropped; schedule has {len(ids_a)} catalog ids")

            # Run B: now WANT one previously-dropped habit, drop a different one.
            drop_b = ["skin.progress_photo"]
            want_b = [c for c in SKIN_CHIP_IDS if c not in drop_b]  # includes facial_massage now
            sched_b = await _apply(db, user_id, sid, want_b, drop_b)
            ids_b = _catalog_ids_in_schedule(sched_b)
            assert "skin.facial_massage" in ids_b, "SC3 FAILED: re-wanted facial_massage not restored in run B"
            assert "skin.progress_photo" not in ids_b, "SC3 FAILED: avoided progress_photo present in run B"
            print(f"[2] run B: changing selection changed tasks (facial_massage back, progress_photo gone)")

            assert ids_a != ids_b, "SC3 FAILED: tasks identical across different selections"
            print("[2] task set differs between selections — opt-ins shape the plan")

            print("\nSC3 PASS — opt-ins change the real tasks (deselect drops, reselect restores), "
                  "and all chip ids map to real catalog ids.")
        # cleanup: clear prefs so we don't leave the user's schedule pruned
        async with AsyncSessionLocal() as db2:
            try:
                await schedule_service.set_habit_prefs(user_id=user_id, schedule_id=sid, db=db2,
                                                       wanted_catalog_ids=[], avoided_catalog_ids=[])
                await regenerate_active_schedules(user_id=user_id, db=db2, only_max="skinmax", reason="sc3_cleanup")
            except Exception:
                pass
    except AssertionError as e:
        print(f"\n{e}")
        ok = False
    return 0 if ok else 1


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("usage: verify_sc3_habit_prefs.py <user_id>")
        sys.exit(2)
    sys.exit(asyncio.run(main(sys.argv[1])))
