"""verify_sc5.py — prove SC5: per-user ingredient->product consistency.

Backend-only proof (NOT the simulator). Exercises ingredient_resolver against the real
DB (the persisted user_ingredient_products mapping). Asserts:

  1. Cross-task consistency: the same ingredient resolves to the SAME product for a user
     across different task contexts (task A vs task B).
  2. Facts-driven divergence: a vegan user gets a DIFFERENT but self-consistent product,
     and it passes the vegan filter (never a non-vegan item).
  3. Persistence is authoritative: once stored, the mapping is REUSED (not recomputed) —
     proven by mutating the stored row and seeing the mutated product come back.

Run:  .venv312/bin/python scripts/verify_sc5.py
Exits non-zero on any failed assertion. Cleans up its own test rows.
"""
from __future__ import annotations

import asyncio
import sys
import uuid

from sqlalchemy import text

sys.path.insert(0, ".")

from db import AsyncSessionLocal  # noqa: E402
from services import ingredient_resolver as ir  # noqa: E402


async def main() -> int:
    user_default = f"sc5-test-default-{uuid.uuid4()}"
    user_vegan = f"sc5-test-vegan-{uuid.uuid4()}"
    vegan_facts = {"diet": ["vegan"]}
    ok = True

    async with AsyncSessionLocal() as db:
        await ir._ensure_table(db)
        try:
            # --- 1. Cross-task consistency for the default user ----------------
            # "task A" and "task B" both reference vitamin C serum.
            a = await ir.resolve_product_for_user(db, user_default, "skinmax", "vitamin C serum")
            b = await ir.resolve_product_for_user(db, user_default, "skinmax", "Vitamin C Serum (2 drops)")
            assert a is not None, "default user: vitamin C serum should resolve"
            assert a.id == b.id, f"SC5 cross-task FAILED: {a.id} != {b.id}"
            print(f"[1] cross-task consistent: 'vitamin C serum' -> {a.name} ({a.id}) in task A and task B")

            # A different shared ingredient should also be stable across tasks.
            c1 = await ir.resolve_product_for_user(db, user_default, "skinmax", "moisturizer")
            c2 = await ir.resolve_product_for_user(db, user_default, "skinmax", "a thin layer of moisturizer")
            assert c1 and c2 and c1.id == c2.id, "SC5 cross-task FAILED for moisturizer"
            print(f"[1] cross-task consistent: 'moisturizer' -> {c1.name} ({c1.id})")

            # --- 2. Facts-driven divergence (vegan) ---------------------------
            v = await ir.resolve_product_for_user(db, user_vegan, "skinmax", "vitamin C serum", user_facts=vegan_facts)
            assert v is not None, "vegan user: vitamin C serum should resolve"
            assert v.tags.get("vegan") is True, f"SC5 facts FAILED: vegan user got non-vegan {v.name} tags={v.tags}"
            assert v.id != a.id, f"SC5 facts FAILED: vegan user got same product as default ({v.id})"
            # consistent on repeat
            v2 = await ir.resolve_product_for_user(db, user_vegan, "skinmax", "vitamin c serum", user_facts=vegan_facts)
            assert v2 and v2.id == v.id, "SC5 vegan self-consistency FAILED"
            print(f"[2] vegan diverges + self-consistent: -> {v.name} ({v.id}, vegan={v.tags.get('vegan')})")

            # --- 3. Persistence is authoritative ------------------------------
            # Pick any OTHER catalog product as a sentinel, force it into the stored
            # mapping, and confirm a subsequent resolve returns it (reads persisted row,
            # does not recompute) when facts are unchanged.
            from services import product_catalog as pc
            others = [p for p in pc.load_catalog() if p.id != a.id]
            sentinel = others[0]
            key = ir.canonical_ingredient("vitamin C serum")
            fh = ir._facts_hash(None)
            await db.execute(
                text(
                    "UPDATE user_ingredient_products SET product_id = :p, facts_hash = :h "
                    "WHERE user_id = :u AND ingredient_key = :k"
                ),
                {"p": sentinel.id, "h": fh, "u": user_default, "k": key},
            )
            await db.commit()
            reused = await ir.resolve_product_for_user(db, user_default, "skinmax", "vitamin C serum")
            assert reused and reused.id == sentinel.id, (
                f"SC5 persistence FAILED: expected stored {sentinel.id}, got {reused.id if reused else None}"
            )
            print(f"[3] persistence authoritative: stored mapping reused -> {reused.name} ({reused.id})")

            # --- 4. facts change invalidates the mapping ----------------------
            # Same user, but now vegan facts -> recompute to a vegan product, overwriting
            # the sentinel (facts_hash mismatch).
            changed = await ir.resolve_product_for_user(
                db, user_default, "skinmax", "vitamin C serum", user_facts=vegan_facts
            )
            assert changed and changed.tags.get("vegan") is True, "SC5 facts-change FAILED to recompute vegan"
            print(f"[4] facts change recomputes: -> {changed.name} (vegan={changed.tags.get('vegan')})")

            print("\nSC5 PASS — per-user ingredient->product mapping is deterministic, "
                  "facts-filtered, persisted, and consistent across tasks.")
        except AssertionError as e:
            print(f"\nSC5 FAIL: {e}")
            ok = False
        finally:
            await db.execute(
                text("DELETE FROM user_ingredient_products WHERE user_id IN (:a, :b)"),
                {"a": user_default, "b": user_vegan},
            )
            await db.commit()
            print("(cleaned up test rows)")

    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
