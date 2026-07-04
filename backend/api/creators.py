"""Creator platform API.

Two audiences on one router:
  • CREATOR side (`/creators/me/*`, gated by require_creator_user) — the Studio:
    profile, posts (video/text), comments management, course lessons, blocks, stats.
  • USER side (`/creators/*`) — discovery, feed, likes, comments, reports,
    per-creator subscription (Apple verify + a dev-activate for sim testing).

Media upload reuses the backend-mediated multipart pattern (there is no
direct-to-S3 presigned upload). New-post push fan-out runs in a BackgroundTask
so the composer feels instant.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from db.sqlalchemy import AsyncSessionLocal, get_db
from middleware.auth_middleware import get_current_user, require_creator_user
from middleware.rate_limit import rate_limit
from models.sqlalchemy_models import (
    Creator,
    CreatorBlock,
    CreatorCourseLesson,
    CreatorPost,
    CreatorPostComment,
    CreatorPostLike,
    CreatorCommentReport,
    CreatorSubscription,
    User,
)
from services import creator_service
from services.storage_service import storage_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/creators", tags=["Creators"])

MAX_COMMENT_LEN = 1000
MAX_BODY_LEN = 2200
MAX_VIDEO_BYTES = 300 * 1024 * 1024  # 300 MB (≈3 min H.264)
FEED_PAGE = 20


# ═══════════════════════════════════════════════════════════════════════════
#  Serialization helpers
# ═══════════════════════════════════════════════════════════════════════════
def _post_dict(p: CreatorPost, *, locked: bool = False, liked: bool = False) -> dict:
    """A feed post. When `locked` (non-subscriber teaser) the video url + full
    body are withheld — only a one-line preview + poster cross the wire."""
    body = p.body or ""
    return {
        "id": str(p.id),
        "type": p.type,
        "body": (body[:80] + "…") if (locked and len(body) > 80) else (body if not locked else body[:80]),
        "video_url": None if locked else p.video_url,
        "poster_url": p.poster_url,
        "duration_s": p.duration_s,
        "pinned": bool(p.pinned),
        "status": p.status,
        "like_count": int(p.like_count or 0),
        "comment_count": int(p.comment_count or 0),
        "view_count": int(p.view_count or 0),
        "liked": bool(liked) and not locked,
        "locked": bool(locked),
        "created_at": (p.created_at or datetime.utcnow()).isoformat(),
    }


def _comment_dict(c: CreatorPostComment, *, author: Optional[User] = None, own: bool = False) -> dict:
    name = "You" if own else (
        (author.first_name or author.username or "Member") if author else "Member"
    )
    return {
        "id": str(c.id),
        "body": c.body,
        "pinned": bool(c.pinned),
        "status": c.status,
        "report_count": int(c.report_count or 0),
        "own": own,
        "author_name": name,
        "author_id": str(c.user_id),
        "created_at": (c.created_at or datetime.utcnow()).isoformat(),
    }


async def _liked_post_ids(user_id: str, post_ids: list[UUID], db: AsyncSession) -> set[str]:
    if not post_ids:
        return set()
    rows = (await db.execute(
        select(CreatorPostLike.post_id).where(
            (CreatorPostLike.user_id == UUID(str(user_id)))
            & (CreatorPostLike.post_id.in_(post_ids))
        )
    )).scalars().all()
    return {str(r) for r in rows}


# ═══════════════════════════════════════════════════════════════════════════
#  CREATOR SIDE — the Studio  (require_creator_user)
# ═══════════════════════════════════════════════════════════════════════════
async def _require_own_creator(current_user: dict, db: AsyncSession) -> Creator:
    creator = await creator_service.get_creator_by_user(current_user["id"], db)
    if creator is None:
        raise HTTPException(status_code=404, detail="No creator profile for this account")
    return creator


class ProfileUpdate(BaseModel):
    display_name: Optional[str] = Field(None, max_length=60)
    bio: Optional[str] = Field(None, max_length=600)
    tagline: Optional[str] = Field(None, max_length=120)
    avatar_url: Optional[str] = None
    accent_color: Optional[str] = Field(None, max_length=9)
    icon: Optional[str] = Field(None, max_length=40)
    go_live: Optional[bool] = None


@router.get("/me")
async def get_my_creator(
    current_user: dict = Depends(require_creator_user),
    db: AsyncSession = Depends(get_db),
):
    creator = await _require_own_creator(current_user, db)
    return creator_service.creator_private_dict(creator)


@router.patch("/me")
async def update_my_creator(
    body: ProfileUpdate,
    current_user: dict = Depends(require_creator_user),
    db: AsyncSession = Depends(get_db),
):
    creator = await _require_own_creator(current_user, db)
    if body.display_name is not None:
        creator.display_name = body.display_name.strip() or creator.display_name
    if body.bio is not None:
        creator.bio = body.bio
    if body.tagline is not None:
        creator.tagline = body.tagline
    if body.avatar_url is not None:
        creator.avatar_url = body.avatar_url
    if body.accent_color is not None:
        creator.accent_color = body.accent_color
    if body.icon is not None:
        creator.icon = body.icon
    # Go live: only allowed once the SKU cleared Apple review (or in non-prod)
    # AND the creator has posted something — Apple 3.1.1: no empty paid listing.
    if body.go_live:
        has_content = (await db.execute(
            select(func.count()).select_from(CreatorPost).where(
                (CreatorPost.creator_id == creator.id) & (CreatorPost.status == "published")
            )
        )).scalar_one() or 0
        review_ok = creator.apple_review_status in ("approved", "none") or not settings.is_production
        if not has_content:
            raise HTTPException(status_code=400, detail="Post an intro update before going live.")
        if not review_ok:
            raise HTTPException(status_code=400, detail="Your subscription is still in Apple review.")
        creator.status = "live"
    creator.updated_at = datetime.utcnow()
    creator_service.register_creator_doc(creator)  # keep catalog display name fresh
    await db.commit()
    return creator_service.creator_private_dict(creator)


@router.post(
    "/me/posts",
    dependencies=[Depends(rate_limit(limit=30, window_s=3600, scope="creator_post"))],
)
async def create_post(
    background: BackgroundTasks,
    type: str = Form("text"),
    body: str = Form(""),
    duration_s: Optional[int] = Form(None),
    video: Optional[UploadFile] = File(None),
    poster: Optional[UploadFile] = File(None),
    current_user: dict = Depends(require_creator_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a feed update. `type` = 'video' | 'text'. Video/poster are optional
    multipart files (a text post sends neither). Fires a push fan-out in the
    background so the composer returns instantly."""
    creator = await _require_own_creator(current_user, db)
    body = (body or "").strip()[:MAX_BODY_LEN]
    ptype = "video" if (type == "video" or video is not None) else "text"
    if ptype == "text" and not body:
        raise HTTPException(status_code=422, detail="A text update needs some text.")

    video_url = None
    poster_url = None
    if video is not None:
        data = await video.read()
        if len(data) > MAX_VIDEO_BYTES:
            raise HTTPException(status_code=413, detail="Video is too long (max ~3 min).")
        video_url = await storage_service.upload_video(data, current_user["id"])
        if not video_url:
            raise HTTPException(status_code=502, detail="Upload failed. Try again.")
    if poster is not None:
        pdata = await poster.read()
        poster_url = await storage_service.upload_image(pdata, current_user["id"], image_type="creator")

    post = CreatorPost(
        creator_id=creator.id,
        maxx_id=creator.maxx_id,
        type=ptype,
        body=body,
        video_url=video_url,
        poster_url=poster_url,
        duration_s=int(duration_s) if duration_s else None,
        status="published",
    )
    db.add(post)
    creator.post_count = int(creator.post_count or 0) + 1
    creator.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(post)

    # Fan out "new update" push to active subscribers — off the request path.
    background.add_task(
        _fanout_new_post,
        creator_id=str(creator.id),
        maxx_id=creator.maxx_id,
        creator_name=creator.display_name,
        preview=(body[:80] if body else "Posted a new video"),
    )
    return _post_dict(post, locked=False, liked=False)


class PostEdit(BaseModel):
    body: Optional[str] = Field(None, max_length=MAX_BODY_LEN)
    pinned: Optional[bool] = None


@router.patch("/me/posts/{post_id}")
async def edit_post(
    post_id: str,
    body: PostEdit,
    current_user: dict = Depends(require_creator_user),
    db: AsyncSession = Depends(get_db),
):
    creator = await _require_own_creator(current_user, db)
    post = (await db.execute(
        select(CreatorPost).where(
            (CreatorPost.id == UUID(post_id)) & (CreatorPost.creator_id == creator.id)
        )
    )).scalar_one_or_none()
    if post is None:
        raise HTTPException(status_code=404, detail="Post not found")
    if body.body is not None:
        post.body = body.body.strip()[:MAX_BODY_LEN]
    if body.pinned is not None:
        if body.pinned:
            # only one pinned post at a time
            await db.execute(
                CreatorPost.__table__.update()
                .where((CreatorPost.creator_id == creator.id) & (CreatorPost.pinned.is_(True)))
                .values(pinned=False)
            )
        post.pinned = body.pinned
    post.updated_at = datetime.utcnow()
    await db.commit()
    return _post_dict(post)


@router.delete("/me/posts/{post_id}")
async def delete_post(
    post_id: str,
    current_user: dict = Depends(require_creator_user),
    db: AsyncSession = Depends(get_db),
):
    creator = await _require_own_creator(current_user, db)
    post = (await db.execute(
        select(CreatorPost).where(
            (CreatorPost.id == UUID(post_id)) & (CreatorPost.creator_id == creator.id)
        )
    )).scalar_one_or_none()
    if post is None:
        raise HTTPException(status_code=404, detail="Post not found")
    if post.status != "removed":
        post.status = "removed"
        creator.post_count = max(0, int(creator.post_count or 0) - 1)
        post.updated_at = datetime.utcnow()
        await db.commit()
    return {"ok": True}


@router.get("/me/posts")
async def my_posts(
    current_user: dict = Depends(require_creator_user),
    db: AsyncSession = Depends(get_db),
):
    creator = await _require_own_creator(current_user, db)
    rows = (await db.execute(
        select(CreatorPost).where(
            (CreatorPost.creator_id == creator.id) & (CreatorPost.status != "removed")
        ).order_by(CreatorPost.pinned.desc(), CreatorPost.created_at.desc()).limit(100)
    )).scalars().all()
    return {"posts": [_post_dict(p) for p in rows]}


@router.get("/me/posts/{post_id}/comments")
async def manage_comments(
    post_id: str,
    current_user: dict = Depends(require_creator_user),
    db: AsyncSession = Depends(get_db),
):
    """All comments (incl. hidden) on the creator's own post — management view."""
    creator = await _require_own_creator(current_user, db)
    post = (await db.execute(
        select(CreatorPost).where(
            (CreatorPost.id == UUID(post_id)) & (CreatorPost.creator_id == creator.id)
        )
    )).scalar_one_or_none()
    if post is None:
        raise HTTPException(status_code=404, detail="Post not found")
    rows = (await db.execute(
        select(CreatorPostComment, User).join(User, User.id == CreatorPostComment.user_id, isouter=True)
        .where((CreatorPostComment.post_id == post.id) & (CreatorPostComment.status != "removed"))
        .order_by(CreatorPostComment.pinned.desc(), CreatorPostComment.created_at.desc())
        .limit(200)
    )).all()
    return {"comments": [_comment_dict(c, author=u) for (c, u) in rows]}


@router.post("/comments/{comment_id}/pin")
async def pin_comment(
    comment_id: str,
    current_user: dict = Depends(require_creator_user),
    db: AsyncSession = Depends(get_db),
):
    creator = await _require_own_creator(current_user, db)
    comment = (await db.execute(
        select(CreatorPostComment).where(
            (CreatorPostComment.id == UUID(comment_id)) & (CreatorPostComment.creator_id == creator.id)
        )
    )).scalar_one_or_none()
    if comment is None:
        raise HTTPException(status_code=404, detail="Comment not found")
    await db.execute(
        CreatorPostComment.__table__.update()
        .where((CreatorPostComment.post_id == comment.post_id) & (CreatorPostComment.pinned.is_(True)))
        .values(pinned=False)
    )
    comment.pinned = True
    await db.commit()
    return {"ok": True}


class BlockBody(BaseModel):
    user_id: str


@router.post("/me/blocks")
async def block_user(
    body: BlockBody,
    current_user: dict = Depends(require_creator_user),
    db: AsyncSession = Depends(get_db),
):
    creator = await _require_own_creator(current_user, db)
    try:
        blocked = UUID(body.user_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="Bad user id")
    exists = (await db.execute(
        select(CreatorBlock.id).where(
            (CreatorBlock.creator_id == creator.id) & (CreatorBlock.blocked_user_id == blocked)
        )
    )).first()
    if not exists:
        db.add(CreatorBlock(creator_id=creator.id, blocked_user_id=blocked))
        # hide their visible comments on this creator's posts
        await db.execute(
            CreatorPostComment.__table__.update()
            .where(
                (CreatorPostComment.creator_id == creator.id)
                & (CreatorPostComment.user_id == blocked)
                & (CreatorPostComment.status == "visible")
            )
            .values(status="hidden")
        )
        await db.commit()
    return {"ok": True}


@router.delete("/me/blocks/{user_id}")
async def unblock_user(
    user_id: str,
    current_user: dict = Depends(require_creator_user),
    db: AsyncSession = Depends(get_db),
):
    creator = await _require_own_creator(current_user, db)
    await db.execute(
        CreatorBlock.__table__.delete().where(
            (CreatorBlock.creator_id == creator.id) & (CreatorBlock.blocked_user_id == UUID(user_id))
        )
    )
    await db.commit()
    return {"ok": True}


# ── Course lessons (course editing) ─────────────────────────────────────────
class LessonUpsert(BaseModel):
    id: Optional[str] = None
    module_number: int = 1
    sort: int = 0
    title: str = Field(..., max_length=120)
    subtitle: str = Field("", max_length=200)
    body_md: str = Field("", max_length=20000)
    video_url: Optional[str] = None
    poster_url: Optional[str] = None
    icon: str = "book-outline"
    status: str = "draft"  # draft | published


@router.get("/me/course/lessons")
async def my_lessons(
    current_user: dict = Depends(require_creator_user),
    db: AsyncSession = Depends(get_db),
):
    creator = await _require_own_creator(current_user, db)
    rows = (await db.execute(
        select(CreatorCourseLesson).where(CreatorCourseLesson.creator_id == creator.id)
        .order_by(CreatorCourseLesson.module_number, CreatorCourseLesson.sort)
    )).scalars().all()
    return {"lessons": [_lesson_dict(l) for l in rows], "course_version": creator.course_version}


@router.put("/me/course/lessons")
async def upsert_lesson(
    body: LessonUpsert,
    current_user: dict = Depends(require_creator_user),
    db: AsyncSession = Depends(get_db),
):
    creator = await _require_own_creator(current_user, db)
    if body.status not in ("draft", "published"):
        raise HTTPException(status_code=422, detail="Bad status")
    lesson = None
    if body.id:
        lesson = (await db.execute(
            select(CreatorCourseLesson).where(
                (CreatorCourseLesson.id == UUID(body.id)) & (CreatorCourseLesson.creator_id == creator.id)
            )
        )).scalar_one_or_none()
    if lesson is None:
        lesson = CreatorCourseLesson(creator_id=creator.id, maxx_id=creator.maxx_id)
        db.add(lesson)
    lesson.module_number = body.module_number
    lesson.sort = body.sort
    lesson.title = body.title.strip()
    lesson.subtitle = body.subtitle
    lesson.body_md = body.body_md
    lesson.video_url = body.video_url
    lesson.poster_url = body.poster_url
    lesson.icon = body.icon or "book-outline"
    lesson.status = body.status
    lesson.updated_at = datetime.utcnow()
    # publishing bumps course_version so clients refetch
    if body.status == "published":
        creator.course_version = int(creator.course_version or 1) + 1
    await db.commit()
    await db.refresh(lesson)
    return _lesson_dict(lesson)


@router.delete("/me/course/lessons/{lesson_id}")
async def delete_lesson(
    lesson_id: str,
    current_user: dict = Depends(require_creator_user),
    db: AsyncSession = Depends(get_db),
):
    creator = await _require_own_creator(current_user, db)
    await db.execute(
        CreatorCourseLesson.__table__.delete().where(
            (CreatorCourseLesson.id == UUID(lesson_id)) & (CreatorCourseLesson.creator_id == creator.id)
        )
    )
    creator.course_version = int(creator.course_version or 1) + 1
    await db.commit()
    return {"ok": True}


def _lesson_dict(l: CreatorCourseLesson) -> dict:
    return {
        "id": str(l.id),
        "module_number": l.module_number,
        "sort": l.sort,
        "title": l.title,
        "subtitle": l.subtitle or "",
        "body_md": l.body_md or "",
        "video_url": l.video_url,
        "poster_url": l.poster_url,
        "icon": l.icon or "book-outline",
        "status": l.status,
    }


@router.get("/me/stats")
async def my_stats(
    current_user: dict = Depends(require_creator_user),
    db: AsyncSession = Depends(get_db),
):
    creator = await _require_own_creator(current_user, db)
    subs = int(creator.subscriber_count or 0)
    # Gross monthly, then Apple's ~30% cut → creator's estimated take.
    gross_cents = subs * int(creator.price_cents or 0)
    creator_cents = int(round(gross_cents * 0.70))
    agg = (await db.execute(
        select(
            func.coalesce(func.sum(CreatorPost.like_count), 0),
            func.coalesce(func.sum(CreatorPost.comment_count), 0),
            func.coalesce(func.sum(CreatorPost.view_count), 0),
        ).where((CreatorPost.creator_id == creator.id) & (CreatorPost.status == "published"))
    )).one()
    return {
        "subscriber_count": subs,
        "price_cents": int(creator.price_cents or 0),
        "gross_monthly_cents": gross_cents,
        "est_monthly_cents": creator_cents,
        "total_likes": int(agg[0]),
        "total_comments": int(agg[1]),
        "total_views": int(agg[2]),
        "post_count": int(creator.post_count or 0),
        "apple_review_status": creator.apple_review_status,
        "status": creator.status,
    }


# ═══════════════════════════════════════════════════════════════════════════
#  USER SIDE — discovery, feed, engagement, subscription
# ═══════════════════════════════════════════════════════════════════════════
@router.get("/browse")
async def browse_creators(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(
        select(Creator).where(Creator.status == "live")
        .order_by(Creator.subscriber_count.desc()).limit(50)
    )).scalars().all()
    # which of these the user already subscribes to
    my = (await db.execute(
        select(CreatorSubscription.creator_id).where(
            (CreatorSubscription.user_id == UUID(current_user["id"]))
            & (CreatorSubscription.status == "active")
        )
    )).scalars().all()
    mine = {str(x) for x in my}
    out = []
    for c in rows:
        d = creator_service.creator_public_dict(c)
        d["subscribed"] = str(c.id) in mine
        out.append(d)
    return {"creators": out}


@router.get("/by-maxx/{maxx_id}")
async def get_creator_by_maxx(
    maxx_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    creator = await creator_service.get_creator_by_maxx(maxx_id, db)
    if creator is None:
        raise HTTPException(status_code=404, detail="Not a creator max")
    d = creator_service.creator_public_dict(creator)
    d["subscribed"] = (await creator_service.active_subscription(current_user["id"], str(creator.id), db)) is not None
    d["is_owner"] = str(creator.user_id) == current_user["id"]
    return d


@router.get("/by-maxx/{maxx_id}/posts")
async def creator_feed(
    maxx_id: str,
    limit: int = Query(FEED_PAGE, ge=1, le=50),
    offset: int = Query(0, ge=0),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    creator = await creator_service.get_creator_by_maxx(maxx_id, db)
    if creator is None:
        raise HTTPException(status_code=404, detail="Not a creator max")
    access = await creator_service.has_creator_access(current_user["id"], creator, db)
    q = (
        select(CreatorPost).where(
            (CreatorPost.creator_id == creator.id) & (CreatorPost.status == "published")
        )
        .order_by(CreatorPost.pinned.desc(), CreatorPost.created_at.desc())
        .limit(limit).offset(offset)
    )
    rows = (await db.execute(q)).scalars().all()
    total = (await db.execute(
        select(func.count()).select_from(CreatorPost).where(
            (CreatorPost.creator_id == creator.id) & (CreatorPost.status == "published")
        )
    )).scalar_one() or 0
    liked = await _liked_post_ids(current_user["id"], [p.id for p in rows], db) if access else set()
    posts = [_post_dict(p, locked=not access, liked=str(p.id) in liked) for p in rows]
    return {"posts": posts, "total": int(total), "has_access": access, "creator": creator_service.creator_public_dict(creator)}


@router.post(
    "/posts/{post_id}/like",
    dependencies=[Depends(rate_limit(limit=120, window_s=60, scope="creator_like"))],
)
async def like_post(
    post_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    post = await _accessible_post(post_id, current_user["id"], db)
    exists = (await db.execute(
        select(CreatorPostLike.id).where(
            (CreatorPostLike.post_id == post.id) & (CreatorPostLike.user_id == UUID(current_user["id"]))
        )
    )).first()
    if not exists:
        db.add(CreatorPostLike(post_id=post.id, user_id=UUID(current_user["id"])))
        post.like_count = int(post.like_count or 0) + 1
        await db.commit()
    return {"ok": True, "like_count": int(post.like_count or 0)}


@router.delete("/posts/{post_id}/like")
async def unlike_post(
    post_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    post = await _accessible_post(post_id, current_user["id"], db)
    res = await db.execute(
        CreatorPostLike.__table__.delete().where(
            (CreatorPostLike.post_id == post.id) & (CreatorPostLike.user_id == UUID(current_user["id"]))
        )
    )
    if res.rowcount:
        post.like_count = max(0, int(post.like_count or 0) - 1)
        await db.commit()
    return {"ok": True, "like_count": int(post.like_count or 0)}


@router.get("/posts/{post_id}/comments")
async def list_comments(
    post_id: str,
    limit: int = Query(40, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    post = await _accessible_post(post_id, current_user["id"], db)
    rows = (await db.execute(
        select(CreatorPostComment, User).join(User, User.id == CreatorPostComment.user_id, isouter=True)
        .where((CreatorPostComment.post_id == post.id) & (CreatorPostComment.status == "visible"))
        .order_by(CreatorPostComment.pinned.desc(), CreatorPostComment.created_at.desc())
        .limit(limit).offset(offset)
    )).all()
    total = (await db.execute(
        select(func.count()).select_from(CreatorPostComment).where(
            (CreatorPostComment.post_id == post.id) & (CreatorPostComment.status == "visible")
        )
    )).scalar_one() or 0
    out = [_comment_dict(c, author=u, own=str(c.user_id) == current_user["id"]) for (c, u) in rows]
    return {"comments": out, "total": int(total)}


class CommentBody(BaseModel):
    body: str = Field(..., min_length=1, max_length=MAX_COMMENT_LEN)


@router.post(
    "/posts/{post_id}/comments",
    dependencies=[Depends(rate_limit(limit=20, window_s=300, scope="creator_comment"))],
)
async def add_comment(
    post_id: str,
    body: CommentBody,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    post = await _accessible_post(post_id, current_user["id"], db, require_sub=True)
    # blocked users can't comment on this creator's posts
    blocked = (await db.execute(
        select(CreatorBlock.id).where(
            (CreatorBlock.creator_id == post.creator_id)
            & (CreatorBlock.blocked_user_id == UUID(current_user["id"]))
        )
    )).first()
    if blocked:
        raise HTTPException(status_code=403, detail="You can't comment here.")
    text = body.body.strip()[:MAX_COMMENT_LEN]
    if not text:
        raise HTTPException(status_code=422, detail="Empty comment")
    comment = CreatorPostComment(
        post_id=post.id, creator_id=post.creator_id, user_id=UUID(current_user["id"]), body=text,
    )
    db.add(comment)
    post.comment_count = int(post.comment_count or 0) + 1
    await db.commit()
    await db.refresh(comment)
    return _comment_dict(comment, own=True)


@router.delete("/comments/{comment_id}")
async def delete_comment(
    comment_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a comment: the comment's author, the post's creator, or an admin."""
    comment = (await db.execute(
        select(CreatorPostComment).where(CreatorPostComment.id == UUID(comment_id))
    )).scalar_one_or_none()
    if comment is None or comment.status == "removed":
        return {"ok": True}
    creator = await creator_service.get_creator_by_id(str(comment.creator_id), db)
    is_owner_creator = creator is not None and str(creator.user_id) == current_user["id"]
    is_author = str(comment.user_id) == current_user["id"]
    if not (is_author or is_owner_creator or current_user.get("is_admin")):
        raise HTTPException(status_code=403, detail="Not allowed")
    comment.status = "removed"
    post = await db.get(CreatorPost, comment.post_id)
    if post is not None:
        post.comment_count = max(0, int(post.comment_count or 0) - 1)
    await db.commit()
    return {"ok": True}


class ReportBody(BaseModel):
    reason: str = Field("", max_length=2000)


@router.post(
    "/comments/{comment_id}/report",
    dependencies=[Depends(rate_limit(limit=30, window_s=3600, scope="creator_report"))],
)
async def report_comment(
    comment_id: str,
    body: ReportBody,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    comment = (await db.execute(
        select(CreatorPostComment).where(CreatorPostComment.id == UUID(comment_id))
    )).scalar_one_or_none()
    if comment is None or comment.status == "removed":
        raise HTTPException(status_code=404, detail="Comment not found")
    if str(comment.user_id) == current_user["id"]:
        raise HTTPException(status_code=400, detail="You can't report your own comment.")
    exists = (await db.execute(
        select(CreatorCommentReport.id).where(
            (CreatorCommentReport.comment_id == comment.id)
            & (CreatorCommentReport.reporter_user_id == UUID(current_user["id"]))
        )
    )).first()
    if exists:
        return {"ok": True, "message": "Thanks — we're already reviewing this."}
    db.add(CreatorCommentReport(
        comment_id=comment.id, creator_id=comment.creator_id,
        reporter_user_id=UUID(current_user["id"]), reason=body.reason or "",
    ))
    comment.report_count = int(comment.report_count or 0) + 1
    await creator_service.maybe_auto_hide_comment(comment, db)
    await db.commit()
    # Guideline 1.2 acknowledgement copy.
    return {"ok": True, "message": "Thank you. Our team will review this report."}


@router.get("/subscriptions")
async def my_subscriptions(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(
        select(CreatorSubscription, Creator).join(Creator, Creator.id == CreatorSubscription.creator_id)
        .where(CreatorSubscription.user_id == UUID(current_user["id"]))
        .order_by(CreatorSubscription.updated_at.desc())
    )).all()
    out = []
    for (sub, creator) in rows:
        d = creator_service.creator_public_dict(creator)
        d["subscription"] = {
            "status": sub.status,
            "expires_at": sub.expires_at.isoformat() if sub.expires_at else None,
            "auto_renew": bool(sub.auto_renew),
            "billing_provider": sub.billing_provider,
        }
        out.append(d)
    return {"subscriptions": out}


# ── Subscription activation (Apple verify + dev bypass) ─────────────────────
class CreatorVerifyBody(BaseModel):
    transaction_id: str
    product_id: Optional[str] = None


@router.post(
    "/subscribe/{maxx_id}/verify",
    dependencies=[Depends(rate_limit(limit=20, window_s=300, scope="creator_verify"))],
)
async def verify_creator_subscription(
    maxx_id: str,
    body: CreatorVerifyBody,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Verify an Apple auto-renewable purchase of a creator sub and activate it.
    Requires the Chad base sub underneath (creator subs are add-ons)."""
    if not current_user.get("is_paid", False):
        raise HTTPException(status_code=402, detail="A Chad subscription is required first.")
    creator = await creator_service.get_creator_by_maxx(maxx_id, db)
    if creator is None:
        raise HTTPException(status_code=404, detail="Not a creator max")

    from services.apple_iap_service import (
        apple_iap_configured, fetch_transaction_claims, validate_claims_for_user,
        subscription_active_from_claims, expires_datetime_from_claims,
    )
    if apple_iap_configured():
        try:
            claims = await fetch_transaction_claims(body.transaction_id)
            validate_claims_for_user(claims, current_user["id"])
        except Exception as e:
            logger.warning("creator apple verify failed: %s", e)
            raise HTTPException(status_code=401, detail="Could not verify purchase.")
        if not subscription_active_from_claims(claims):
            await creator_service.deactivate_creator_subscription(
                user_id=current_user["id"], creator=creator, db=db, status="expired"
            )
            await db.commit()
            return {"status": "expired"}
        otxn = str(claims.get("originalTransactionId") or body.transaction_id)
        expires = expires_datetime_from_claims(claims)
        await creator_service.activate_creator_subscription(
            user_id=current_user["id"], creator=creator,
            product_id=str(claims.get("productId") or body.product_id or ""),
            original_transaction_id=otxn, provider="apple", expires_at=expires, db=db,
        )
        await db.commit()
        return {"status": "ok"}

    # Not server-verifiable: block in production (anti-fraud), trust client in dev.
    if settings.is_production:
        raise HTTPException(status_code=503, detail="Purchase verification unavailable. Try again shortly.")
    await creator_service.activate_creator_subscription(
        user_id=current_user["id"], creator=creator,
        product_id=body.product_id or creator.apple_product_id,
        original_transaction_id=body.transaction_id, provider="apple", expires_at=None, db=db,
    )
    await db.commit()
    return {"status": "ok"}


@router.post("/subscribe/{maxx_id}/dev-activate")
async def dev_activate_creator_subscription(
    maxx_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """DEV-ONLY (production-blocked): grant a creator subscription without Apple,
    so the full loop is testable on the simulator. Mirrors /payments/test-activate."""
    if settings.is_production:
        raise HTTPException(status_code=403, detail="Only available in development mode")
    creator = await creator_service.get_creator_by_maxx(maxx_id, db)
    if creator is None:
        raise HTTPException(status_code=404, detail="Not a creator max")
    await creator_service.activate_creator_subscription(
        user_id=current_user["id"], creator=creator,
        product_id=creator.apple_product_id, original_transaction_id=f"dev_{current_user['id'][:8]}",
        provider="dev", expires_at=None, db=db,
    )
    await db.commit()
    return {"status": "ok", "maxx_id": maxx_id}


# ═══════════════════════════════════════════════════════════════════════════
#  Internal helpers
# ═══════════════════════════════════════════════════════════════════════════
async def _accessible_post(
    post_id: str, user_id: str, db: AsyncSession, *, require_sub: bool = False
) -> CreatorPost:
    """Load a published post the user is allowed to engage with. `require_sub`
    forces an active subscription (for commenting); likes allow the owner too."""
    try:
        pid = UUID(post_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Post not found")
    post = (await db.execute(
        select(CreatorPost).where((CreatorPost.id == pid) & (CreatorPost.status == "published"))
    )).scalar_one_or_none()
    if post is None:
        raise HTTPException(status_code=404, detail="Post not found")
    creator = await creator_service.get_creator_by_id(str(post.creator_id), db)
    if creator is None:
        raise HTTPException(status_code=404, detail="Post not found")
    if not await creator_service.has_creator_access(user_id, creator, db):
        raise HTTPException(status_code=403, detail="Subscribe to interact.")
    if require_sub and str(creator.user_id) != user_id and not (
        await creator_service.active_subscription(user_id, str(creator.id), db)
    ):
        raise HTTPException(status_code=403, detail="Subscribe to comment.")
    return post


async def _fanout_new_post(*, creator_id: str, maxx_id: str, creator_name: str, preview: str) -> None:
    """Enqueue a 'new update' push for every active subscriber (own DB session,
    chunked). Uses the existing queued-notification worker for delivery + caps."""
    from models.sqlalchemy_models import ScheduledNotification
    try:
        async with AsyncSessionLocal() as db:
            subs = (await db.execute(
                select(CreatorSubscription.user_id).where(
                    (CreatorSubscription.creator_id == UUID(creator_id))
                    & (CreatorSubscription.status == "active")
                )
            )).scalars().all()
            if not subs:
                return
            now = datetime.now(timezone.utc)
            body = f"{creator_name} posted: {preview}" if preview else f"New update from {creator_name}"
            body = body[:140]
            for uid in subs:
                db.add(ScheduledNotification(
                    user_id=uid,
                    scheduled_for=now,
                    message=body,
                    category_id="creator_update",
                    status="pending",
                ))
            await db.commit()
            logger.info("creator fanout: queued %d pushes for maxx=%s", len(subs), maxx_id)
    except Exception:
        logger.exception("creator fanout failed maxx=%s", maxx_id)
