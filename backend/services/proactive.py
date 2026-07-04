"""Proactive coaching — let Max open a conversation with something it noticed.

The learner already computes real-behavior insights (learned wake time vs stated,
best workout window, etc.) and detects slipped tasks, but they mostly live in the
Planner. This surfaces the single most valuable UNSEEN one as a chat opener, so
the coach reaches out ("your mornings really start around 9, not 7 — want the plan
to follow?") instead of waiting to be asked. Returns None when there's nothing
worth interrupting for — proactivity has to be earned, not spammy.
"""
from __future__ import annotations

import logging
from typing import Optional
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


async def get_proactive_nudge(user_id: str, db: AsyncSession) -> Optional[dict]:
    """The one nudge worth opening a chat with, or None. Does not mark it seen —
    the caller marks it once it's actually shown (POST /chat/nudge/{id}/seen)."""
    try:
        from models.sqlalchemy_models import User
        from services.learner import fresh_insights

        user = await db.get(User, UUID(str(user_id)))
        if user is None:
            return None
        insights = await fresh_insights(user, db, limit=1)
        if insights:
            i = insights[0]
            return {
                "id": i["id"],
                "text": i["text"],
                "kind": i.get("kind", "t1"),
                # Most insights are a yes/no "want the plan to follow?" — give chips
                # so acting is one tap. The client sends the chosen text back.
                "choices": ["yes, update my plan", "no, leave it"],
            }
    except Exception as e:  # never break chat open
        logger.debug("proactive nudge skipped: %s", e)
    return None
