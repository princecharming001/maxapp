"""Creator platform — domain service.

Owns provisioning (application → creator + max), entitlement (per-creator
monthly subscription → access), the DB-backed catalog doc for a creator max,
enrollment grants, subscriber counters, and comment moderation thresholds.

Kept free of FastAPI so it's unit-testable and reusable from the API, the ASN
webhook, the reconciliation job, and the admin surface.
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from models.sqlalchemy_models import (
    Creator,
    CreatorApplication,
    CreatorPostComment,
    CreatorSubscription,
    User,
)
from services import task_catalog_service
from services.max_doc_loader import MaxDoc, TaskDef

logger = logging.getLogger(__name__)

# ── Pricing ────────────────────────────────────────────────────────────────
# Fixed monthly ladder. Each tier maps to a pre-approved App Store Connect
# subscription product; creators are ASSIGNED a tier by an admin. Cents.
PRICE_TIERS: dict[str, int] = {
    "free": 0,
    "t1": 499,    # $4.99/mo
    "t2": 999,    # $9.99/mo
    "t3": 1999,   # $19.99/mo
    "t4": 2999,   # $29.99/mo
}
DEFAULT_TIER = "t1"

# A comment auto-hides (pending admin review) once this many distinct users
# report it — the Apple-required "filtering mechanism" for UGC (Guideline 1.2).
AUTO_HIDE_REPORTS = 3
# A creator is auto-paused after this many upheld content strikes.
STRIKE_LIMIT = 2

_MAXX_ID_RE = re.compile(r"[^a-z0-9]+")


def price_cents_for_tier(tier: str) -> int:
    return PRICE_TIERS.get((tier or "").lower(), PRICE_TIERS[DEFAULT_TIER])


def apple_product_id_for(maxx_id: str) -> str:
    """The auto-renewable SKU for a creator max. Each creator gets its OWN
    subscription group in App Store Connect (Apple subs within one group are
    mutually exclusive, and a user must be able to hold several creator subs)."""
    return f"com.cannon.creator.{maxx_id}.monthly"


# ── maxx_id minting ────────────────────────────────────────────────────────
def _slug(name: str) -> str:
    s = _MAXX_ID_RE.sub("", (name or "").strip().lower())
    return s or "creator"


async def mint_maxx_id(base_name: str, db: AsyncSession) -> str:
    """Collision-safe maxx_id from a display/normalized name. `<slug>max`, then
    `<slug>max2`, … so it never clashes with an existing creator OR native max."""
    slug = _slug(base_name)
    # native maxes end in 'max' already; append only if it doesn't
    root = slug if slug.endswith("max") else f"{slug}max"
    candidate = root
    n = 1
    while True:
        taken_creator = (await db.execute(
            select(Creator.id).where(Creator.maxx_id == candidate)
        )).first() is not None
        taken_native = task_catalog_service.has_doc(candidate) and not taken_creator
        # a native .md doc with this id also blocks it
        if not taken_creator and not taken_native:
            return candidate
        n += 1
        candidate = f"{root}{n}"


# ── Catalog doc (DB-backed creator max) ────────────────────────────────────
def build_creator_maxdoc(creator: Creator) -> MaxDoc:
    """A minimal, valid MaxDoc for a creator max so the reader/RAG/schedule paths
    never crash on an unknown maxx_id. Creator maxes are experienced through
    their COURSE + updates feed; this is the safety-net catalog entry."""
    mid = creator.maxx_id
    tasks = [
        TaskDef(
            id=f"{mid}_daily",
            title=f"{creator.display_name}'s daily practice",
            description=creator.tagline or f"Your daily {creator.display_name} habit.",
            duration_min=10,
            default_window="flexible",
            tags=["creator"],
            applies_when=[],
            contraindicated_when=[],
            intensity=0.5,
            evidence_section=None,
            cooldown_hours=0,
            frequency={"type": "daily", "n": 1},
            source_doc=f"creator:{mid}",
        ),
    ]
    return MaxDoc(
        maxx_id=mid,
        display_name=creator.display_name,
        short_description=creator.tagline or f"{creator.display_name} on Max.",
        schedule_design={},
        required_fields=[],
        optional_context=[],
        prompt_modifiers=[],
        info_schema=[],
        chunks=[],
        tasks=tasks,
        source_path=f"creator:{mid}",
        content_hash="",
    )


def register_creator_doc(creator: Creator) -> None:
    """Inject the creator's max into the in-memory catalog (idempotent)."""
    try:
        task_catalog_service.register_doc(build_creator_maxdoc(creator))
    except Exception:
        logger.exception("register_creator_doc failed for %s", getattr(creator, "maxx_id", "?"))


async def warm_creator_catalog(db: AsyncSession) -> int:
    """Register every non-takedown creator max into the catalog at startup.
    Returns the count registered. Never raises."""
    try:
        rows = (await db.execute(
            select(Creator).where(Creator.status != "takedown")
        )).scalars().all()
        for c in rows:
            register_creator_doc(c)
        if rows:
            logger.info("creator_service: registered %d creator maxes", len(rows))
        return len(rows)
    except Exception:
        logger.exception("warm_creator_catalog failed")
        return 0


# ── Lookups ────────────────────────────────────────────────────────────────
async def get_creator_by_user(user_id: str, db: AsyncSession) -> Optional[Creator]:
    return (await db.execute(
        select(Creator).where(Creator.user_id == UUID(str(user_id)))
    )).scalar_one_or_none()


async def get_creator_by_maxx(maxx_id: str, db: AsyncSession) -> Optional[Creator]:
    return (await db.execute(
        select(Creator).where(Creator.maxx_id == maxx_id)
    )).scalar_one_or_none()


async def get_creator_by_id(creator_id: str, db: AsyncSession) -> Optional[Creator]:
    return (await db.execute(
        select(Creator).where(Creator.id == UUID(str(creator_id)))
    )).scalar_one_or_none()


# ── Provisioning ───────────────────────────────────────────────────────────
async def provision_creator_from_application(
    application: CreatorApplication, db: AsyncSession, *, tier: str = DEFAULT_TIER
) -> Creator:
    """Approve → provision. Idempotent: if the user already has a Creator row,
    return it. Mints a maxx_id, creates the Creator, flips User.is_creator,
    assigns the Apple SKU + review status, and registers the catalog doc.

    Caller commits. Does NOT create the real App Store Connect product — that is
    an out-of-band ASC-API job that sets apple_review_status → 'live'."""
    existing = await get_creator_by_user(str(application.user_id), db)
    if existing is not None:
        return existing

    maxx_id = await mint_maxx_id(application.max_name_normalized or application.max_name, db)
    stats = application.social_stats or {}
    ig = (stats.get("instagram") or {}) if isinstance(stats, dict) else {}
    tt = (stats.get("tiktok") or {}) if isinstance(stats, dict) else {}
    avatar = ig.get("avatar_url") or tt.get("avatar_url")
    verified = bool(ig.get("verified") or tt.get("verified"))
    handle = _slug(application.applicant_name) or maxx_id

    # handle uniqueness
    if (await db.execute(select(Creator.id).where(Creator.handle == handle))).first():
        handle = f"{handle}{str(application.user_id)[:4]}"

    creator = Creator(
        user_id=application.user_id,
        maxx_id=maxx_id,
        display_name=application.applicant_name or application.max_name,
        handle=handle,
        bio="",
        tagline=(application.max_description or "")[:120],
        avatar_url=avatar,
        socials={
            "instagram": application.instagram_handle,
            "tiktok": application.tiktok_handle,
        },
        verified=verified,
        price_tier=tier,
        price_cents=price_cents_for_tier(tier),
        apple_product_id=apple_product_id_for(maxx_id),
        apple_review_status="pending",  # SKU must clear Apple review before 'live'
        status="onboarding",
    )
    db.add(creator)

    user = await db.get(User, application.user_id)
    if user is not None:
        user.is_creator = True
        user.updated_at = datetime.utcnow()

    await db.flush()  # assign creator.id
    register_creator_doc(creator)
    logger.info("provisioned creator user=%s maxx=%s", str(application.user_id)[:8], maxx_id)
    return creator


# ── Entitlement ────────────────────────────────────────────────────────────
def _sub_active(sub: Optional[CreatorSubscription]) -> bool:
    if sub is None or sub.status != "active":
        return False
    if sub.expires_at is None:
        return True
    exp = sub.expires_at
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    return exp > datetime.now(timezone.utc)


async def active_subscription(
    user_id: str, creator_id: str, db: AsyncSession
) -> Optional[CreatorSubscription]:
    sub = (await db.execute(
        select(CreatorSubscription).where(
            (CreatorSubscription.user_id == UUID(str(user_id)))
            & (CreatorSubscription.creator_id == UUID(str(creator_id)))
        )
    )).scalar_one_or_none()
    return sub if _sub_active(sub) else None


async def has_creator_access(user_id: str, creator: Creator, db: AsyncSession) -> bool:
    """True if the user may read the creator's feed/course: the creator themself,
    an admin, or a user with an active subscription."""
    if str(creator.user_id) == str(user_id):
        return True
    user = await db.get(User, UUID(str(user_id)))
    if user is not None and getattr(user, "is_admin", False):
        return True
    return (await active_subscription(user_id, str(creator.id), db)) is not None


def _grant_enrollment(user: User, maxx_id: str, granted: bool) -> None:
    """Add/remove the creator max from entered_courses (creator maxes are
    courses for entitlement). Reassigns the whole onboarding dict so SQLAlchemy
    flushes the JSON change — the proven pattern from marketplace._set_entitlement."""
    ob = dict(user.onboarding or {})
    lst = [x for x in (ob.get("entered_courses") or []) if x != maxx_id]
    if granted:
        lst.append(maxx_id)
    ob["entered_courses"] = lst
    at = dict(ob.get("maxx_entered_at") or {})
    if granted:
        at.setdefault(maxx_id, datetime.now(timezone.utc).isoformat())
    else:
        at.pop(maxx_id, None)
    ob["maxx_entered_at"] = at
    user.onboarding = ob


async def activate_creator_subscription(
    *,
    user_id: str,
    creator: Creator,
    product_id: Optional[str],
    original_transaction_id: Optional[str],
    provider: str,
    expires_at: Optional[datetime],
    db: AsyncSession,
) -> CreatorSubscription:
    """Upsert an ACTIVE subscription + grant course enrollment + bump the
    subscriber counter. Idempotent (safe to replay from ASN)."""
    sub = (await db.execute(
        select(CreatorSubscription).where(
            (CreatorSubscription.user_id == UUID(str(user_id)))
            & (CreatorSubscription.creator_id == creator.id)
        )
    )).scalar_one_or_none()
    was_active = _sub_active(sub)
    if sub is None:
        sub = CreatorSubscription(
            user_id=UUID(str(user_id)),
            creator_id=creator.id,
            maxx_id=creator.maxx_id,
        )
        db.add(sub)
    sub.apple_product_id = product_id or sub.apple_product_id
    sub.original_transaction_id = original_transaction_id or sub.original_transaction_id
    sub.billing_provider = provider
    sub.status = "active"
    sub.expires_at = expires_at
    sub.auto_renew = True
    sub.updated_at = datetime.utcnow()

    user = await db.get(User, UUID(str(user_id)))
    if user is not None:
        _grant_enrollment(user, creator.maxx_id, granted=True)
        user.updated_at = datetime.utcnow()

    if not was_active:
        # Flush the just-added row first so the COUNT sees it (else the new
        # subscriber is undercounted by one).
        await db.flush()
        await _recount_subscribers(creator, db)
    return sub


async def deactivate_creator_subscription(
    *, user_id: str, creator: Creator, db: AsyncSession, status: str = "expired"
) -> None:
    """Mark the sub inactive (feed/course locks; program progress is preserved)."""
    sub = (await db.execute(
        select(CreatorSubscription).where(
            (CreatorSubscription.user_id == UUID(str(user_id)))
            & (CreatorSubscription.creator_id == creator.id)
        )
    )).scalar_one_or_none()
    if sub is None:
        return
    was_active = _sub_active(sub)
    sub.status = status
    sub.auto_renew = False
    sub.updated_at = datetime.utcnow()
    if was_active:
        await db.flush()
        await _recount_subscribers(creator, db)


async def _recount_subscribers(creator: Creator, db: AsyncSession) -> None:
    # Count only subscriptions that are BOTH marked active AND not past their
    # expiry (a sub can lapse purely by time with no ASN yet) so the count and
    # the earnings estimate match effective access (has_creator_access/_sub_active).
    now = datetime.now(timezone.utc)
    n = (await db.execute(
        select(func.count()).select_from(CreatorSubscription).where(
            (CreatorSubscription.creator_id == creator.id)
            & (CreatorSubscription.status == "active")
            & ((CreatorSubscription.expires_at.is_(None)) | (CreatorSubscription.expires_at > now))
        )
    )).scalar_one() or 0
    creator.subscriber_count = int(n)
    creator.updated_at = datetime.utcnow()


async def live_subscriber_count(creator: Creator, db: AsyncSession) -> int:
    """Authoritative active-subscriber count (excludes time-lapsed subs). Used by
    the stats endpoint so the displayed number never drifts from real access."""
    now = datetime.now(timezone.utc)
    return int((await db.execute(
        select(func.count()).select_from(CreatorSubscription).where(
            (CreatorSubscription.creator_id == creator.id)
            & (CreatorSubscription.status == "active")
            & ((CreatorSubscription.expires_at.is_(None)) | (CreatorSubscription.expires_at > now))
        )
    )).scalar_one() or 0)


# ── Moderation ─────────────────────────────────────────────────────────────
async def maybe_auto_hide_comment(comment: CreatorPostComment, db: AsyncSession) -> bool:
    """Hide a comment once it crosses the report threshold. Decrements the post's
    comment_count so the badge stays consistent with the visible-only list.
    Returns True if hidden."""
    if comment.status == "visible" and (comment.report_count or 0) >= AUTO_HIDE_REPORTS:
        comment.status = "hidden"
        from models.sqlalchemy_models import CreatorPost
        post = await db.get(CreatorPost, comment.post_id)
        if post is not None:
            post.comment_count = max(0, int(post.comment_count or 0) - 1)
        return True
    return False


async def strike_creator(creator: Creator, db: AsyncSession) -> None:
    """Add a content strike; auto-pause at the limit."""
    creator.strikes = int(creator.strikes or 0) + 1
    if creator.strikes >= STRIKE_LIMIT and creator.status == "live":
        creator.status = "paused"
    creator.updated_at = datetime.utcnow()


# ── Serialization ──────────────────────────────────────────────────────────
def creator_public_dict(creator: Creator) -> dict[str, Any]:
    """The creator header the client renders (no private fields)."""
    return {
        "id": str(creator.id),
        "maxx_id": creator.maxx_id,
        "display_name": creator.display_name,
        "handle": creator.handle,
        "bio": creator.bio or "",
        "tagline": creator.tagline or "",
        "avatar_url": creator.avatar_url,
        "accent_color": creator.accent_color or "#BC7A3C",
        "icon": creator.icon or "star-outline",
        "socials": creator.socials or {},
        "verified": bool(creator.verified),
        "price_tier": creator.price_tier,
        "price_cents": int(creator.price_cents or 0),
        "apple_product_id": creator.apple_product_id,
        "status": creator.status,
        "subscriber_count": int(creator.subscriber_count or 0),
        "post_count": int(creator.post_count or 0),
        "course_version": int(creator.course_version or 1),
    }


def creator_private_dict(creator: Creator) -> dict[str, Any]:
    """The studio view — public + review status + strikes."""
    d = creator_public_dict(creator)
    d.update({
        "apple_review_status": creator.apple_review_status,
        "strikes": int(creator.strikes or 0),
    })
    return d
