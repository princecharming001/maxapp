"""Admin notifications — in-voice app-wide broadcast (review items 5, 7).

POST /api/admin/notifications/broadcast — admin-only. Sends one in-voice push to
all opted-in users, in each user's LOCAL wake-to-sleep window (queued for the
next in-window slot if they're currently asleep), never exceeding their daily
cap / min-interval, and globally rate-limited so a mass send can't trigger mass
opt-outs.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, func

from db.sqlalchemy import get_db
from middleware.auth_middleware import get_current_admin_user
from models.sqlalchemy_models import User, ScheduledNotification
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from config import settings
from services.apns_service import send_apns_alert, apns_response_should_invalidate_token
from services.notification_copy import (
    CAT_BROADCAST,
    build_push_custom,
    compose,
    passes_taste_bar,
)
from services.notification_planner import (
    PlannerConfig,
    in_window,
    next_in_window_min,
)
from services.notification_prefs import user_allows_proactive_push
import services.notification_state as ns

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin/notifications", tags=["Admin Notifications"])

_BROADCAST_EVENT_TAG = "broadcast_event"


class BroadcastBody(BaseModel):
    body: str = Field(..., min_length=1, max_length=120, description="In-voice one-liner")
    title: str | None = Field(default=None, max_length=48)
    route: str | None = Field(default=None, description="Optional deep-link route override")


def _parse_hhmm(raw, default=(7, 0)) -> tuple[int, int]:
    try:
        s = str(raw).strip().upper()
        if "AM" in s or "PM" in s:
            t = datetime.strptime(s, "%I:%M %p").time()
            return t.hour, t.minute
        parts = s.replace(".", ":").split(":")
        return int(parts[0]), int(parts[1][:2])
    except Exception:
        return default


@router.post("/broadcast")
async def broadcast(
    payload: BroadcastBody,
    admin: dict = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Admin-only in-voice broadcast to all opted-in users."""
    # Taste bar — even admin copy must clear the voice gate.
    if not passes_taste_bar(payload.body) or (payload.title and not passes_taste_bar(payload.title)):
        raise HTTPException(status_code=422, detail="Copy fails the voice/taste bar (no shame, FOMO, or '!!!').")

    now_utc = datetime.now(ZoneInfo("UTC"))

    # Global weekly rate-limit (review item 5): count prior broadcast EVENTS.
    weekly_cap = int(getattr(settings, "notif_broadcast_weekly_cap", 2) or 2)
    since = now_utc - timedelta(days=7)
    event_count = (
        await db.execute(
            select(func.count())
            .select_from(ScheduledNotification)
            .where(
                (ScheduledNotification.category_id == _BROADCAST_EVENT_TAG)
                & (ScheduledNotification.created_at >= since.replace(tzinfo=None))
            )
        )
    ).scalar() or 0
    if event_count >= weekly_cap:
        raise HTTPException(
            status_code=429,
            detail=f"Broadcast rate limit reached ({weekly_cap}/week). Protects against mass opt-outs.",
        )

    # Durable marker for the global cap (one row per broadcast event).
    admin_id = admin.get("id")
    db.add(
        ScheduledNotification(
            user_id=admin_id,
            scheduled_for=now_utc.replace(tzinfo=None),
            message="__broadcast_event__",
            category_id=_BROADCAST_EVENT_TAG,
            status="sent",
            sent_at=now_utc.replace(tzinfo=None),
        )
    )

    cfg = PlannerConfig.from_settings()
    res = await db.execute(select(User).where(User.apns_device_token.isnot(None)))
    users = res.scalars().all()

    sent_now = 0
    queued = 0
    skipped = 0
    for user in users:
        ob = user.onboarding or {}
        if not user_allows_proactive_push(ob, user.apns_device_token):
            skipped += 1
            continue
        # Per-category mute: broadcast is optional and can be muted.
        if CAT_BROADCAST in ns.muted_categories(ob):
            skipped += 1
            continue

        try:
            tz = ZoneInfo(str(ob.get("timezone") or "UTC"))
        except Exception:
            tz = ZoneInfo("UTC")
        local_now = now_utc.astimezone(tz)
        now_min = local_now.hour * 60 + local_now.minute
        wake = _parse_hhmm(ob.get("wake_time"), (7, 0))
        sleep = _parse_hhmm(ob.get("sleep_time"), (23, 0))
        wake_min, sleep_min = wake[0] * 60 + wake[1], sleep[0] * 60 + sleep[1]

        state = ns.get_state(user.profile)
        today_iso = local_now.date().isoformat()
        at_cap = ns.sent_count_today(state, today_iso) >= cfg.cap

        copy = compose(
            CAT_BROADCAST,
            name=((user.profile or {}).get("identity") or {}).get("name"),
            broadcast_title=payload.title,
            broadcast_body=payload.body,
        )
        route = payload.route or copy["route"]
        custom = build_push_custom(CAT_BROADCAST, route, copy["params"])

        deliver_now = in_window(now_min, wake_min, sleep_min) and not at_cap
        if deliver_now:
            ok, http_status = await send_apns_alert(
                (user.apns_device_token or "").strip(), copy["title"], copy["body"], custom=custom
            )
            if apns_response_should_invalidate_token(http_status):
                user.apns_device_token = None
                user.apns_token_updated_at = None
            if ok:
                state = ns.record_delivered(state, local_now)
                state = ns.record_sent(state, today_iso, "cat:broadcast", local_now)
                state = ns.record_broadcast(state, local_now)
                user.profile = ns.put_state(dict(user.profile or {}), state)
                flag_modified(user, "profile")
                sent_now += 1
            else:
                skipped += 1
        else:
            # Queue for the next in-window slot (next wake if asleep / capped).
            slot_min = next_in_window_min(now_min, wake_min, sleep_min)
            base = local_now
            if at_cap or slot_min <= now_min:
                base = local_now + timedelta(days=1)
            send_local = base.replace(
                hour=slot_min // 60, minute=slot_min % 60, second=0, microsecond=0
            )
            db.add(
                ScheduledNotification(
                    user_id=user.id,
                    scheduled_for=send_local.astimezone(ZoneInfo("UTC")).replace(tzinfo=None),
                    message=payload.body,
                    category_id=CAT_BROADCAST,
                    status="pending",
                )
            )
            queued += 1

    await db.commit()
    return {
        "ok": True,
        "recipients": len(users),
        "sent_now": sent_now,
        "queued": queued,
        "skipped": skipped,
        "weekly_events_used": event_count + 1,
        "weekly_cap": weekly_cap,
    }


class InboxSendBody(BaseModel):
    title: str = Field(..., min_length=1, max_length=120)
    body: str = Field(..., min_length=1, max_length=2000)
    user_id: str | None = Field(default=None, description="Single user UUID; omit to send to all users")


@router.post("/inbox")
async def send_inbox_message(
    payload: InboxSendBody,
    admin: dict = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Admin: deliver an in-app inbox message (bell on home) to one or all users."""
    from models.sqlalchemy_models import UserInboxMessage

    admin_id = admin.get("id")
    sender = UUID(str(admin_id)) if admin_id else None

    if payload.user_id:
        try:
            targets = [UUID(payload.user_id)]
        except ValueError:
            raise HTTPException(status_code=422, detail="Bad user_id")
    else:
        res = await db.execute(select(User.id))
        targets = [row[0] for row in res.all()]

    for uid in targets:
        db.add(
            UserInboxMessage(
                user_id=uid,
                title=payload.title.strip(),
                body=payload.body.strip(),
                sender_id=sender,
            )
        )
    await db.commit()
    return {"ok": True, "sent": len(targets)}
