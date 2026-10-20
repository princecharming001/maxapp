"""Give stored AI plans the library's current (short) habit titles.

Used when library titles change and live schedules must follow without a full
refit (2026-10-20: every title shortened to fit one line on a 375pt phone).
Touches only `title` — on the plan's habits and on each day's tasks — and only
where the stored title is still the OLD library title for that habit, so a
custom habit or a variant title is never overwritten. Times, statuses and
everything else stay exactly as they are.

    python scripts/retitle_live_plans.py <old_ref>                 # dry run
    RETITLE_APPLY_CONFIRM=yes python scripts/retitle_live_plans.py <old_ref> --apply

<old_ref> is the git ref holding the previous ai_programs/*.md (e.g. HEAD~1).
"""
from __future__ import annotations

import asyncio
import os
import re
import subprocess
import sys
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("RUN_SCHEDULER", "false")

from sqlalchemy import select  # noqa: E402
from sqlalchemy.orm.attributes import flag_modified  # noqa: E402

from db.sqlalchemy import AsyncSessionLocal  # noqa: E402
from models.sqlalchemy_models import UserSchedule  # noqa: E402
from services.ai_programs import _lib, _library_title, is_ai_program  # noqa: E402

_HEAD = re.compile(r"^### `([^`]+)` — (.+)$", re.M)


def _card(title: str) -> str:
    """The card form of a library title (what _library_title stores)."""
    return re.sub(r"\s*\([^)]*\)", "", title).strip().lower()


def _old_titles(ref: str, maxx_id: str) -> dict[str, str]:
    path = f"ai_programs/{maxx_id}.md"
    try:
        text = subprocess.run(["git", "show", f"{ref}:backend/{path}"], capture_output=True,
                              text=True, check=True, cwd=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))).stdout
    except subprocess.CalledProcessError:
        return {}
    return {m.group(1): _card(m.group(2)) for m in _HEAD.finditer(text)}


async def main(ref: str, apply: bool) -> None:
    if apply and os.environ.get("RETITLE_APPLY_CONFIRM") != "yes":
        print("refusing to write: set RETITLE_APPLY_CONFIRM=yes")
        sys.exit(2)
    changed: Counter = Counter()
    rows_touched = 0
    old_cache: dict[str, dict[str, str]] = {}
    async with AsyncSessionLocal() as db:
        rows = (await db.execute(select(UserSchedule).where(UserSchedule.is_active.is_(True)))).scalars().all()
        for s in rows:
            if not is_ai_program(s.maxx_id):
                continue
            lib = _lib(s.maxx_id)
            old = old_cache.setdefault(s.maxx_id, _old_titles(ref, s.maxx_id))

            def fresh(hid: str, current: str) -> str | None:
                h = lib.get(hid or "")
                if h is None or hid not in old:
                    return None
                new = _library_title(h)
                if new == current or (current or "").strip().lower() != old[hid]:
                    return None
                return new

            touched = False
            plan = (s.schedule_context or {}).get("ai_plan")
            for h in (plan or {}).get("habits") or []:
                new = fresh(h.get("habit_id"), h.get("title"))
                if new:
                    changed[f"{s.maxx_id}.{h['habit_id']}: {h.get('title')} -> {new}"] += 1
                    h["title"] = new
                    touched = True
            for d in s.days or []:
                for t in d.get("tasks") or []:
                    new = fresh(t.get("catalog_id"), t.get("title"))
                    if new:
                        t["title"] = new
                        touched = True
            if touched:
                rows_touched += 1
                if apply:
                    flag_modified(s, "days")
                    flag_modified(s, "schedule_context")
        for line, n in sorted(changed.items()):
            print(f"{n:4d}  {line}")
        print(f"{rows_touched} schedules {'updated' if apply else 'would change'}")
        if apply:
            await db.commit()
            print("APPLIED")


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        print(__doc__)
        sys.exit(2)
    asyncio.run(main(args[0], "--apply" in sys.argv))
