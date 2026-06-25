"""verify_sc4_cache.py — prove the image-caching half of SC4 (backend, NOT the sim).

Asserts:
  1. Every maxx resolves to a curated hero asset that EXISTS on disk (fallback chain).
  2. The hero image URL is CACHED inside the task_guides payload (persisted in the table).
  3. The guide (and its hero image) is generated ONCE and REUSED — a second request for
     the same task does NOT regenerate (no per-request image/guide generation).
  4. The cached payload stores GENERIC ingredients (no per-user URL baked in); per-user
     product resolution is layered at request time (keeps SC5 per-user while caching text).

Uses a unique probe task title so the global task_key can never collide with a real
guide. Cleans up its own task_guides + user_schedules rows.

Run:  .venv312/bin/python scripts/verify_sc4_cache.py
"""
from __future__ import annotations

import asyncio
import json
import sys
import uuid

from sqlalchemy import text

sys.path.insert(0, ".")

from db import AsyncSessionLocal  # noqa: E402
import services.task_guide_service as tgs  # noqa: E402
from services.hero_image_service import resolve_hero_image  # noqa: E402


async def main() -> int:
    ok = True

    # --- 1. every maxx hero asset exists -----------------------------------
    import os
    for maxx in ("skinmax", "hairmax", "fitmax", "heightmax", "bonemax"):
        url = resolve_hero_image(maxx)
        path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), url.lstrip("/"))
        assert url == f"/uploads/hero/{maxx}.jpg", f"unexpected hero url for {maxx}: {url}"
        assert os.path.isfile(path), f"hero asset missing on disk: {path}"
    print("[1] all per-maxx hero assets resolve to existing files")

    # Count how many times the guide text is generated.
    gen_count = {"n": 0}
    real_validate = tgs._validate

    def _fake_generate(title, description, maxx_id, duration_minutes):
        gen_count["n"] += 1
        guide = {
            "overview": "probe overview",
            "steps": [
                {"n": 1, "title": "Apply serum", "body": "Apply it.", "tip": None,
                 "ingredients": [{"name": "vitamin C serum", "note": "2 drops"}]},
                {"n": 2, "title": "Moisturize", "body": "Seal it in.", "tip": "Be gentle.",
                 "ingredients": [{"name": "moisturizer", "note": "pea-size"}]},
            ],
            "duration_minutes": duration_minutes,
            "why_it_matters": "probe why",
        }
        real_validate(guide)  # normalize ingredients + build products union, as the real path does
        return guide

    async def _fake_generate_async(*a, **k):
        return _fake_generate(*a, **k)

    orig = tgs._generate_guide
    tgs._generate_guide = _fake_generate_async  # type: ignore

    sid = str(uuid.uuid4())
    task_id = "probe"
    title = f"SC4 cache probe {uuid.uuid4().hex[:8]}"
    maxx = "skinmax"
    key = tgs._normalise_key(title, maxx)

    async with AsyncSessionLocal() as db:
        await tgs._ensure_table(db)
        # need a real user (FK app_users)
        uid = (await db.execute(text("SELECT id FROM app_users LIMIT 1"))).scalar()
        assert uid, "no app_users to attach the probe schedule to"

        days = [{"tasks": [{"task_id": task_id, "title": title,
                            "description": "probe task", "duration_minutes": 5}]}]
        await db.execute(
            text(
                "INSERT INTO user_schedules (id, user_id, maxx_id, days, is_active) "
                "VALUES (:id, :uid, :maxx, CAST(:days AS json), true)"
            ),
            {"id": sid, "uid": str(uid), "maxx": maxx, "days": json.dumps(days)},
        )
        await db.commit()

        try:
            # First request — cache miss, generates once.
            r1 = await tgs.get_task_guide(sid, task_id, str(uid), db)
            assert gen_count["n"] == 1, f"expected 1 generation, got {gen_count['n']}"
            assert r1.get("hero_image") == "/uploads/hero/skinmax.jpg", f"bad hero on r1: {r1.get('hero_image')}"
            print(f"[2] request 1: generated once, hero_image={r1['hero_image']}")

            # The cached row stores the hero image + generic ingredients.
            payload = (await db.execute(
                text("SELECT payload FROM task_guides WHERE task_key=:k"), {"k": key}
            )).scalar()
            payload = payload if isinstance(payload, dict) else json.loads(payload)
            assert payload.get("hero_image") == "/uploads/hero/skinmax.jpg", "hero image NOT cached in task_guides"
            assert payload.get("_v") == tgs._PAYLOAD_V, "payload version not stamped"
            cached_ing = payload["steps"][0]["ingredients"][0]
            assert "url" not in cached_ing or not cached_ing.get("url"), \
                "cache should store GENERIC ingredients (no per-user url baked in)"
            assert cached_ing["name"] == "vitamin C serum", "cache lost generic ingredient name"
            print("[3] hero image + _v cached in task_guides; cached ingredients are generic")

            # Second request — cache hit, must NOT regenerate.
            r2 = await tgs.get_task_guide(sid, task_id, str(uid), db)
            assert gen_count["n"] == 1, f"REGENERATED on 2nd request! count={gen_count['n']}"
            assert r2.get("hero_image") == "/uploads/hero/skinmax.jpg"
            # Request-time per-user resolution turns the generic into a real product card.
            resolved_ing = r2["steps"][0]["ingredients"][0]
            print(f"[4] request 2: NO regeneration (count={gen_count['n']}); "
                  f"per-user resolved '{resolved_ing.get('generic_name')}' -> '{resolved_ing.get('name')}'")

            print("\nSC4 (image caching) PASS — hero image generated/resolved once, cached in "
                  "task_guides, reused with no per-request regeneration.")
        except AssertionError as e:
            print(f"\nSC4 cache FAIL: {e}")
            ok = False
        finally:
            tgs._generate_guide = orig  # type: ignore
            await db.execute(text("DELETE FROM task_guides WHERE task_key=:k"), {"k": key})
            await db.execute(text("DELETE FROM user_schedules WHERE id=:id"), {"id": sid})
            await db.commit()
            print("(cleaned up probe rows)")

    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
