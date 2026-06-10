"""Server-side event logging into app_events (nudge_sent etc.). Best-effort:
analytics must never break a send path."""

from __future__ import annotations

import logging
from datetime import datetime
from uuid import UUID

logger = logging.getLogger(__name__)


async def log_server_event(user_id: UUID | str, event: str, props: dict | None = None) -> None:
    try:
        from db.sqlalchemy import AsyncSessionLocal
        from models.sqlalchemy_models import AppEvent

        uid = UUID(str(user_id))
        async with AsyncSessionLocal() as db:
            db.add(AppEvent(
                user_id=uid,
                event=event,
                props=props or {},
                source="server",
                created_at=datetime.utcnow(),
            ))
            await db.commit()
    except Exception as e:  # never break the caller
        logger.debug("analytics log failed (non-fatal): %s", e)
