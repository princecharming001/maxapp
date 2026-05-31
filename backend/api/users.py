"""
Users API - Profile and Onboarding
"""

import base64
import logging
import math
import re
from fastapi import APIRouter, HTTPException, status, Depends, UploadFile, File, Request, Form
from datetime import datetime, timedelta, timezone
from typing import List, Optional
from pydantic import BaseModel, Field
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import and_, select, delete, update

logger = logging.getLogger(__name__)


def _utcnow() -> datetime:
    """Timezone-aware UTC now for TIMESTAMPTZ columns (asyncpg-safe)."""
    return datetime.now(timezone.utc)


def _as_utc_aware(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


from db import get_db, get_rds_db
from middleware import get_current_user
from services.storage_service import storage_service, delete_by_url
from models.user import (
    UserResponse,
    OnboardingData,
    UserProfile,
    GoalType,
    ExperienceLevel,
    AccountUpdateRequest,
    BlockUserRequest,
    DeleteAccountRequest,
)
from models.sqlalchemy_models import User, UserProgressPhoto
from models.rds_models import ChannelMessage
from services.sendblue_service import normalize_phone, phone_lookup_candidates
from api.auth import verify_password
from config import settings

router = APIRouter(prefix="/users", tags=["Users"])


class ProgressPhotoBase64Body(BaseModel):
    """Request body for progress photo upload via base64 (avoids multipart issues on RN)."""
    image_base64: str
    face_rating: Optional[float] = None


class SendblueConnectCompleteBody(BaseModel):
    """User preferences when finishing the Sendblue connect screen."""
    sms_opt_in: Optional[bool] = None
    app_notifications_opt_in: Optional[bool] = None


class PushTokenBody(BaseModel):
    """Native APNs device token (hex)."""
    token: str = Field(..., min_length=32, max_length=512)


class NotificationChannelsPatchBody(BaseModel):
    """SMS vs app (APNs) reminder preferences."""
    sms_opt_in: bool
    app_notifications_opt_in: bool


def _normalize_apns_device_token(raw: str) -> str:
    s = re.sub(r"[\s<>]", "", (raw or "").strip()).lower()
    if not re.fullmatch(r"[0-9a-f]+", s):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid device token format")
    if len(s) < 64:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Device token too short")
    return s


@router.get("/me/products")
async def get_my_products(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Surface every catalog product relevant to this user's onboarding +
    active maxxes. Used by the Settings → My Products screen.

    Strategy:
      1. Pull the user's onboarding + active schedules.
      2. Derive a set of (module, concerns) pairs from those signals
         (e.g. skinmax + ['acne','dryness'], fitmax + ['muscle_gain']).
      3. Run each pair through find_products() (catalog filter + fact
         filter for vegan / fragrance-allergy / etc).
      4. Dedupe by id, return the union as a list of compact dicts the
         mobile client can render directly.
    Fast (<50ms typical) — pure in-process, no network.
    """
    user_uuid = UUID(current_user["id"])
    user = await db.get(User, user_uuid)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    ob = dict(user.onboarding or {})
    facts = (
        ob.get("user_facts")
        or (user.persistent_context or {}).get("user_facts") if hasattr(user, "persistent_context") else None
    ) or {}

    # Build (module, concerns) pairs from onboarding signals.
    pairs: list[tuple[str, list[str]]] = []
    if ob.get("primary_skin_concern"):
        pairs.append(("skinmax", [str(ob["primary_skin_concern"])]))
    if ob.get("secondary_skin_concern") and ob["secondary_skin_concern"] != "none":
        pairs.append(("skinmax", [str(ob["secondary_skin_concern"])]))
    if str(ob.get("hair_current_loss") or "").startswith("yes"):
        pairs.append(("hairmax", ["hair_loss", "regrowth"]))
    elif ob.get("hair_current_loss") == "starting":
        pairs.append(("hairmax", ["hair_loss"]))
    if ob.get("fitmax_primary_goal"):
        goal = str(ob["fitmax_primary_goal"])
        concern_map = {
            "muscle": ["muscle_gain", "protein"],
            "lean":   ["recovery", "protein"],
            "both":   ["muscle_gain", "recovery", "protein"],
        }
        pairs.append(("fitmax", concern_map.get(goal, ["protein"])))
    if any(g in (ob.get("goals") or []) for g in ("heightmax", "height")):
        pairs.append(("heightmax", ["posture", "decompression"]))
    if any(g in (ob.get("goals") or []) for g in ("bonemax", "jaw")):
        pairs.append(("bonemax", ["jaw_training", "masseter"]))
    # General fallback so the page isn't empty for new users.
    if not pairs:
        pairs = [("skinmax", []), ("fitmax", [])]

    try:
        from services.product_catalog import find_products
        seen: set[str] = set()
        products: list[dict] = []
        for module, concerns in pairs:
            hits = find_products(
                module=module,
                concerns=concerns or None,
                user_facts=facts,
                limit=4,
            )
            for p in hits:
                if p.id in seen:
                    continue
                seen.add(p.id)
                products.append({
                    "id": p.id,
                    "name": p.name,
                    "brand": p.brand,
                    "module": p.module,
                    "url": p.display_url,
                    "price_tier": p.price_tier,
                    "rationale": p.rationale,
                    "tags": p.tags,
                })
        return {"products": products}
    except Exception as e:
        logger.warning("[my-products] catalog read failed: %s", e)
        return {"products": []}


@router.get("/me", response_model=UserResponse)
async def get_profile(current_user: dict = Depends(get_current_user)):
    """
    Get current user's profile
    """
    ob_raw = dict(current_user.get("onboarding") or {})
    if not ob_raw.get("main_app_tour_completed"):
        cutoff = settings.main_app_tour_cutoff_at
        created = current_user.get("created_at")
        if cutoff and created and _as_utc_aware(created) < _as_utc_aware(cutoff):
            ob_raw["main_app_tour_completed"] = True

    return UserResponse(
        id=current_user["id"],
        email=current_user["email"],
        first_name=current_user.get("first_name"),
        last_name=current_user.get("last_name"),
        username=current_user.get("username"),
        last_username_change=current_user.get("last_username_change"),
        created_at=current_user["created_at"],
        is_paid=current_user.get("is_paid", False),
        subscription_tier=current_user.get("subscription_tier"),
        subscription_status=current_user.get("subscription_status"),
        subscription_end_date=current_user.get("subscription_end_date"),
        onboarding=OnboardingData(**ob_raw),
        profile=UserProfile(**current_user.get("profile", {})),
        first_scan_completed=current_user.get("first_scan_completed", False),
        is_admin=current_user.get("is_admin", False),
        is_scan_user=current_user.get("is_scan_user", False),
        phone_number=current_user.get("phone_number"),
        has_apns_token=current_user.get("has_apns_token", False),
        coaching_tone=current_user.get("coaching_tone") or "default",
    )


@router.post("/push-token")
async def register_push_token(
    body: PushTokenBody,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Store iOS APNs device token for server-driven push."""
    if not current_user.get("is_paid"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Subscription required")
    user_uuid = UUID(current_user["id"])
    user = await db.get(User, user_uuid)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    normalized = _normalize_apns_device_token(body.token)
    user.apns_device_token = normalized
    user.apns_token_updated_at = _utcnow()
    user.updated_at = datetime.utcnow()
    await db.commit()
    return {"message": "ok"}


@router.post("/test-push")
async def test_push_notification(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Send a test push notification to the current user's stored APNs token."""
    from services.apns_service import send_apns_alert, apns_configured, _apns_jwt, apns_response_should_invalidate_token

    if not apns_configured():
        raise HTTPException(status_code=503, detail="Push notifications are not configured on this server")

    try:
        _apns_jwt()
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"APNs key is misconfigured: {e}")

    user_uuid = UUID(current_user["id"])
    user = await db.get(User, user_uuid)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    token = (user.apns_device_token or "").strip()
    if not token:
        raise HTTPException(status_code=400, detail="No push token registered for this device. Make sure notifications are enabled.")

    ok, http_code = await send_apns_alert(
        token,
        "Max",
        "Push notifications are working! You're all set.",
        badge=1,
    )
    if ok:
        return {"message": "Test notification sent", "apns_status": http_code, "token_prefix": token[:8]}
    if apns_response_should_invalidate_token(http_code):
        user.apns_device_token = None
        user.apns_token_updated_at = None
        await db.commit()
        raise HTTPException(
            status_code=400,
            detail="Your push token was rejected by Apple (expired or invalid). "
                   "Go to Notification preferences, toggle off and back on, then try again.",
        )
    raise HTTPException(status_code=502, detail=f"APNs delivery failed (HTTP {http_code}). Check server logs.")


@router.delete("/push-token")
async def clear_push_token(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove stored APNs token (opt out of push on this device)."""
    user_uuid = UUID(current_user["id"])
    user = await db.get(User, user_uuid)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.apns_device_token = None
    user.apns_token_updated_at = None
    user.updated_at = datetime.utcnow()
    await db.commit()
    return {"message": "ok"}


@router.patch("/notification-channels")
async def patch_notification_channels(
    body: NotificationChannelsPatchBody,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update SMS vs app notification preferences (Profile). At least one channel must stay on."""
    if not body.sms_opt_in and not body.app_notifications_opt_in:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Choose at least one: SMS or app notifications.",
        )
    if not current_user.get("is_paid"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Subscription required")
    user_uuid = UUID(current_user["id"])
    user = await db.get(User, user_uuid)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    ob = dict(user.onboarding or {})
    ob["sendblue_sms_opt_in"] = body.sms_opt_in
    ob["app_notifications_opt_in"] = body.app_notifications_opt_in
    user.onboarding = ob
    if not body.app_notifications_opt_in:
        user.apns_device_token = None
        user.apns_token_updated_at = None
    user.updated_at = datetime.utcnow()
    await db.commit()
    return {"message": "ok"}


class CoachingToneBody(BaseModel):
    tone: str = Field(..., description="default | hardcore | gentle | influencer")


class ResponseLengthBody(BaseModel):
    length: str = Field(..., description="concise | medium | detailed")


RESPONSE_LENGTH_VALUES = {"concise", "medium", "detailed"}


@router.patch("/response-length")
async def patch_response_length(
    body: ResponseLengthBody,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Set the user's preferred chat response length. Takes effect on the next chat turn."""
    length = (body.length or "").strip().lower()
    if length not in RESPONSE_LENGTH_VALUES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"length must be one of {sorted(RESPONSE_LENGTH_VALUES)}",
        )
    user_uuid = UUID(current_user["id"])
    user = await db.get(User, user_uuid)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    ob = dict(user.onboarding or {})
    ob["response_length"] = length
    user.onboarding = ob
    user.updated_at = datetime.utcnow()
    await db.commit()
    return {"message": "ok", "length": length}


@router.patch("/coaching-tone")
async def patch_coaching_tone(
    body: CoachingToneBody,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Set the user's preferred coaching tone. Takes effect on the next chat turn."""
    allowed = {"default", "hardcore", "gentle", "influencer"}
    tone = (body.tone or "").strip().lower()
    if tone not in allowed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"tone must be one of {sorted(allowed)}",
        )
    user_uuid = UUID(current_user["id"])
    user = await db.get(User, user_uuid)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.coaching_tone = tone
    user.updated_at = datetime.utcnow()
    await db.commit()
    return {"message": "ok", "tone": tone}


@router.post("/post-subscription-onboarding/dismiss")
async def dismiss_post_subscription_onboarding(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Clear the flag that triggers post-pay FaceScan results → module select flow."""
    user_uuid = UUID(current_user["id"])
    user = await db.get(User, user_uuid)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    ob = dict(user.onboarding or {})
    ob["post_subscription_onboarding"] = False
    user.onboarding = ob
    user.updated_at = datetime.utcnow()
    await db.commit()
    return {"message": "ok"}


@router.post("/main-app-tour/complete")
async def complete_main_app_tour(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Mark the post-pay spotlight tour as completed. Idempotent."""
    if not current_user.get("is_paid"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Subscription required")
    user_uuid = UUID(current_user["id"])
    user = await db.get(User, user_uuid)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    ob = dict(user.onboarding or {})
    ob["main_app_tour_completed"] = True
    user.onboarding = ob
    user.updated_at = datetime.utcnow()
    await db.commit()
    return {"message": "ok"}


@router.post("/dev/reset")
async def dev_reset_state(
    body: dict,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """DEBUG ONLY: bulk-reset user flags so a single account can replay
    paywall / scan / onboarding without creating a new account.

    Body (all optional, all default False):
      {
        "onboarding": bool,    # clear user.onboarding.completed + reset to {}
        "scan":       bool,    # flip first_scan_completed → false
        "subscription": bool,  # flip is_paid → false, subscription_tier → null
        "all":        bool,    # equivalent to setting all three
      }

    Returns the new state of the affected flags so the client can sync.
    Gated by `settings.debug` — 404s in production. Requires auth so a
    rogue caller can only nuke their own account.
    """
    if not settings.debug:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    user_uuid = UUID(current_user["id"])
    user = await db.get(User, user_uuid)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    do_all = bool(body.get("all"))
    do_onb = do_all or bool(body.get("onboarding"))
    do_scan = do_all or bool(body.get("scan"))
    do_sub = do_all or bool(body.get("subscription"))

    if do_onb:
        # Wipe onboarding entirely so the user re-runs the questions.
        # Preserve nothing — fresh slate is the dev tool's whole point.
        user.onboarding = {}
        user.questionnaire_v2_completed = None
    if do_scan:
        user.first_scan_completed = False
        user.facial_scan_summary = None
    if do_sub:
        user.is_paid = False
        user.subscription_tier = None

    user.updated_at = datetime.utcnow()
    await db.commit()
    return {
        "message": "ok",
        "reset": {
            "onboarding": do_onb,
            "scan": do_scan,
            "subscription": do_sub,
        },
        "state": {
            "is_paid": bool(user.is_paid),
            "subscription_tier": user.subscription_tier,
            "first_scan_completed": bool(user.first_scan_completed),
            "onboarding_completed": bool((user.onboarding or {}).get("completed")),
        },
    }


@router.post("/dev/mark-scan-completed")
async def dev_mark_scan_completed(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """DEBUG ONLY: flip first_scan_completed → true without uploading
    a real scan. Lets devs jump past the scan gate to test downstream
    screens (paywall, module select, home)."""
    if not settings.debug:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    user_uuid = UUID(current_user["id"])
    user = await db.get(User, user_uuid)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.first_scan_completed = True
    user.updated_at = datetime.utcnow()
    await db.commit()
    return {"message": "ok", "first_scan_completed": True}


@router.post("/sendblue-connect/dev-skip-engage")
async def dev_skip_sendblue_engage_only(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """DEBUG ONLY: mark Sendblue engaged without completing the connect step (for notification picker UX)."""
    if not settings.debug:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    user_uuid = UUID(current_user["id"])
    user = await db.get(User, user_uuid)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    ob = dict(user.onboarding or {})
    ob["sendblue_sms_engaged"] = True
    user.onboarding = ob
    user.updated_at = datetime.utcnow()
    await db.commit()
    return {"message": "ok"}


@router.post("/sendblue-connect/complete")
async def complete_sendblue_connect(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    request: Request = None,
    prefs: Optional[SendblueConnectCompleteBody] = None,
):
    """Mark post-pay Sendblue intro done. Idempotent: safe to call multiple times."""
    user_uuid = UUID(current_user["id"])
    user = await db.get(User, user_uuid)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    ob = dict(user.onboarding or {})
    already_completed = ob.get("sendblue_connect_completed") is True
    dev_skip = False
    try:
        if request is not None:
            dev_skip = str(request.headers.get("x-dev-skip-sendblue", "")).strip() == "1"
    except Exception:
        dev_skip = False
    user_is_skipping_sms = prefs is not None and prefs.sms_opt_in is False
    if (
        ob.get("sendblue_sms_engaged") is not True
        and not already_completed
        and not (settings.debug and dev_skip)
        and not user_is_skipping_sms
    ):
        raise HTTPException(
            status_code=400,
            detail="We have not received a message from your number yet. Text the Max line from the phone on your account, wait a few seconds, then try again.",
        )
    # Dev-only escape hatch so local/dev builds can proceed without texting.
    if settings.debug and dev_skip:
        ob["sendblue_sms_engaged"] = True

    # Store user opt-in/out preferences (defaults stay whatever was already on file).
    if prefs is not None:
        if prefs.sms_opt_in is not None:
            ob["sendblue_sms_opt_in"] = prefs.sms_opt_in
        if prefs.app_notifications_opt_in is not None:
            ob["app_notifications_opt_in"] = prefs.app_notifications_opt_in

    ob["sendblue_connect_completed"] = True
    user.onboarding = ob
    user.updated_at = datetime.utcnow()
    await db.commit()
    return {"message": "ok"}


@router.post("/onboarding")
async def save_onboarding(
    data: OnboardingData,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Save onboarding questionnaire answers
    """
    user_uuid = UUID(current_user["id"])
    user = await db.get(User, user_uuid)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Update onboarding data (normalize body metrics to chosen unit system)
    onboarding_data = data.model_dump()
    unit = str(onboarding_data.get("unit_system") or "imperial").strip().lower()
    height = onboarding_data.get("height")
    weight = onboarding_data.get("weight")

    def _round1(x):
        try:
            return round(float(x), 1)
        except Exception:
            return None

    height_f = _round1(height) if height is not None else None
    weight_f = _round1(weight) if weight is not None else None

    # Canonical always-metric values
    height_cm = None
    weight_kg = None

    if unit == "metric":
        # height: cm, weight: kg
        height_cm = height_f
        weight_kg = weight_f
        onboarding_data["height"] = height_cm
        onboarding_data["weight"] = weight_kg
    else:
        # imperial: height: inches, weight: lbs
        # Back-compat heuristics: older clients may still send cm/kg even when unit_system=imperial.
        # - Height: if > 120, it's almost certainly cm; convert to inches.
        # - Weight: if < 120, it's likely kg for most adults; convert to lbs.
        inches = height_f
        lbs = weight_f
        if inches is not None and inches > 120:
            inches = _round1(inches / 2.54)
        if lbs is not None and lbs < 120:
            lbs = _round1(lbs * 2.20462)

        onboarding_data["height"] = inches
        onboarding_data["weight"] = lbs
        height_cm = _round1(inches * 2.54) if inches is not None else None
        weight_kg = _round1(lbs * 0.453592) if lbs is not None else None

    onboarding_data["height_cm"] = height_cm
    onboarding_data["weight_kg"] = weight_kg
    onboarding_data["completed"] = True
    user.onboarding = onboarding_data
    user.updated_at = datetime.utcnow()
    await db.flush()

    # Editing lifestyle (wake/sleep/work hours, workout time, get-ready time)
    # must propagate to the user's live schedules immediately — otherwise the
    # precise timings the user just set wouldn't take effect until they touch
    # the chatbot. Skeleton re-expansion is pure-Python (<100ms) and only
    # writes when something actually changed, so this is cheap to do eagerly.
    try:
        from services.schedule_runtime import regenerate_active_schedules
        from services.user_context_service import invalidate as _invalidate_ctx
        _invalidate_ctx(str(user_uuid))
        await regenerate_active_schedules(
            user_id=str(user_uuid), db=db, reason="edit_lifestyle",
        )
    except Exception as e:
        logger.warning("post-onboarding schedule regen failed (non-fatal): %s", e)

    await db.commit()

    return {"message": "Onboarding completed", "data": onboarding_data}


@router.post("/onboarding/anonymous")
async def save_onboarding_anonymous(data: OnboardingData):
    """
    Public onboarding endpoint used before login/signup.

    This does NOT persist anything by itself. It simply validates and
    echoes back the onboarding payload so the client can carry it through
    signup and attach it to the real user account afterwards.
    """
    # Ensure completed flag is set on the payload the same way as the authed endpoint
    onboarding_data = data.model_dump()
    onboarding_data["completed"] = True
    return {"message": "Onboarding captured", "data": onboarding_data}


# --------------------------------------------------------------------------- #
#  Planner chatbot — natural-language edits to the weekly daily-rhythm plan   #
# --------------------------------------------------------------------------- #

_WEEKDAY_KEYS = ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")
_HHMM_RE = re.compile(r"^([01]?\d|2[0-3]):([0-5]\d)$")
_DEFAULT_TIME_FIELDS = (
    "wake_time", "sleep_time", "get_ready_time",
    "preferred_workout_time", "work_start", "work_end",
)


def _norm_hhmm(v) -> Optional[str]:
    """Coerce a value to canonical 'HH:MM' 24h, or None if not a valid clock."""
    if not isinstance(v, str):
        return None
    m = _HHMM_RE.match(v.strip())
    if not m:
        return None
    return f"{int(m.group(1)):02d}:{m.group(2)}"


def _norm_obligations(raw) -> Optional[List[dict]]:
    """Normalize an obligations list — drop malformed / zero-length entries."""
    if not isinstance(raw, list):
        return None
    out: List[dict] = []
    for it in raw:
        if not isinstance(it, dict):
            continue
        s = _norm_hhmm(it.get("start"))
        e = _norm_hhmm(it.get("end"))
        if not s or not e or e <= s:
            continue
        lbl = (str(it.get("label") or "busy").strip() or "busy")[:40]
        out.append({"label": lbl, "start": s, "end": e})
    return out


def _norm_day_fields(raw) -> dict:
    """Normalize one weekday-override dict to only valid, known fields."""
    if not isinstance(raw, dict):
        return {}
    out: dict = {}
    for k in _DEFAULT_TIME_FIELDS:
        v = _norm_hhmm(raw.get(k))
        if v:
            out[k] = v
    ws = raw.get("work_schedule")
    if isinstance(ws, str) and ws.strip().lower() in ("fixed", "flexible"):
        out["work_schedule"] = ws.strip().lower()
    if "obligations" in raw:
        obs = _norm_obligations(raw.get("obligations"))
        if obs is not None:
            out["obligations"] = obs
    return out


class PlannerChatBody(BaseModel):
    instruction: str = Field(..., description="Natural-language change request for the weekly plan.")


@router.post("/planner/chat")
async def planner_chat(
    body: PlannerChatBody,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Apply a natural-language edit to the user's weekly daily-rhythm plan.

    The user types something like "I sleep in until 10 on weekends" or
    "add gym 6-7pm on Mon, Wed, Fri" and an LLM translates it into a
    structured diff over the default timings + per-weekday overrides. We
    merge the diff into onboarding (presence-based, so unmentioned fields are
    never touched), persist via the same path as save_onboarding (regenerate
    live schedules + invalidate coach context), and return the new state.
    """
    import asyncio
    import json

    instruction = (body.instruction or "").strip()
    if not instruction:
        raise HTTPException(status_code=400, detail="instruction is required")

    user_uuid = UUID(current_user["id"])
    user = await db.get(User, user_uuid)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    prev = dict(user.onboarding or {})
    cur_defaults = {
        k: prev.get(k) for k in (*_DEFAULT_TIME_FIELDS, "work_schedule") if prev.get(k)
    }
    if isinstance(prev.get("obligations"), list):
        cur_defaults["obligations"] = prev["obligations"]
    cur_weekly = prev.get("weekly_timings") if isinstance(prev.get("weekly_timings"), dict) else {}

    prompt = (
        "You edit a user's WEEKLY daily-rhythm planner for a self-improvement app.\n"
        "The user has DEFAULT timings that apply every day, plus optional PER-WEEKDAY\n"
        "overrides for days that differ (e.g. a weekend lie-in, a Mon/Wed/Fri class).\n\n"
        "Fields (times are \"HH:MM\" 24-hour):\n"
        "- wake_time, sleep_time, get_ready_time (shower/get ready), preferred_workout_time\n"
        "- work_schedule (\"fixed\" or \"flexible\"), work_start, work_end\n"
        "- obligations: list of {label, start, end} fixed commitments to plan around\n\n"
        f"CURRENT DEFAULTS:\n{json.dumps(cur_defaults, ensure_ascii=False)}\n\n"
        f"CURRENT PER-WEEKDAY OVERRIDES:\n{json.dumps(cur_weekly, ensure_ascii=False)}\n\n"
        f"USER REQUEST: \"{instruction}\"\n\n"
        "Return STRICT JSON only (no markdown, no commentary):\n"
        "{\n"
        "  \"defaults\": { ...only default-level fields you are CHANGING... },\n"
        "  \"weekly_timings\": { \"saturday\": { ...fields... } ...only weekdays you are CHANGING... },\n"
        "  \"summary\": \"<one short, friendly sentence describing what you changed>\"\n"
        "}\n\n"
        "Rules:\n"
        "- Include ONLY the fields/days you are CHANGING; leave everything else out.\n"
        "- To CLEAR a field set it to null. To CLEAR a day's overrides set that day to {}.\n"
        "- Weekday keys are lowercase full names monday..sunday. \"weekday\"=mon–fri, \"weekend\"=sat+sun.\n"
        "- If a change applies to EVERY day, put it in \"defaults\", not each weekday.\n"
        "- Never invent commitments the user didn't mention. Keep obligation labels ≤3 words.\n"
        "- If the request isn't about timings or is unclear, return empty defaults/weekly_timings and say so in summary.\n"
    )

    parsed: dict = {}
    try:
        from services.llm_sync import async_llm_json_response
        raw = await asyncio.wait_for(async_llm_json_response(prompt, max_tokens=1200), timeout=30)
        loaded = json.loads(raw)
        if isinstance(loaded, dict):
            parsed = loaded
    except Exception as e:
        logger.warning("planner_chat LLM failed: %s", e)
        raise HTTPException(status_code=502, detail="Couldn't process that — try rephrasing.")

    summary = str(parsed.get("summary") or "").strip()[:240] or "Updated your plan."

    # --- Merge the diff into onboarding (presence-based: unmentioned = keep) --
    d = parsed.get("defaults") if isinstance(parsed.get("defaults"), dict) else {}
    changed = False
    for key in _DEFAULT_TIME_FIELDS:
        if key in d:
            prev[key] = _norm_hhmm(d.get(key))  # valid value or None (clear)
            changed = True
    if "work_schedule" in d:
        ws = d.get("work_schedule")
        prev["work_schedule"] = ws if (isinstance(ws, str) and ws.strip().lower() in ("fixed", "flexible")) else None
        if prev["work_schedule"]:
            prev["work_schedule"] = prev["work_schedule"].strip().lower()
        changed = True
    if "obligations" in d:
        prev["obligations"] = _norm_obligations(d.get("obligations")) or None
        changed = True

    wk_in = parsed.get("weekly_timings") if isinstance(parsed.get("weekly_timings"), dict) else {}
    wk_out = dict(cur_weekly)
    for day in _WEEKDAY_KEYS:
        if day not in wk_in:
            continue
        cleaned = _norm_day_fields(wk_in.get(day))
        if cleaned:
            wk_out[day] = cleaned
        else:
            wk_out.pop(day, None)  # explicit {} → clear this day's override
        changed = True
    prev["weekly_timings"] = wk_out or None

    if not changed:
        # Nothing actionable — return current state untouched, with the
        # model's explanation (e.g. "I couldn't tell which day you meant").
        return {
            "message": "No changes applied",
            "summary": summary,
            "defaults": cur_defaults,
            "weekly_timings": cur_weekly or None,
            "changed": False,
        }

    prev["completed"] = True
    user.onboarding = prev
    user.updated_at = datetime.utcnow()
    await db.flush()

    # Propagate to live schedules + coach context, same as save_onboarding.
    try:
        from services.schedule_runtime import regenerate_active_schedules
        from services.user_context_service import invalidate as _invalidate_ctx
        _invalidate_ctx(str(user_uuid))
        await regenerate_active_schedules(user_id=str(user_uuid), db=db, reason="planner_chat")
    except Exception as e:
        logger.warning("planner_chat schedule regen failed (non-fatal): %s", e)

    await db.commit()

    return {
        "message": "Plan updated",
        "summary": summary,
        "defaults": {k: prev.get(k) for k in (*_DEFAULT_TIME_FIELDS, "work_schedule", "obligations") if prev.get(k)},
        "weekly_timings": prev.get("weekly_timings"),
        "changed": True,
    }


@router.post("/me/avatar")
async def upload_avatar(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Upload profile picture
    """
    content = await file.read()

    user_uuid = UUID(current_user["id"])
    user = await db.get(User, user_uuid)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    try:
        if user.profile and user.profile.get("avatar_url"):
            delete_by_url(user.profile.get("avatar_url"))
    except Exception as e:
        logger.warning("Avatar cleanup failed: %s", e)

    avatar_url = await storage_service.upload_image(
        content,
        current_user["id"],
        image_type="avatar"
    )

    if not avatar_url:
        raise HTTPException(status_code=500, detail="Failed to upload image")

    # Assign a new dict to ensure SQLAlchemy tracks JSON changes
    current_profile = dict(user.profile or {})
    current_profile["avatar_url"] = avatar_url
    user.profile = current_profile
    user.updated_at = datetime.utcnow()
    await db.commit()
    
    return {"avatar_url": avatar_url}


@router.put("/profile")
async def update_profile(
    profile: UserProfile,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Update user profile
    """
    user_uuid = UUID(current_user["id"])
    user = await db.get(User, user_uuid)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Merge with existing profile data to avoid overwriting unrelated fields
    current_profile = dict(user.profile or {})
    updated_data = profile.model_dump(exclude_unset=True)
    
    for key, value in updated_data.items():
        current_profile[key] = value

    user.profile = current_profile
    user.updated_at = datetime.utcnow()
    await db.commit()

    return {"message": "Profile updated"}


@router.post("/me/progress-photo")
async def upload_progress_photo(
    file: Optional[UploadFile] = File(None, description="Progress image (form field: file)"),
    image: Optional[UploadFile] = File(None, description="Progress image (form field: image)"),
    face_rating: Optional[float] = Form(None),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Upload a daily progress picture for the current user.

    Accepts multipart form with either "file" or "image" field.
    The image is stored via the storage service and a record is persisted
    in the user_progress_photos collection for archive display in the app.
    """
    upload = file or image
    if not upload:
        logger.warning("progress-photo: no file or image in request")
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Missing file: send multipart form with 'file' or 'image'",
        )

    content = await upload.read()
    image_url = await storage_service.upload_image(
        content,
        current_user["id"],
        image_type="progress",
    )
    if not image_url:
        raise HTTPException(status_code=500, detail="Failed to upload progress image")

    fr = face_rating
    if fr is not None and (fr < 0 or fr > 10):
        fr = None

    photo = UserProgressPhoto(
        user_id=UUID(current_user["id"]),
        image_url=image_url,
        created_at=datetime.utcnow(),
        source="app",
        face_rating=fr,
    )
    db.add(photo)
    await db.commit()
    await db.refresh(photo)
    return {
        "photo": {
            "id": str(photo.id),
            "user_id": current_user["id"],
            "image_url": image_url,
            "created_at": photo.created_at,
            "source": "app",
            "face_rating": photo.face_rating,
        }
    }


@router.post("/me/progress-photo/base64")
async def upload_progress_photo_base64(
    body: ProgressPhotoBase64Body,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Upload a progress picture as base64 (e.g. from React Native ImagePicker with base64: true).
    """
    raw = body.image_base64
    if not raw or not raw.strip():
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="image_base64 is required")

    # Strip data URL prefix if present
    if "," in raw:
        raw = raw.split(",", 1)[1]
    try:
        content = base64.b64decode(raw)
    except Exception as e:
        logger.warning("progress-photo/base64: b64decode failed %s", e)
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid base64 image")

    if not content:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Empty image")

    image_url = await storage_service.upload_image(
        content,
        current_user["id"],
        image_type="progress",
    )
    if not image_url:
        raise HTTPException(status_code=500, detail="Failed to upload progress image")

    fr = body.face_rating
    if fr is not None and (fr < 0 or fr > 10):
        fr = None

    photo = UserProgressPhoto(
        user_id=UUID(current_user["id"]),
        image_url=image_url,
        created_at=datetime.utcnow(),
        face_rating=fr,
    )
    db.add(photo)
    await db.commit()
    await db.refresh(photo)
    return {
        "photo": {
            "id": str(photo.id),
            "user_id": current_user["id"],
            "image_url": image_url,
            "created_at": photo.created_at,
            "face_rating": photo.face_rating,
        }
    }


@router.delete("/me/progress-photos/{photo_id}")
async def delete_progress_photo(
    photo_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a single progress photo owned by the current user."""
    user_uuid = UUID(current_user["id"])
    photo_uuid = UUID(photo_id)
    result = await db.execute(
        select(UserProgressPhoto)
        .where(UserProgressPhoto.id == photo_uuid, UserProgressPhoto.user_id == user_uuid)
    )
    photo = result.scalar_one_or_none()
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")
    try:
        delete_by_url(photo.image_url)
    except Exception as e:
        logger.warning("Progress photo S3 cleanup failed: %s", e)
    await db.execute(
        delete(UserProgressPhoto)
        .where(UserProgressPhoto.id == photo_uuid, UserProgressPhoto.user_id == user_uuid)
    )
    await db.commit()
    return {"message": "Photo deleted"}


@router.get("/me/progress-photos")
async def list_progress_photos(
    limit: int = 50,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    List recent progress photos for the current user (most recent first).
    """
    result = await db.execute(
        select(UserProgressPhoto)
        .where(UserProgressPhoto.user_id == UUID(current_user["id"]))
        .order_by(UserProgressPhoto.created_at.desc())
        .limit(limit)
    )
    photos = result.scalars().all()
    return {"photos": [
        {
            "id": str(p.id),
            "user_id": current_user["id"],
            "image_url": p.image_url,
            "created_at": p.created_at,
            "source": getattr(p, "source", None) or "app",
            "face_rating": getattr(p, "face_rating", None),
        }
        for p in photos
    ]}


def _blocked_ids_list(profile: dict | None) -> list[str]:
    raw = (profile or {}).get("blocked_user_ids")
    if not isinstance(raw, list):
        return []
    return [str(x) for x in raw if x]


@router.get("/me/blocks")
async def list_blocked_users(current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """User IDs the current user has blocked in community channels."""
    user = await db.get(User, UUID(current_user["id"]))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {"blocked_user_ids": _blocked_ids_list(user.profile)}


@router.post("/me/blocks")
async def block_user(
    body: BlockUserRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Block a user so their channel messages are hidden for you (App Store Guideline 1.2)."""
    uid = current_user["id"]
    target = body.blocked_user_id.strip()
    if target == uid:
        raise HTTPException(status_code=400, detail="You cannot block yourself")
    try:
        UUID(target)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user id")

    target_user = await db.get(User, UUID(target))
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    user = await db.get(User, UUID(uid))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    prof = dict(user.profile or {})
    blocked = _blocked_ids_list(prof)
    if target not in blocked:
        blocked.append(target)
    prof["blocked_user_ids"] = blocked
    user.profile = prof
    user.updated_at = _utcnow()
    await db.commit()
    return {"blocked_user_ids": blocked}


@router.delete("/me/blocks/{blocked_user_id}")
async def unblock_user(
    blocked_user_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user = await db.get(User, UUID(current_user["id"]))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    prof = dict(user.profile or {})
    blocked = [x for x in _blocked_ids_list(prof) if x != blocked_user_id]
    prof["blocked_user_ids"] = blocked
    user.profile = prof
    user.updated_at = _utcnow()
    await db.commit()
    return {"blocked_user_ids": blocked}


@router.delete("/me")
async def delete_my_account(
    body: DeleteAccountRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    rds_db: AsyncSession = Depends(get_rds_db),
):
    """Permanently delete the signed-in account (App Store Guideline 5.1.1)."""
    user_uuid = UUID(current_user["id"])
    user = await db.get(User, user_uuid)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=400, detail="Incorrect password")

    await rds_db.execute(
        update(ChannelMessage)
        .where(ChannelMessage.user_id == user_uuid)
        .values(
            content="[deleted]",
            attachment_url=None,
            attachment_type=None,
            reactions={},
        )
    )
    await rds_db.commit()

    await db.execute(delete(User).where(User.id == user_uuid))
    await db.commit()

    return {"message": "Account deleted"}


@router.put("/account")
async def update_account(
    data: AccountUpdateRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Update user account info (first_name, last_name, username, phone).
    Phone: set when none on file, or replace while SMS is not yet linked (sendblue_sms_engaged false).
    Note: Email cannot be changed
    """
    user_uuid = UUID(current_user["id"])
    user = await db.get(User, user_uuid)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    update_fields = {}

    if data.first_name is not None:
        update_fields["first_name"] = data.first_name.strip() if data.first_name.strip() else None
    if data.last_name is not None:
        update_fields["last_name"] = data.last_name.strip() if data.last_name.strip() else None
    if data.username is not None:
        username_clean = data.username.strip()
        current_username = current_user.get("username") or ""
        username_actually_changed = username_clean.lower() != current_username.lower()

        if username_clean and username_actually_changed:
            last_change = current_user.get("last_username_change")
            if last_change:
                last_utc = _as_utc_aware(last_change)
                cooldown_end = last_utc + timedelta(weeks=2)
                now = _utcnow()
                if now < cooldown_end:
                    seconds_left = (cooldown_end - now).total_seconds()
                    days_left = max(1, math.ceil(seconds_left / 86400))
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"You can only change your username once every 2 weeks. Try again in {days_left} day{'s' if days_left != 1 else ''}."
                    )
            if len(username_clean) < 3:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Username must be at least 3 characters"
                )
            if not username_clean.replace('_', '').isalnum():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Username can only contain letters, numbers, and underscores"
                )
            result = await db.execute(
                select(User).where(
                    (User.username == username_clean.lower()) &
                    (User.id != UUID(current_user["id"]))
                )
            )
            if result.scalars().first():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Username already taken"
                )
            update_fields["username"] = username_clean.lower()
            update_fields["last_username_change"] = _utcnow()
        elif not username_clean:
            update_fields["username"] = None

    if data.phone_number is not None:
        existing_digits = re.sub(r"\D", "", (user.phone_number or ""))
        ob = user.onboarding if isinstance(user.onboarding, dict) else {}
        sendblue_sms_engaged = ob.get("sendblue_sms_engaged") is True
        if len(existing_digits) >= 10 and sendblue_sms_engaged:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Phone number is already set on this account.",
            )
        raw = (data.phone_number or "").strip()
        if not raw:
            update_fields["phone_number"] = None
        else:
            normalized = normalize_phone(raw)
            dig = re.sub(r"\D", "", normalized)
            if len(dig) < 10:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Enter a valid phone number with country code.",
                )
            phone_candidates = list(
                dict.fromkeys(phone_lookup_candidates(normalized) + [normalized])
            )
            dup = await db.execute(
                select(User).where(
                    and_(
                        User.phone_number.in_(phone_candidates),
                        User.id != user_uuid,
                    )
                )
            )
            if dup.scalars().first():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Phone number already registered",
                )
            update_fields["phone_number"] = normalized

    if not update_fields:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields to update"
        )

    for key, value in update_fields.items():
        setattr(user, key, value)
    user.updated_at = _utcnow()
    await db.commit()
    
    return {"message": "Account updated"}


@router.get("/goals", response_model=List[str])
async def get_available_goals():
    """
    Get list of available improvement goals
    """
    return [goal.value for goal in GoalType]


@router.get("/experience-levels", response_model=List[str])
async def get_experience_levels():
    """
    Get list of experience levels
    """
    return [level.value for level in ExperienceLevel]
