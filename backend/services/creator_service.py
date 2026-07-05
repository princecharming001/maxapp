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
    CreatorHabit,
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
# Creator-habit window → skeleton slot + TaskDef default_window.
# am_active/pm_active (not am_open/pm_close): the expander maps the synthesized
# am_window/pm_window overrides onto the *_active slots, so open/close variants
# would silently ignore the windows we ship (review finding #15).
_HABIT_SLOT = {"morning": "am_active", "evening": "pm_active", "any": "flexible"}
_HABIT_TASK_WINDOW = {"morning": "morning", "evening": "evening", "any": "flexible"}


def habit_catalog_id(maxx_id: str, slug: str) -> str:
    """The stable catalog id a habit publishes as ("colormax.warm_palette")."""
    return f"{maxx_id}.{slug}"


def mint_habit_slug(title: str, taken: "set[str]") -> str:
    """Stable slug for a NEW habit (never re-minted on edit — regeneration
    diffs by catalog_id, so identity must survive renames)."""
    base = _slug(title)[:40] or "habit"
    slug = base
    i = 2
    while slug in taken:
        slug = f"{base}{i}"
        i += 1
    return slug


def build_creator_maxdoc(creator: Creator, habits: "Optional[list[CreatorHabit]]" = None) -> MaxDoc:
    """The catalog MaxDoc for a creator max.

    WITH habits: one TaskDef per active habit + a synthesized
    schedule_design.skeleton — which flips the maxx onto the deterministic
    native generation path (has_skeleton → expand_skeleton, no LLM), making it
    a FIRST-CLASS maxx: subscribe → UserSchedule → tasks in Home/Planner.

    WITHOUT habits: the legacy single-task safety net, so reader/RAG/schedule
    paths never crash on an unknown maxx_id."""
    mid = creator.maxx_id
    active = [h for h in (habits or []) if getattr(h, "status", "active") == "active"]
    active.sort(key=lambda h: (int(h.sort or 0), str(h.id)))

    if active:
        tasks = []
        blocks = []
        for h in active:
            window = (h.window or "any").strip().lower()
            freq_type = (h.frequency_type or "daily").strip().lower()
            freq_n = max(1, min(7, int(h.frequency_n or 1)))
            tasks.append(TaskDef(
                id=habit_catalog_id(mid, h.slug),
                title=h.title,
                description=h.description or "",
                duration_min=max(2, min(90, int(h.duration_minutes or 10))),
                default_window=_HABIT_TASK_WINDOW.get(window, "flexible"),
                # "foundation" is load-bearing: the validator's week-1 on-ramp
                # keeps only ESSENTIAL-tagged tasks for chill-effort users
                # (_ramped_daily_max), and a creator's 2-8 hand-picked habits
                # ARE the program's foundation — without it, week 1 of a paid
                # creator maxx truncates to ZERO tasks for those users.
                tags=["creator", "foundation"],
                applies_when=[],
                contraindicated_when=[],
                intensity=0.5,
                evidence_section=None,
                cooldown_hours=0,
                frequency={"type": freq_type, "n": freq_n},
                source_doc=f"creator:{mid}",
            ))
            blocks.append({
                "id": f"h_{h.slug}",
                "slot": _HABIT_SLOT.get(window, "flexible"),
                "cadence": "daily" if freq_type == "daily" else f"n_per_week={freq_n}",
                "tasks": [habit_catalog_id(mid, h.slug)],
            })
        # Mirrors the hand-authored docs' conventions (see skinmax.md) so
        # expand_skeleton treats a creator maxx exactly like a native one.
        schedule_design = {
            "cadence_days": 14,
            "daily_task_budget": [1, 8],
            "am_window": ["wake+0:15", "wake+2:00"],
            "pm_window": ["sleep-2:30", "sleep-0:30"],
            "skeleton": {"blocks": blocks},
        }
    else:
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
        schedule_design = {}

    return MaxDoc(
        maxx_id=mid,
        display_name=creator.display_name,
        short_description=creator.tagline or f"{creator.display_name} on Max.",
        schedule_design=schedule_design,
        required_fields=[],
        optional_context=[],
        prompt_modifiers=[],
        info_schema=[],
        chunks=[],
        tasks=tasks,
        # Version-stamped so consumers can detect a stale cached doc after a
        # habit edit (ensure_creator_schedule re-registers on mismatch). The
        # clobber guard keys off the "creator:" prefix — keep it first.
        source_path=f"creator:{mid}@v{int(getattr(creator, 'habits_version', None) or 1)}",
        content_hash="",
    )


async def ensure_creator_schedule(user_id: str, maxx_id: str, db: AsyncSession) -> "bool | str":
    """After a creator-subscription activation: make sure the subscriber has an
    active UserSchedule for this maxx (generate one from the creator's habit
    skeleton if not). Called AFTER the entitlement committed — a generation
    failure must never un-grant a paid subscription, so this is best-effort.

    Returns True when a schedule exists/was created, the string "limit" when
    the user is at the 5-active-schedule cap (the client must surface this —
    a PAID sub with no schedule and no signal is a silent non-delivery), and
    False on other failures."""
    from models.sqlalchemy_models import UserSchedule
    from services.schedule_service import ScheduleLimitError
    try:
        existing = (await db.execute(
            select(UserSchedule.id).where(
                (UserSchedule.user_id == UUID(str(user_id)))
                & (UserSchedule.maxx_id == maxx_id)
                & (UserSchedule.is_active.is_(True))
            ).limit(1)
        )).first()
        if existing:
            return True
        # Freshness-checked catalog registration: warm_catalog() only loads
        # FILE-backed docs (cold process → "no doc"), and a stale process may
        # hold an old habit set. The doc is version-stamped (see
        # build_creator_maxdoc source_path) so we re-register whenever the DB's
        # habits_version is ahead — the multi-worker staleness heal.
        creator = await get_creator_by_maxx(maxx_id, db)
        if creator is not None:
            doc = task_catalog_service.get_doc(maxx_id)
            want = f"creator:{maxx_id}@v{int(creator.habits_version or 1)}"
            if doc is None or str(getattr(doc, "source_path", "")) != want:
                habits = await load_creator_habits(creator.id, db)
                register_creator_doc(creator, habits)
        user = await db.get(User, UUID(str(user_id)))
        ob = dict(getattr(user, "onboarding", None) or {})
        from services.schedule_runtime import generate_and_persist
        await generate_and_persist(
            user_id=str(user_id), maxx_id=maxx_id, db=db,
            wake_time=str(ob.get("wake_time") or "07:00"),
            sleep_time=str(ob.get("sleep_time") or "23:00"),
            cap=5,  # marketplace active cap, not the legacy 2/3 tier cap
        )
        await db.commit()
        return True
    except ScheduleLimitError:
        # The sub is active but the program can't land until a slot frees up.
        try:
            await db.rollback()
        except Exception:
            pass
        logger.warning("ensure_creator_schedule: active-cap hit user=%s maxx=%s", user_id, maxx_id)
        return "limit"
    except Exception:
        logger.exception("ensure_creator_schedule failed user=%s maxx=%s", user_id, maxx_id)
        try:
            await db.rollback()
        except Exception:
            pass
        return False


async def load_creator_habits(creator_id, db: AsyncSession) -> "list[CreatorHabit]":
    """All non-archived habits for one creator, in display order."""
    rows = (await db.execute(
        select(CreatorHabit).where(
            (CreatorHabit.creator_id == creator_id) & (CreatorHabit.status == "active")
        ).order_by(CreatorHabit.sort, CreatorHabit.created_at)
    )).scalars().all()
    return list(rows)


def register_creator_doc(creator: Creator, habits: "Optional[list[CreatorHabit]]" = None) -> None:
    """Inject the creator's max into the in-memory catalog (idempotent).

    CLOBBER GUARD: never overwrite a FILE-backed doc. warm_creator_catalog runs
    after the .md docs load, so a Creator row whose maxx_id collides with a
    native doc (the coloringmax hazard) would silently replace the rich doc
    with the synthesized one — refuse instead."""
    try:
        existing = task_catalog_service.get_doc(creator.maxx_id)
        src = str(getattr(existing, "source_path", "") or "")
        if existing is not None and not src.startswith("creator:"):
            logger.warning(
                "register_creator_doc: refusing to clobber file-backed doc for %s (source=%s)",
                creator.maxx_id, src,
            )
            return
        task_catalog_service.register_doc(build_creator_maxdoc(creator, habits))
    except Exception:
        logger.exception("register_creator_doc failed for %s", getattr(creator, "maxx_id", "?"))


async def warm_creator_catalog(db: AsyncSession) -> int:
    """Register every non-takedown creator max into the catalog at startup
    (habits included — one bulk query, grouped). Returns the count. Never raises."""
    try:
        rows = (await db.execute(
            select(Creator).where(Creator.status != "takedown")
        )).scalars().all()
        habits_by_creator: dict[str, list[CreatorHabit]] = {}
        if rows:
            hrows = (await db.execute(
                select(CreatorHabit).where(
                    (CreatorHabit.creator_id.in_([c.id for c in rows]))
                    & (CreatorHabit.status == "active")
                ).order_by(CreatorHabit.sort, CreatorHabit.created_at)
            )).scalars().all()
            for h in hrows:
                habits_by_creator.setdefault(str(h.creator_id), []).append(h)
        for c in rows:
            register_creator_doc(c, habits_by_creator.get(str(c.id)))
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
def active_sub_clause(now: "Optional[datetime]" = None):
    """SQL predicate for a LIVE subscription: status active AND not time-lapsed.
    Use in any query that fans out to / lists subscribers — filtering on
    status alone targets users whose expires_at already passed (missed-webhook
    safety, same rule as _sub_active)."""
    now = now or datetime.now(timezone.utc)
    return (CreatorSubscription.status == "active") & (
        (CreatorSubscription.expires_at.is_(None)) | (CreatorSubscription.expires_at > now)
    )


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
    auto_renew: Optional[bool] = True,
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
    # None = leave the stored preference untouched (DID_CHANGE_RENEWAL_* ASN
    # events re-activate but must not flip a user's auto-renew OFF back to on).
    if auto_renew is not None:
        sub.auto_renew = auto_renew
    # Snapshot the price at (re)activation — the creator can be re-tiered later,
    # and an earnings ledger is only computable from what was actually charged.
    sub.price_cents_at_purchase = int(creator.price_cents or 0)
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
    """Mark the sub inactive AND revoke the paid deliverables: enrollment
    (entered_courses) and the generated habit UserSchedule. Without the
    revocation legs, a refunded/expired subscriber kept the creator's daily
    program in Home/Planner forever — feed/course/channels locked correctly
    via has_creator_access, but the core paid deliverable never did.
    Completion history is preserved (rows are deactivated, not deleted)."""
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
    # Revoke enrollment so the maxx leaves entered_courses (and the schedule
    # entitlement gate) — mirrors the grant on activation.
    user = await db.get(User, UUID(str(user_id)))
    if user is not None:
        _grant_enrollment(user, creator.maxx_id, granted=False)
        user.updated_at = datetime.utcnow()
    if was_active:
        await db.flush()
        await _recount_subscribers(creator, db)
    # Deactivate the habit schedule LAST (it commits internally; callers'
    # own commit of the sub-row mutation stays safe either way).
    try:
        from services.schedule_service import schedule_service
        await schedule_service.deactivate_schedule_by_maxx(str(user_id), creator.maxx_id, db)
    except Exception:
        logger.exception(
            "creator sub deactivation: schedule revoke failed user=%s maxx=%s",
            user_id, creator.maxx_id,
        )


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


# ── Course lessons: locking + serialization ────────────────────────────────
def lesson_locked(lesson: Any, has_access: bool) -> bool:
    """A published lesson is readable when the user has creator access OR the
    lesson is flagged free-preview (the paywall teaser)."""
    if has_access:
        return False
    return not bool(getattr(lesson, "is_free_preview", False))


def lesson_public_dict(lesson: Any, *, locked: bool) -> dict[str, Any]:
    """Subscriber-facing lesson. When locked, the CONTENT (body/video) is
    withheld server-side — titles/subtitles stay visible so the locked outline
    still sells the course. Redaction here, not in the client, or it's a leak."""
    return {
        "id": str(lesson.id),
        "module_number": int(lesson.module_number or 1),
        "sort": int(lesson.sort or 0),
        "title": lesson.title,
        "subtitle": lesson.subtitle or "",
        "icon": lesson.icon or "book-outline",
        "duration_minutes": lesson.duration_minutes,
        "is_free_preview": bool(getattr(lesson, "is_free_preview", False)),
        "has_video": bool(lesson.video_url),
        "locked": bool(locked),
        "body_md": "" if locked else (lesson.body_md or ""),
        "video_url": None if locked else lesson.video_url,
        "poster_url": lesson.poster_url,
    }


def group_lessons_into_modules(
    lessons: list[Any], course_modules: Optional[dict], *, has_access: bool
) -> list[dict[str, Any]]:
    """Ordered [{module_number, title, lessons:[lesson_public_dict]}]. Module
    titles come from Creator.course_modules (may be sparse or absent)."""
    meta = course_modules or {}
    by_mod: dict[int, list[Any]] = {}
    for l in lessons:
        by_mod.setdefault(int(l.module_number or 1), []).append(l)
    out: list[dict[str, Any]] = []
    for n in sorted(by_mod.keys()):
        rows = sorted(by_mod[n], key=lambda x: (int(x.sort or 0), str(x.id)))
        title = ""
        m = meta.get(str(n))
        if isinstance(m, dict):
            title = str(m.get("title") or "").strip()
        out.append({
            "module_number": n,
            "title": title,
            "lessons": [
                lesson_public_dict(l, locked=lesson_locked(l, has_access)) for l in rows
            ],
        })
    return out


# ── Go-live checklist ───────────────────────────────────────────────────────
def compute_checklist(
    creator: Creator,
    *,
    published_posts: int,
    published_lessons: int,
    is_production: bool,
    active_habits: int = 0,
) -> dict[str, Any]:
    """The studio's go-live checklist. `required` items mirror the PATCH /me
    go_live gate EXACTLY (intro post + Apple review) so the checklist can never
    say "ready" while go-live 400s; the rest are strong recommendations."""
    profile_done = bool((creator.tagline or "").strip()) and bool((creator.bio or "").strip())
    avatar_done = bool(creator.avatar_url)
    # EXACTLY the PATCH /me go_live rule: in production a paid tier needs an
    # Apple-approved SKU; free tiers (no SKU) and non-prod builds pass.
    if is_production and creator.price_tier != "free":
        review_ok = creator.apple_review_status == "approved"
    else:
        review_ok = True
    items = [
        {"key": "profile", "label": "Complete your profile", "done": profile_done, "required": False},
        {"key": "avatar", "label": "Add a profile photo", "done": avatar_done, "required": False},
        # REQUIRED — mirrors the go_live gate exactly (checklist/gate parity).
        {"key": "habits", "label": "Define your daily habits (2-8)",
         "done": 2 <= active_habits <= 8, "required": True},
        {"key": "lesson", "label": "Publish your first lesson", "done": published_lessons > 0, "required": False},
        {"key": "post", "label": "Post an intro update", "done": published_posts > 0, "required": True},
        {"key": "apple", "label": "Apple subscription review", "done": review_ok, "required": True},
    ]
    can_go_live = all(i["done"] for i in items if i["required"])
    return {
        "items": items,
        "can_go_live": can_go_live,
        "done_count": sum(1 for i in items if i["done"]),
        "total_count": len(items),
        "is_live": creator.status == "live",
    }


# ── AI course assist: response parsing ──────────────────────────────────────
def _strip_md_fences(raw: str) -> str:
    s = (raw or "").strip()
    if s.startswith("```"):
        parts = s.split("```")
        if len(parts) >= 2:
            body = parts[1]
            if body.lstrip().lower().startswith("json"):
                body = body.lstrip()[4:]
            s = body.strip()
    return s


def parse_outline_json(raw: str) -> Optional[dict[str, Any]]:
    """Validate + clip the LLM's course-outline JSON into
    {"modules":[{"title","lessons":[{"title","subtitle"}]}]}, or None when the
    output is unusable. Defensive throughout: model output is untrusted."""
    import json as _json
    try:
        obj = _json.loads(_strip_md_fences(raw))
    except Exception:
        return None
    mods = obj.get("modules") if isinstance(obj, dict) else None
    if not isinstance(mods, list) or not mods:
        return None
    out_mods: list[dict[str, Any]] = []
    for m in mods[:6]:
        if not isinstance(m, dict):
            continue
        title = str(m.get("title") or "").strip()[:60]
        lessons_in = m.get("lessons") if isinstance(m.get("lessons"), list) else []
        lessons: list[dict[str, str]] = []
        for l in lessons_in[:10]:
            if not isinstance(l, dict):
                continue
            lt = str(l.get("title") or "").strip()[:120]
            if not lt:
                continue
            lessons.append({"title": lt, "subtitle": str(l.get("subtitle") or "").strip()[:200]})
        if title and lessons:
            out_mods.append({"title": title, "lessons": lessons})
    return {"modules": out_mods} if out_mods else None


def parse_lesson_draft_json(raw: str) -> Optional[dict[str, str]]:
    """Validate the LLM's single-lesson draft: {"subtitle","body_md"}."""
    import json as _json
    try:
        obj = _json.loads(_strip_md_fences(raw))
    except Exception:
        return None
    if not isinstance(obj, dict):
        return None
    body = str(obj.get("body_md") or "").strip()
    if len(body) < 40:  # a usable lesson, not an apology or an empty shell
        return None
    return {
        "subtitle": str(obj.get("subtitle") or "").strip()[:200],
        "body_md": body[:20000],
    }


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
        "art_url": getattr(creator, "art_url", None),
        "art_status": getattr(creator, "art_status", None) or "none",
        "habits_version": int(getattr(creator, "habits_version", None) or 1),
    }


def creator_private_dict(creator: Creator) -> dict[str, Any]:
    """The studio view — public + review status + strikes."""
    d = creator_public_dict(creator)
    d.update({
        "apple_review_status": creator.apple_review_status,
        "strikes": int(creator.strikes or 0),
    })
    return d
