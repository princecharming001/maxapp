"""Custom tasks — things the person adds to their own stack (a gym session, a
run, a sauna visit) next to the programs.

They live in ONE UserSchedule row per user (maxx_id = "custom",
schedule_type = "custom"). The row stores the person's templates in
schedule_context["custom_plan"] and its `days` are expanded from them exactly
like an AI program's, so everything downstream — Home, Planner, completion,
XP, streak, task pushes, the Google Calendar mirror — treats a custom task like
any other task with no extra code.

What is different from a program task:
  * The person's time is the time. Nothing moves it: the regen tail skips
    calendar busy, day_fence and wanted-habit injection for this row, and
    reconcile_schedules passes the row through untouched (so the collision
    passes never re-time, defer or hold back a custom task).
  * No biohacking scope filter. The person chose it; it is theirs.
  * Re-expanded by regenerate_active_schedules (only_max="custom") through the
    shared tail, so done/skipped status, single-day edits/deletes and series
    time pins all survive the same way they do for programs.
"""
from __future__ import annotations

import re
import uuid
from datetime import date, datetime, timedelta
from typing import Any, Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from models.sqlalchemy_models import UserSchedule

CUSTOM_MAXX_ID = "custom"
CUSTOM_SCHEDULE_TYPE = "custom"
PLAN_KEY = "custom_plan"
MAX_TASKS = 30
DAYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")
TITLE_MAX = 60
NOTE_MAX = 280
MIN_MINUTES, MAX_MINUTES = 1, 480

_TIME = re.compile(r"^([01]?\d|2[0-3]):([0-5]\d)$")
_SPACES = re.compile(r"\s+")
# Characters that would break push/calendar rendering. Everything else (emoji
# included) is the person's to write.
_CONTROL = re.compile(r"[\x00-\x08\x0b-\x1f\x7f]")


class CustomTaskError(ValueError):
    """Bad input; the message is safe to show the person."""


def is_custom(maxx_id: Optional[str]) -> bool:
    return (maxx_id or "").strip().lower() == CUSTOM_MAXX_ID


def catalog_id(task_id: str) -> str:
    return f"{CUSTOM_MAXX_ID}.{task_id}"


# ---------------------------------------------------------------- validation

def _clean_text(raw: Any, limit: int) -> str:
    s = _CONTROL.sub("", str(raw or ""))
    # Em/en dashes read as AI-written in this app's voice; keep the person's
    # meaning with a plain hyphen.
    s = s.replace("—", "-").replace("–", "-")
    s = _SPACES.sub(" ", s).strip()
    return s[:limit].rstrip()


def _clean_time(raw: Any) -> str:
    m = _TIME.match(str(raw or "").strip())
    if not m:
        raise CustomTaskError("Pick a time for this task.")
    return f"{int(m.group(1)):02d}:{m.group(2)}"


def _clean_days(raw: Any) -> list[str]:
    if not isinstance(raw, (list, tuple)):
        raise CustomTaskError("Pick at least one day.")
    picked = {str(d).strip().lower()[:3] for d in raw}
    out = [d for d in DAYS if d in picked]
    if not out:
        raise CustomTaskError("Pick at least one day.")
    return out


def _clean_minutes(raw: Any) -> int:
    try:
        n = int(raw)
    except (TypeError, ValueError):
        raise CustomTaskError("How long does it take?")
    if n < MIN_MINUTES or n > MAX_MINUTES:
        raise CustomTaskError("Keep it between 1 minute and 8 hours.")
    return n


def clean_task_input(data: dict, *, partial: bool = False, base: Optional[dict] = None) -> dict:
    """Validate a create (partial=False) or an edit (partial=True, merged over
    `base`). Returns the stored template fields."""
    src = dict(base or {})
    for k in ("title", "time", "minutes", "days", "note"):
        if k in data and data[k] is not None:
            src[k] = data[k]
        elif not partial and k in ("title", "time", "minutes", "days"):
            src.setdefault(k, None)
    title = _clean_text(src.get("title"), TITLE_MAX)
    if not title:
        raise CustomTaskError("Give your task a name.")
    return {
        "title": title,
        "time": _clean_time(src.get("time")),
        "minutes": _clean_minutes(src.get("minutes")),
        "days": _clean_days(src.get("days")),
        "note": _clean_text(src.get("note"), NOTE_MAX),
    }


# ---------------------------------------------------------------- template

def plan_of(row: Optional[UserSchedule]) -> dict:
    ctx = (row.schedule_context or {}) if row is not None else {}
    plan = ctx.get(PLAN_KEY) or {}
    tasks = [t for t in (plan.get("tasks") or []) if isinstance(t, dict) and t.get("id")]
    return {"version": 1, "tasks": tasks}


def public_tasks(row: Optional[UserSchedule]) -> list[dict]:
    """Templates as the app edits them, with the time the person actually sees
    (a series move made from the task screen pins time_overrides)."""
    if row is None:
        return []
    ctx = row.schedule_context or {}
    overrides = ctx.get("time_overrides") or {}
    excluded = set(ctx.get("excluded_catalog_ids") or [])
    out = []
    for t in plan_of(row)["tasks"]:
        cid = catalog_id(t["id"])
        if cid in excluded:
            continue
        out.append({
            "id": t["id"],
            "catalog_id": cid,
            "title": t.get("title") or "",
            "time": overrides.get(cid) or t.get("time"),
            "minutes": int(t.get("minutes") or 0),
            "days": list(t.get("days") or []),
            "note": t.get("note") or "",
        })
    out.sort(key=lambda t: (t["time"] or "", t["title"].lower()))
    return out


def expand_custom(schedule_context: Optional[dict], *, start_date: date, n_days: int) -> list[dict]:
    """Dated days for the row from its templates. Always returns n_days days
    (possibly with no tasks) so an emptied plan really empties the schedule —
    the regen tail refuses to replace a plan with zero days."""
    plan = (schedule_context or {}).get(PLAN_KEY) or {}
    tasks = [t for t in (plan.get("tasks") or []) if isinstance(t, dict) and t.get("id")]
    days: list[dict] = []
    for i in range(max(0, int(n_days))):
        d = start_date + timedelta(days=i)
        dow = DAYS[d.weekday()]
        out = []
        for t in tasks:
            if dow not in (t.get("days") or []):
                continue
            minutes = int(t.get("minutes") or 0) or 15
            out.append({
                "task_id": str(uuid.uuid4()),
                "catalog_id": catalog_id(t["id"]),
                "title": t.get("title") or "Task",
                "description": t.get("note") or "",
                "why": "",
                "time": t.get("time") or "09:00",
                "duration_min": minutes,
                "duration_minutes": minutes,
                "tags": [CUSTOM_MAXX_ID, "user_requested"],
                "status": "pending",
                "intensity": 0.5,
                "kind": "action",
                "custom": True,
                "user_requested": True,
                "importance": 4,
                "task_kind": "fixed",
                "locked": True,
            })
        out.sort(key=lambda x: x["time"])
        days.append({"day_index": i, "date": d.isoformat(), "tasks": out})
    return days


# ---------------------------------------------------------------- persistence

async def get_row(user_id: str, db: AsyncSession, *, include_inactive: bool = False) -> Optional[UserSchedule]:
    q = select(UserSchedule).where(
        (UserSchedule.user_id == UUID(str(user_id))) & (UserSchedule.maxx_id == CUSTOM_MAXX_ID)
    )
    if not include_inactive:
        q = q.where(UserSchedule.is_active.is_(True))
    rows = list((await db.execute(q.order_by(UserSchedule.created_at.desc()))).scalars().all())
    if not rows:
        return None
    # Prefer the active one; there should only ever be one row per user.
    rows.sort(key=lambda r: (not r.is_active,))
    return rows[0]


async def _lock(user_id: str, db: AsyncSession) -> None:
    """Serialize this person's custom-task writes (a double-tapped Save, two
    devices): every write is read-modify-write on one JSON template, and the
    first add creates the row. Transaction-scoped; released on commit."""
    from sqlalchemy import text
    try:
        await db.execute(text("SELECT pg_advisory_xact_lock(hashtext(:k))"), {"k": f"custom_tasks:{user_id}"})
    except Exception:
        pass  # non-Postgres (tests): nothing to serialize against


async def _ensure_row(user_id: str, db: AsyncSession) -> UserSchedule:
    await _lock(user_id, db)
    row = await get_row(user_id, db, include_inactive=True)
    if row is None:
        row = UserSchedule(
            user_id=UUID(str(user_id)),
            schedule_type=CUSTOM_SCHEDULE_TYPE,
            maxx_id=CUSTOM_MAXX_ID,
            course_title="Your own tasks",
            days=[],
            preferences={},
            schedule_context={PLAN_KEY: {"version": 1, "tasks": []}},
            is_active=True,
            completion_stats={"completed": 0, "total": 0, "skipped": 0},
        )
        db.add(row)
        await db.flush()
    elif not row.is_active:
        row.is_active = True
        row.updated_at = datetime.utcnow()
    return row


def _set_plan(row: UserSchedule, tasks: list[dict], **ctx_updates) -> None:
    ctx = dict(row.schedule_context or {})
    ctx[PLAN_KEY] = {"version": 1, "tasks": tasks}
    ctx.update(ctx_updates)
    row.schedule_context = ctx
    flag_modified(row, "schedule_context")
    row.updated_at = datetime.utcnow()


def _forget_overrides(ctx: dict, cid: str) -> dict:
    """Drop every pin/exclusion for one custom task so the template is the
    single source of truth again after the person edits or deletes it."""
    out = {}
    tov = dict(ctx.get("time_overrides") or {})
    if tov.pop(cid, None) is not None:
        out["time_overrides"] = tov
    for key in ("excluded_catalog_ids", "avoided_catalog_ids", "wanted_catalog_ids"):
        vals = list(ctx.get(key) or [])
        if cid in vals:
            out[key] = [v for v in vals if v != cid]
    inst = dict(ctx.get("instance_overrides") or {})
    kept = {k: v for k, v in inst.items() if not str(k).endswith("|" + cid)}
    if len(kept) != len(inst):
        out["instance_overrides"] = kept
    return out


async def _rebuild(user_id: str, db: AsyncSession, reason: str) -> None:
    from services.schedule_runtime import regenerate_active_schedules
    await db.flush()
    await regenerate_active_schedules(user_id=str(user_id), db=db, only_max=CUSTOM_MAXX_ID, reason=reason)


async def create_task(user_id: str, db: AsyncSession, data: dict) -> dict:
    fields = clean_task_input(data or {})
    row = await _ensure_row(user_id, db)
    tasks = plan_of(row)["tasks"]
    if len(tasks) >= MAX_TASKS:
        raise CustomTaskError(f"You can have up to {MAX_TASKS} of your own tasks.")
    tid = uuid.uuid4().hex[:12]
    tmpl = {"id": tid, **fields, "created_at": datetime.utcnow().isoformat()}
    _set_plan(row, tasks + [tmpl])
    await _rebuild(user_id, db, "custom_task_added")
    return {"task": next(t for t in public_tasks(row) if t["id"] == tid), "schedule_id": str(row.id)}


async def update_task(user_id: str, db: AsyncSession, task_id: str, data: dict) -> dict:
    await _lock(user_id, db)
    row = await get_row(user_id, db)
    tasks = plan_of(row)["tasks"]
    idx = next((i for i, t in enumerate(tasks) if t["id"] == task_id), None)
    if row is None or idx is None:
        raise LookupError("Task not found")
    cur = dict(tasks[idx])
    # Edit from the time the person sees, not a stale template time.
    shown = next((t for t in public_tasks(row) if t["id"] == task_id), None)
    if shown:
        cur["time"] = shown["time"]
    fields = clean_task_input(data or {}, partial=True, base=cur)
    tasks = list(tasks)
    tasks[idx] = {**tasks[idx], **fields, "updated_at": datetime.utcnow().isoformat()}
    _set_plan(row, tasks, **_forget_overrides(row.schedule_context or {}, catalog_id(task_id)))
    await _rebuild(user_id, db, "custom_task_edited")
    return {"task": next(t for t in public_tasks(row) if t["id"] == task_id), "schedule_id": str(row.id)}


async def delete_task(user_id: str, db: AsyncSession, task_id: str) -> dict:
    await _lock(user_id, db)
    row = await get_row(user_id, db)
    tasks = plan_of(row)["tasks"]
    if row is None or not any(t["id"] == task_id for t in tasks):
        raise LookupError("Task not found")
    left = [t for t in tasks if t["id"] != task_id]
    _set_plan(row, left, **_forget_overrides(row.schedule_context or {}, catalog_id(task_id)))
    await _rebuild(user_id, db, "custom_task_deleted")
    if not left:
        # Nothing of their own left: retire the row so it never shows up as an
        # empty "program". History stays on the row; adding again revives it.
        row.is_active = False
        row.updated_at = datetime.utcnow()
    return {"deleted": task_id, "remaining": len(left)}


def template_id_from_catalog(cid: Optional[str]) -> Optional[str]:
    s = str(cid or "")
    prefix = CUSTOM_MAXX_ID + "."
    return s[len(prefix):] if s.startswith(prefix) else None
