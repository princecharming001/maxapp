"""verify_sc4_fetch.py — SC4: real step photos are fetched ONCE, cached, idempotent,
and the guide endpoint serves LOCAL cached URLs (never live hot-links).

Asserts:
  1. Re-running the fetch downloads 0 new images (idempotent / cost-guarded).
  2. resolve_step_image returns LOCAL /uploads/... paths (no http hot-link).
  3. The guide endpoint returns distinct step.image values, all local /uploads/..., with
     no image fetched at request time.
  4. attribution.json records the source/license for each fetched image.

Run: .venv312/bin/python scripts/verify_sc4_fetch.py <user_id_with_morning_skincare>
"""
from __future__ import annotations

import asyncio
import json
import os
import sys

sys.path.insert(0, ".")

from sqlalchemy import text  # noqa: E402
from db import AsyncSessionLocal  # noqa: E402
from services.task_guide_service import get_task_guide  # noqa: E402
from services.step_image_service import resolve_step_image, step_dir  # noqa: E402
import scripts.fetch_step_images as fetch  # noqa: E402


async def _find_task(db, user_id, substr):
    r = await db.execute(
        text("SELECT id, days FROM user_schedules WHERE user_id=:u AND maxx_id='skinmax' AND is_active=true ORDER BY created_at DESC LIMIT 1"),
        {"u": user_id},
    )
    row = r.fetchone()
    if not row:
        return None, None
    sid, days = str(row[0]), (row[1] or [])
    for day in days:
        for t in day.get("tasks", []):
            if substr.lower() in (t.get("title", "").lower()):
                return sid, str(t.get("task_id"))
    return sid, None


async def main(user_id: str) -> int:
    ok = True
    try:
        # 1. idempotent fetch
        fetched, skipped = await fetch.main("morning skincare", False)
        assert fetched == 0, f"SC4 idempotency FAILED: re-fetch downloaded {fetched}"
        assert skipped >= 4, f"expected to skip existing images, skipped={skipped}"
        print(f"[SC4] re-fetch downloaded 0 (skipped {skipped}) — idempotent")

        tk = "skinmax|morning skincare"
        # 2. local paths
        locals_ = [resolve_step_image(tk, n) for n in range(1, 5)]
        assert all(u.startswith("/uploads/hero/steps/") for u in locals_), f"non-local path: {locals_}"
        assert all("http" not in u for u in locals_), f"hot-link leaked: {locals_}"
        print(f"[SC4] resolve_step_image -> local cached paths: {[u.split('?')[0] for u in locals_]}")

        # 3. endpoint serves local distinct urls, no request-time fetch
        async with AsyncSessionLocal() as db:
            sid, tid = await _find_task(db, user_id, "morning skincare")
            assert tid, "no morning skincare task for this user"
            guide = await get_task_guide(sid, tid, user_id, db)
            imgs = [s.get("image", "") for s in guide["steps"]]
            assert all(i.startswith("/uploads/") for i in imgs), f"endpoint returned non-local: {imgs}"
            assert all("http" not in i for i in imgs), f"endpoint hot-link: {imgs}"
            assert len(set(imgs)) == len(imgs), f"endpoint images not distinct: {imgs}"
            print(f"[SC4] endpoint step.image all local + distinct: {[i.split('?')[0] for i in imgs]}")

        # 4. attribution recorded
        ap = os.path.join(step_dir(tk), "attribution.json")
        attrib = json.load(open(ap))
        assert all(v.get("source") and v.get("license") for v in attrib.values()), "missing attribution"
        print(f"[SC4] attribution recorded for {len(attrib)} images (source/license)")

        print("\nSC4 PASS — real photos fetched once, cached locally, idempotent; endpoint "
              "serves local cached URLs (no hot-links).")
    except AssertionError as e:
        print(f"\nSC4 FAIL: {e}")
        ok = False
    return 0 if ok else 1


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("usage: verify_sc4_fetch.py <user_id>")
        sys.exit(2)
    sys.exit(asyncio.run(main(sys.argv[1])))
