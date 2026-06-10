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

from datetime import date
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db import get_db
from middleware.auth_middleware import get_current_user
from models.sqlalchemy_models import UserSchedule

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
