"""verify_sc3_sc4.py — backend proof for the per-step images + ingredient gate.

SC3 (per-step images cached + idempotent, no per-request generation):
  • resolve_step_image returns a DISTINCT, on-disk image for each step of a task.
  • Running the generator again creates 0 new images (idempotent / cost-guarded).
  • The guide endpoint returns distinct step.image values without generating anything.

SC4 (ingredients only when genuinely needed AND purchasable):
  • No surfaced ingredient is a commodity (water/towel/bowl/hands…).
  • Every surfaced ingredient resolves to a real catalog product with a real URL.
  • At least one step legitimately has ZERO ingredients (commodity-only / unresolved).
  • The top-level union excludes the dropped commodities.

Run: .venv312/bin/python scripts/verify_sc3_sc4.py <user_id>
"""
from __future__ import annotations

import asyncio
import sys

sys.path.insert(0, ".")

from sqlalchemy import text  # noqa: E402
from db import AsyncSessionLocal  # noqa: E402
from services.task_guide_service import get_task_guide  # noqa: E402
from services.step_image_service import resolve_step_image  # noqa: E402
from services.ingredient_resolver import is_commodity  # noqa: E402
import scripts.generate_step_images as gen  # noqa: E402


async def _find_task(db, user_id, substr):
    r = await db.execute(
        text("SELECT id, days FROM user_schedules WHERE user_id=:u AND maxx_id='skinmax' AND is_active=true ORDER BY created_at DESC LIMIT 1"),
        {"u": user_id},
    )
    row = r.fetchone()
    if not row:
        return None, None, None
    sid, days = str(row[0]), (row[1] or [])
    for day in days:
        for t in day.get("tasks", []):
            if substr.lower() in (t.get("title", "").lower()):
                return sid, str(t.get("task_id")), t.get("title")
    return sid, None, None


async def main(user_id: str) -> int:
    ok = True
    async with AsyncSessionLocal() as db:
        sid, tid, title = await _find_task(db, user_id, "morning skincare")
        assert tid, "could not find a 'morning skincare' task for this user"
        guide = await get_task_guide(sid, tid, user_id, db)
        steps = guide["steps"]
        task_key = guide["task_key"]

        try:
            # ---- SC3: distinct per-step images, resolved from disk ----
            imgs = [s.get("image", "") for s in steps]
            assert all(imgs), f"some steps have no image: {imgs}"
            assert len(set(imgs)) == len(imgs), f"step images not distinct: {imgs}"
            # resolve_step_image agrees and is pure-disk (no generation)
            for s in steps:
                assert resolve_step_image(task_key, s["n"]), f"no on-disk image for step {s['n']}"
            print(f"[SC3] {len(imgs)} distinct per-step images: {imgs}")

            # idempotency: regenerate -> 0 created
            created, skipped = await gen.main("morning skincare")
            assert created == 0, f"SC3 idempotency FAILED: generator created {created} on rerun"
            print(f"[SC3] generator rerun created=0 (skipped={skipped}) — idempotent")

            # ---- SC4: ingredient gate ----
            all_ings = [i for s in steps for i in (s.get("ingredients") or [])]
            for i in all_ings:
                gen_name = i.get("generic_name") or i.get("name") or ""
                assert not is_commodity(gen_name), f"SC4 FAILED: commodity surfaced: {gen_name!r}"
                assert i.get("url", "").startswith("http"), f"SC4 FAILED: no real URL for {i.get('name')!r}"
            zero_steps = [s["n"] for s in steps if not (s.get("ingredients") or [])]
            assert zero_steps, "SC4 FAILED: expected at least one step with 0 ingredients"
            # union excludes commodities + matches what's shown
            union = guide.get("products") or []
            for i in union:
                assert not is_commodity(i.get("generic_name") or i.get("name") or ""), "SC4 FAILED: commodity in union"
                assert i.get("url", "").startswith("http"), "SC4 FAILED: union item without real URL"
            print(f"[SC4] {len(all_ings)} surfaced ingredients, all real catalog URLs, "
                  f"no commodities; steps with 0 ingredients: {zero_steps}")

            # ---- SC4 deeper: feed commodities + junk through the resolver, expect drop ----
            from services.ingredient_resolver import resolve_products_for_user
            probe = [
                {"name": "warm water", "note": "to rinse"},
                {"name": "a clean towel", "note": "pat dry"},
                {"name": "vitamin C serum", "note": "2 drops"},
                {"name": "a unicorn horn elixir", "note": "made up"},
            ]
            resolved = await resolve_products_for_user(db, user_id, "skinmax", probe)
            names = [r["generic_name"] for r in resolved]
            assert "warm water" not in names and "a clean towel" not in names, f"commodity leaked: {names}"
            assert "a unicorn horn elixir" not in names, f"unresolvable leaked: {names}"
            assert "vitamin C serum" in names, f"real product dropped: {names}"
            assert all(r["url"].startswith("http") for r in resolved), "resolved item without URL"
            print(f"[SC4] resolver gate: {probe!r} -> kept {names}")

            print("\nSC3 + SC4 PASS — distinct cached per-step images (idempotent), and "
                  "ingredients are commodity-gated, purchasable-only, with real zero-ingredient steps.")
        except AssertionError as e:
            print(f"\nFAIL: {e}")
            ok = False
    return 0 if ok else 1


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("usage: verify_sc3_sc4.py <user_id>")
        sys.exit(2)
    sys.exit(asyncio.run(main(sys.argv[1])))
