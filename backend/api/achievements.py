"""Achievements API — the user-facing surface over services.achievements.

    GET  /api/achievements          full catalog + per-user earned/seen/progress
    POST /api/achievements/seen     mark earn-moments as celebrated

New achievements are AWARDED inline on the day-state endpoint
(GET /api/schedules/active/full -> newly_earned_achievements), so the client
can fire a celebration the moment one is earned. These endpoints are for the
Achievements screen + dismissing a celebration.
"""

from __future__ import annotations

import logging
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from db import get_db
from middleware import get_current_user
from models.sqlalchemy_models import User
from services import achievements as ach
from services.schedule_service import schedule_service
from services.schedule_streak import local_today_date, streak_payload_from_profile

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/achievements", tags=["Achievements"])


async def _streak_and_schedules(db: AsyncSession, user: User):
    schedules = await schedule_service.get_all_active_schedules(str(user.id), db)
    streak = streak_payload_from_profile(
        dict(user.profile or {}), local_today_date(dict(user.onboarding or {}))
    )
    return streak, schedules


@router.get("")
async def list_achievements(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """The whole badge wall: every achievement with the user's earned/seen state
    and locked-progress toward the next ones."""
    user = await db.get(User, UUID(current_user["id"]))
    if user is None:
        return {"achievements": [], "earned_count": 0, "total": len(ach.CATALOG), "categories": []}
    streak, schedules = await _streak_and_schedules(db, user)
    return await ach.list_for_user(db, user, streak=streak, schedules=schedules)


class SeenBody(BaseModel):
    codes: list[str] = Field(default_factory=list)


@router.post("/seen")
async def mark_seen(
    body: SeenBody,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Mark earn-moments celebrated so the overlay doesn't re-fire."""
    user = await db.get(User, UUID(current_user["id"]))
    n = await ach.mark_seen(db, user, body.codes or [])
    return {"ok": True, "updated": n}
