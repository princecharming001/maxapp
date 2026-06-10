"""
Analytics API (spec 0.9) - the lightweight event log. Without this nothing
in the funnel is measurable. Names are allowlisted (no free-form event spam);
props are small JSON bags, never raw user content.
"""
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from db import get_db
from middleware.auth_middleware import get_current_user
from models.sqlalchemy_models import AppEvent

router = APIRouter(prefix="/analytics", tags=["Analytics"])

# The taxonomy. Add here deliberately; dashboards key off these exact names.
ALLOWED_EVENTS = frozenset({
    "reveal_completed",
    "done_tapped",
    "snooze",
    "nudge_sent",
    "nudge_acted",
    "paywall_view",
    "enter",
    "day_closed",
    "lock_in",
    "freeze_used",
    "review_confirmed",
    "onboarding_step",
})

_MAX_BATCH = 25
_MAX_PROPS_KEYS = 12


def _uid(current_user: dict) -> UUID:
    raw = current_user.get("id") or current_user.get("user_id") or current_user.get("sub")
    if raw is None:
        raise HTTPException(status_code=401, detail="No user id on token")
    try:
        return UUID(str(raw))
    except ValueError:
        raise HTTPException(status_code=401, detail="Bad user id")


@router.post("/track")
async def track(
    payload: dict = Body(...),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Batch event ingest. Unknown event names are dropped (counted), never
    stored - the taxonomy stays clean by construction."""
    events = payload.get("events")
    if not isinstance(events, list) or not events:
        raise HTTPException(status_code=422, detail="events must be a non-empty list")
    if len(events) > _MAX_BATCH:
        events = events[:_MAX_BATCH]

    uid = _uid(current_user)
    stored = 0
    dropped = 0
    for e in events:
        name = str((e or {}).get("event") or "").strip()
        if name not in ALLOWED_EVENTS:
            dropped += 1
            continue
        props = (e or {}).get("props")
        if not isinstance(props, dict):
            props = {}
        if len(props) > _MAX_PROPS_KEYS:
            props = dict(list(props.items())[:_MAX_PROPS_KEYS])
        db.add(AppEvent(
            user_id=uid,
            event=name,
            props=props,
            source="app",
            created_at=datetime.utcnow(),
        ))
        stored += 1
    await db.commit()
    return {"stored": stored, "dropped": dropped}
