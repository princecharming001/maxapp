"""
Notifications API — admin / test outbound messages via Sendblue (iMessage/SMS).
"""

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from db.sqlalchemy import get_db
from middleware import get_current_user
from middleware.auth_middleware import get_current_admin_user
from models.sqlalchemy_models import User
from services.sendblue_service import sendblue_service
from services.notification_copy import OPTIONAL_CATEGORIES
import services.notification_state as ns

router = APIRouter(prefix="/notifications", tags=["Notifications"])


class SendMessageRequest(BaseModel):
    phone: str
    message: str


class TestMessageRequest(BaseModel):
    phone: str


@router.post("/send")
async def send_whatsapp_message(
    request: SendMessageRequest,
    current_user: dict = Depends(get_current_admin_user)
):
    """Admin: send a custom text to any number (Sendblue iMessage/SMS)."""
    success = await sendblue_service.send_whatsapp(request.phone, request.message)
    if not success:
        raise HTTPException(
            status_code=500,
            detail="Failed to send message. Check Sendblue API keys and SENDBLUE_FROM_NUMBER.",
        )
    return {"success": True, "message": "Message sent"}


class CategoryPrefsBody(BaseModel):
    prefs: dict[str, bool] = Field(..., description="optional-category -> enabled. e.g. {'tip': false}")


@router.get("/category-prefs")
async def get_category_prefs(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Per-category notification toggles (optional categories only). Essential
    task/plan reminders are governed by the SMS/app channel toggle, not here."""
    user = await db.get(User, UUID(current_user["id"]))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    saved = (user.onboarding or {}).get("notif_category_prefs") or {}
    prefs = {cat: bool(saved.get(cat, True)) for cat in sorted(OPTIONAL_CATEGORIES)}
    return {"prefs": prefs}


@router.patch("/category-prefs")
async def patch_category_prefs(
    body: CategoryPrefsBody,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Mute/unmute optional categories (tips, broadcasts, streak nudges, etc).
    Essential categories can't be muted here, so they're ignored if passed."""
    user = await db.get(User, UUID(current_user["id"]))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    ob = dict(user.onboarding or {})
    for cat, enabled in body.prefs.items():
        if cat in OPTIONAL_CATEGORIES:
            ob = ns.set_category_pref(ob, cat, bool(enabled))
    user.onboarding = ob
    flag_modified(user, "onboarding")
    user.updated_at = datetime.utcnow()
    await db.commit()
    saved = ob.get("notif_category_prefs") or {}
    return {"prefs": {cat: bool(saved.get(cat, True)) for cat in sorted(OPTIONAL_CATEGORIES)}}


@router.post("/opened")
async def record_notification_opened(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Mobile reports a notification tap. Feeds adaptive backoff (opens vs
    delivered) and counts as app activity for foreground suppression."""
    user = await db.get(User, UUID(current_user["id"]))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    now = datetime.utcnow()
    state = ns.record_opened(ns.get_state(user.profile), now)
    user.profile = ns.put_state(dict(user.profile or {}), state)
    flag_modified(user, "profile")
    await db.commit()
    return {"ok": True}


@router.post("/activity")
async def record_app_activity(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Mobile heartbeat on app foreground. Suppresses pushes while/just-after
    the user is in the app (review item 2)."""
    user = await db.get(User, UUID(current_user["id"]))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    state = ns.mark_app_active(ns.get_state(user.profile), datetime.utcnow())
    user.profile = ns.put_state(dict(user.profile or {}), state)
    flag_modified(user, "profile")
    await db.commit()
    return {"ok": True}


@router.post("/test")
async def send_test_message(
    request: TestMessageRequest,
    current_user: dict = Depends(get_current_user)
):
    """Send a test message — destination locked to the caller's own phone number
    to prevent arbitrary SMS delivery to third-party numbers (P0-8)."""
    caller_phone = (current_user.get("phone_number") or "").strip()
    if not caller_phone:
        raise HTTPException(
            status_code=400,
            detail="No phone number on your account. Add one in Settings first.",
        )
    # Strip non-digit chars for comparison (E.164 vs local format both work)
    def _digits(s: str) -> str:
        return "".join(c for c in s if c.isdigit())

    if _digits(request.phone) != _digits(caller_phone):
        raise HTTPException(
            status_code=403,
            detail="Test messages can only be sent to your own phone number.",
        )
    success = await sendblue_service.send_whatsapp(
        caller_phone,
        "🧪 Test from Max — Sendblue iMessage/SMS is connected. ✅",
    )
    if not success:
        raise HTTPException(
            status_code=500,
            detail="Failed to send. Check Sendblue credentials and that the recipient can receive iMessage/SMS.",
        )
    return {"success": True, "message": "Test message sent"}
