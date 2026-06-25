"""regen_guides.py — regenerate task guides for a user's tasks via the real endpoint
path (get_task_guide), printing the resolved steps + ingredients. Used to warm v3
guides and to eyeball the SC4 commodity gate.

Usage: .venv312/bin/python scripts/regen_guides.py <user_id> [title_substr ...]
"""
from __future__ import annotations

import asyncio
import json
import sys

sys.path.insert(0, ".")

from sqlalchemy import text  # noqa: E402
from db import AsyncSessionLocal  # noqa: E402
from services.task_guide_service import get_task_guide  # noqa: E402


async def main(user_id: str, substrs: list[str]) -> int:
    async with AsyncSessionLocal() as db:
        row = await db.execute(
            text("SELECT id, days FROM user_schedules WHERE user_id=:u AND maxx_id='skinmax' AND is_active=true ORDER BY created_at DESC LIMIT 1"),
            {"u": user_id},
        )
        r = row.fetchone()
        if not r:
            print("no active skinmax schedule for user")
            return 1
        sid, days = str(r[0]), (r[1] or [])

        # Collect distinct (task_id, title) pairs.
        seen, tasks = set(), []
        for day in days:
            for t in day.get("tasks", []):
                tid, title = str(t.get("task_id")), t.get("title", "")
                if title in seen:
                    continue
                seen.add(title)
                if substrs and not any(s.lower() in title.lower() for s in substrs):
                    continue
                tasks.append((tid, title))

        for tid, title in tasks:
            guide = await get_task_guide(sid, tid, user_id, db)
            print(f"\n=== {title}  (task_key={guide.get('task_key')}, _v={guide.get('_v','?')}) ===")
            print(f"    hero_image={guide.get('hero_image')}")
            for s in guide.get("steps", []):
                imgs = s.get("image", "")
                ings = [(i.get("name"), i.get("url", "")[:40]) for i in (s.get("ingredients") or [])]
                print(f"    step {s['n']}: {s.get('title')!r}  image={imgs or '(none→hero)'}")
                for nm, url in ings:
                    print(f"        - {nm}  | {url}")
                if not ings:
                    print("        - (no ingredients)")
    return 0


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("usage: regen_guides.py <user_id> [title_substr ...]")
        sys.exit(2)
    sys.exit(asyncio.run(main(sys.argv[1], sys.argv[2:])))
