"""
Planner API - the Today Loop's server surface (one namespace, spec 4.7).

This slice: GET /planner/held-back - the suppression ledger for a given day,
across every active program. Powers the "Held back today" chip on Today: every
task the Merge dropped or deferred, with a human reason, what beat it, and when
it comes back. No silent drops anywhere.

Later slices add: /planner/today, /planner/task/{id}/done|snooze|lock,
/planner/feasibility, /planner/reviews/weekly, /planner/signals.
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db import get_db
from middleware.auth_middleware import get_current_user
from models.sqlalchemy_models import User, UserSchedule

router = APIRouter(prefix="/planner", tags=["Planner"])

# User-facing reason lines per ledger reason_code (voice-guide compliant).
_REASON_LINES = {
    "duplicate": "Covered by another program today.",
    "moved_conflict": "Moved so it doesn't clash with another treatment.",
    "day_full": "Your day was full.",
    "day_full_hard": "Your day was packed. Kept the essentials.",
    "unfittable": "Could not fit this around your day.",
}


def _uid(current_user: dict) -> UUID:
    raw = current_user.get("id") or current_user.get("user_id") or current_user.get("sub")
    if raw is None:
        raise HTTPException(status_code=401, detail="No user id on token")
    try:
        return UUID(str(raw))
    except ValueError:
        raise HTTPException(status_code=401, detail="Bad user id")


def _parse_hm_minutes(s: str | None, default: int) -> int:
    try:
        h, m = str(s).strip().split(":", 1)
        return int(h) * 60 + int(m[:2])
    except (ValueError, AttributeError):
        return default


def _stated_sleep_hours(ob: dict) -> float:
    """Stated sleep duration from onboarding wake/sleep (HealthKit comes P3)."""
    wake = _parse_hm_minutes(ob.get("wake_time"), 7 * 60)
    sleep = _parse_hm_minutes(ob.get("sleep_time"), 23 * 60)
    minutes = (wake - sleep) % (24 * 60)
    return round(minutes / 60.0, 1)


def _today_read(task_count: int, held_back: list[dict], sleep_hours: float) -> dict:
    """Deterministic Whoop-style day verdict (spec 3.2/4.3). Pure function of
    stated inputs - calendar density and real sleep join in later phases.
    Icon + label + color, never color-only."""
    hard_trim = any(e.get("reason_code") == "day_full_hard" for e in held_back)
    if (sleep_hours < 6 and task_count >= 6) or hard_trim:
        return {
            "level": "red",
            "icon": "battery-half-outline",
            "color": "#C0452C",
            "line": "Heavy day. Kept it to the essentials.",
        }
    if held_back or task_count > 8 or sleep_hours < 6.5:
        return {
            "level": "yellow",
            "icon": "partly-sunny-outline",
            "color": "#B07D10",
            "line": "Lighter day. Trimmed to what matters.",
        }
    return {
        "level": "green",
        "icon": "sunny-outline",
        "color": "#3D8B4F",
        "line": "Good runway today. Full plan fits.",
    }


@router.get("/today")
async def planner_today(
    day: str | None = Query(default=None, description="ISO date; defaults to today"),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Today's merged plan + the deterministic today-read + day structure.

    Tasks come from the same master merge the schedule view uses (each task
    carries maxx_id + schedule_id so the existing complete/pending endpoints
    work unchanged). Structure rows (wake / obligations / sleep) come from
    stated onboarding. next-up selection happens client-side in device tz.
    """
    from services.master_schedule import build_master_view

    uid = _uid(current_user)
    try:
        target = date.fromisoformat(day) if day else date.today()
    except ValueError:
        raise HTTPException(status_code=422, detail="Bad date; use YYYY-MM-DD")

    window = await build_master_view(
        user_id=str(uid), db=db, days=1, today_iso=target.isoformat()
    )
    today_entry = window[0] if window else {"tasks": [], "task_count": 0}

    user = await db.get(User, uid)
    ob = dict(user.onboarding or {}) if user else {}

    # Structure rows for the quiet timeline: wake, today's obligations, sleep.
    weekday = target.strftime("%A").lower()
    structure: list[dict[str, Any]] = [
        {"time": ob.get("wake_time") or "07:00", "label": "Wake"},
    ]
    for o in ob.get("obligations") or []:
        days_list = [str(d).lower() for d in (o.get("days") or [])]
        if days_list and weekday not in days_list:
            continue
        structure.append({
            "time": o.get("start") or "09:00",
            "label": str(o.get("label") or "Busy").capitalize(),
            "end": o.get("end"),
        })
    structure.append({"time": ob.get("sleep_time") or "23:00", "label": "Sleep"})

    # Persisted suppression ledger for the day (generation-time merge).
    held_back: list[dict] = []
    res = await db.execute(
        select(UserSchedule).where(
            (UserSchedule.user_id == uid) & (UserSchedule.is_active.is_(True))
        )
    )
    for sched in res.scalars().all():
        for d in sched.days or []:
            if d.get("date") == target.isoformat():
                held_back.extend(d.get("held_back") or [])

    sleep_hours = _stated_sleep_hours(ob)
    locked_in = bool((ob.get("lock_ins") or {}).get(target.isoformat()))

    return {
        "date": target.isoformat(),
        "tasks": today_entry.get("tasks") or [],
        "structure": structure,
        "today_read": _today_read(
            int(today_entry.get("task_count") or 0), held_back, sleep_hours
        ),
        "held_back_count": len(held_back),
        "locked_in": locked_in,
        "streak_armed_freeze": False,  # streak v2 (slice 0.7) fills this in
    }


@router.post("/lock-in")
async def lock_in(
    payload: dict = Body(default={}),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Morning lock-in: the user confirmed today's plan. Idempotent."""
    uid = _uid(current_user)
    try:
        target = (
            date.fromisoformat(str(payload.get("date")))
            if payload.get("date")
            else date.today()
        )
    except ValueError:
        raise HTTPException(status_code=422, detail="Bad date; use YYYY-MM-DD")

    user = await db.get(User, uid)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    ob = dict(user.onboarding or {})
    lock_ins = dict(ob.get("lock_ins") or {})
    lock_ins[target.isoformat()] = datetime.utcnow().isoformat()
    # Keep the map small: only the last 14 days matter.
    if len(lock_ins) > 14:
        for k in sorted(lock_ins)[: len(lock_ins) - 14]:
            lock_ins.pop(k, None)
    ob["lock_ins"] = lock_ins
    user.onboarding = ob  # reassign so SQLAlchemy flushes the JSON change
    await db.commit()
    return {"locked_in": True, "date": target.isoformat()}


@router.get("/held-back")
async def held_back(
    day: str | None = Query(default=None, description="ISO date; defaults to today"),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Everything the Merge held back on `day`, across active programs."""
    uid = _uid(current_user)
    try:
        target = date.fromisoformat(day) if day else date.today()
    except ValueError:
        raise HTTPException(status_code=422, detail="Bad date; use YYYY-MM-DD")

    res = await db.execute(
        select(UserSchedule).where(
            (UserSchedule.user_id == uid) & (UserSchedule.is_active.is_(True))
        )
    )
    items: list[dict[str, Any]] = []
    for sched in res.scalars().all():
        program = sched.maxx_id or sched.course_title or "program"
        for d in sched.days or []:
            if d.get("date") != target.isoformat():
                continue
            for entry in d.get("held_back") or []:
                deferred_to = entry.get("deferred_to")
                returns_on = None
                if isinstance(deferred_to, int):
                    # deferred_to is a day index within this schedule's window.
                    days = sched.days or []
                    if 0 <= deferred_to < len(days):
                        returns_on = days[deferred_to].get("date")
                items.append({
                    "title": entry.get("title"),
                    "program_id": entry.get("program_id") or program,
                    "reason_code": entry.get("reason_code"),
                    "reason": _REASON_LINES.get(
                        entry.get("reason_code") or "", "Held back for today."
                    ),
                    "beaten_by": entry.get("beaten_by"),
                    "returns_on": returns_on,
                    "deferral_age": entry.get("deferral_age", 1),
                })
    return {"date": target.isoformat(), "items": items}
