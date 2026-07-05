"""Creator-maxx community channels — domain logic.

Creator channels live in the legacy Forum/ChannelMessage tables (RDS) keyed by
`maxx_id`; membership is an active CreatorSubscription checked against the MAIN
db (the cross-DB pattern api/forums.py already uses — both sessions injected).
Kept FastAPI-free so it's unit-testable and callable from admin provisioning.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from models.rds_models import Forum
from models.sqlalchemy_models import Creator

logger = logging.getLogger(__name__)

# Studio limit — enough for #announcements/#general/#wins-style setups without
# letting a maxx sprawl into a dead-channel graveyard.
MAX_CHANNELS_PER_MAXX = 8

DEFAULT_CHANNELS = [
    {
        "name": "announcements",
        "description": "Updates from the creator. Reply in thread.",
        "icon": "megaphone-outline",
        "who_can_post": "creator",
        "allow_replies": True,
        "order": 0,
    },
    {
        "name": "general",
        "description": "The room. Talk shop with other members.",
        "icon": "chatbubbles-outline",
        "who_can_post": "members",
        "allow_replies": True,
        "order": 1,
    },
]


def channel_slug(maxx_id: str, name: str) -> str:
    """Per-maxx slug ("glowmax-general"). Uniqueness is enforced by the partial
    index uq_forums_maxx_name on (maxx_id, lower(name))."""
    import re
    base = re.sub(r"[^a-z0-9]+", "-", (name or "").lower()).strip("-") or "channel"
    return f"{maxx_id}-{base}"[:80]


async def ensure_default_creator_channels(creator: Creator, rds_db: Optional[AsyncSession]) -> int:
    """Idempotent: create #announcements + #general for a creator maxx that has
    NO channels yet. Called on admin approval and lazily from the member list
    (self-heals creators provisioned before this feature). No-ops gracefully
    when RDS isn't configured. Returns how many were created."""
    if rds_db is None:
        return 0
    try:
        existing = (await rds_db.execute(
            select(func.count()).select_from(Forum).where(
                (Forum.maxx_id == creator.maxx_id) & (Forum.is_archived.isnot(True))
            )
        )).scalar_one() or 0
        if existing:
            return 0
        for spec in DEFAULT_CHANNELS:
            rds_db.add(Forum(
                name=spec["name"],
                slug=channel_slug(creator.maxx_id, spec["name"]),
                description=spec["description"],
                icon=spec["icon"],
                category="creator",
                tags=[],
                order=spec["order"],
                is_admin_only=False,
                maxx_id=creator.maxx_id,
                creator_id=creator.id,
                who_can_post=spec["who_can_post"],
                allow_replies=spec["allow_replies"],
                is_archived=False,
            ))
        await rds_db.commit()
        logger.info("creator channels: defaults created for %s", creator.maxx_id)
        return len(DEFAULT_CHANNELS)
    except Exception:
        logger.exception("ensure_default_creator_channels failed for %s", creator.maxx_id)
        try:
            await rds_db.rollback()
        except Exception:
            pass
        return 0


async def channel_access(
    channel: Forum, user_id: str, db: AsyncSession
) -> tuple[bool, bool, Optional[Creator]]:
    """(has_access, is_owner, creator) for a CREATOR channel (channel.maxx_id
    set). Access = owner, admin, or active subscriber — exactly the feed/course
    rule (creator_service.has_creator_access)."""
    from services import creator_service
    creator = await creator_service.get_creator_by_maxx(channel.maxx_id, db)
    if creator is None:
        return False, False, None
    is_owner = str(creator.user_id) == str(user_id)
    if is_owner:
        return True, True, creator
    has = await creator_service.has_creator_access(user_id, creator, db)
    return has, False, creator


def can_post_top_level(channel: Forum, *, is_owner: bool, is_admin: bool) -> bool:
    """Announcement-only channels: only the owning creator (or an admin) may
    start threads; members can still reply when allow_replies."""
    if (channel.who_can_post or "members") != "creator":
        return True
    return is_owner or is_admin


def channel_public_dict(ch: Forum, message_count: int = 0) -> dict[str, Any]:
    return {
        "id": str(ch.id),
        "name": ch.name,
        "slug": ch.slug,
        "description": ch.description,
        "icon": ch.icon or "chatbubbles-outline",
        "category": ch.category,
        "tags": ch.tags or [],
        "is_admin_only": bool(ch.is_admin_only),
        "maxx_id": ch.maxx_id,
        "who_can_post": ch.who_can_post or "members",
        "allow_replies": bool(ch.allow_replies) if ch.allow_replies is not None else True,
        "is_archived": bool(ch.is_archived),
        "order": int(ch.order or 0),
        "message_count": message_count,
        "created_at": ch.created_at,
    }
