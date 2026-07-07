"""Creator post-approval onboarding wizard API."""
from __future__ import annotations

import logging
import os
import re
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from db.sqlalchemy import get_db
from middleware.auth_middleware import require_creator_user
from middleware.rate_limit import rate_limit
from models.sqlalchemy_models import CreatorVoiceSample
from services import creator_onboarding_service as onboarding
from services import creator_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/creators/me/onboarding", tags=["CreatorOnboarding"])

_MAX_DOC_BYTES = 25 * 1024 * 1024


async def _creator(current_user: dict, db: AsyncSession):
    c = await creator_service.get_creator_by_user(current_user["id"], db)
    if c is None:
        raise HTTPException(status_code=404, detail="No creator profile")
    return c


async def _samples(creator_id, db: AsyncSession):
    return (
        await db.execute(
            select(CreatorVoiceSample)
            .where(CreatorVoiceSample.creator_id == creator_id)
            .order_by(CreatorVoiceSample.sort.asc())
        )
    ).scalars().all()


@router.get("")
async def get_onboarding(
    current_user: dict = Depends(require_creator_user),
    db: AsyncSession = Depends(get_db),
):
    creator = await _creator(current_user, db)
    await onboarding.copy_application_docs(creator, str(current_user["id"]), db)
    samples = await _samples(creator.id, db)
    await db.commit()
    return onboarding.onboarding_state_dict(creator, samples)


class StepBody(BaseModel):
    step: int = Field(..., ge=0, le=9)


@router.patch("/step")
async def set_step(
    body: StepBody,
    current_user: dict = Depends(require_creator_user),
    db: AsyncSession = Depends(get_db),
):
    creator = await _creator(current_user, db)
    creator.onboarding_step = body.step
    creator.updated_at = datetime.utcnow()
    await db.commit()
    samples = await _samples(creator.id, db)
    return onboarding.onboarding_state_dict(creator, samples)


@router.post("/analyze")
async def analyze_docs(
    current_user: dict = Depends(require_creator_user),
    db: AsyncSession = Depends(get_db),
):
    creator = await _creator(current_user, db)
    result = await onboarding.analyze_knowledge(creator, db)
    creator.onboarding_step = max(int(creator.onboarding_step or 0), 1)
    await db.commit()
    samples = await _samples(creator.id, db)
    return {"analysis": result, **onboarding.onboarding_state_dict(creator, samples)}


class DocsBody(BaseModel):
    docs: list[dict]


@router.put("/docs")
async def set_docs(
    body: DocsBody,
    current_user: dict = Depends(require_creator_user),
    db: AsyncSession = Depends(get_db),
):
    creator = await _creator(current_user, db)
    creator.knowledge_docs = body.docs[:30]
    await db.commit()
    samples = await _samples(creator.id, db)
    return onboarding.onboarding_state_dict(creator, samples)


@router.post("/upload-doc")
async def upload_doc(
    file: UploadFile = File(...),
    current_user: dict = Depends(require_creator_user),
    db: AsyncSession = Depends(get_db),
):
    creator = await _creator(current_user, db)
    data = await file.read()
    if len(data) > _MAX_DOC_BYTES:
        raise HTTPException(status_code=413, detail="File too large (25 MB max).")
    uid = str(current_user["id"])
    ext = os.path.splitext(file.filename or "doc")[1] or ".bin"
    safe_name = re.sub(r"[^A-Za-z0-9._-]", "_", (file.filename or "document"))[:120]
    subdir = os.path.join(os.path.dirname(__file__), "..", "uploads", "creator_docs", uid)
    os.makedirs(subdir, exist_ok=True)
    stored = f"{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:8]}{ext}"
    path = os.path.join(subdir, stored)
    with open(path, "wb") as f:
        f.write(data)
    doc = {
        "filename": safe_name,
        "url": f"/uploads/creator_docs/{uid}/{stored}",
        "source": "local",
        "size_bytes": len(data),
    }
    docs = list(creator.knowledge_docs or [])
    docs.append(doc)
    creator.knowledge_docs = docs
    await db.commit()
    return doc


class LinkDocBody(BaseModel):
    url: str
    filename: str | None = None


@router.post("/link-doc")
async def link_doc(
    body: LinkDocBody,
    current_user: dict = Depends(require_creator_user),
    db: AsyncSession = Depends(get_db),
):
    creator = await _creator(current_user, db)
    url = body.url.strip()
    if not url.startswith("http"):
        raise HTTPException(status_code=422, detail="Enter a valid URL.")
    doc = {
        "filename": (body.filename or "Google Drive link").strip()[:120],
        "url": url,
        "source": "gdrive" if "drive.google" in url else "link",
    }
    docs = list(creator.knowledge_docs or [])
    docs.append(doc)
    creator.knowledge_docs = docs
    await db.commit()
    return doc


class VoiceAnswerBody(BaseModel):
    sample_id: str
    answer: str = Field(..., min_length=1, max_length=2000)


@router.post("/voice/answer")
async def voice_answer(
    body: VoiceAnswerBody,
    current_user: dict = Depends(require_creator_user),
    db: AsyncSession = Depends(get_db),
):
    creator = await _creator(current_user, db)
    try:
        sid = uuid.UUID(body.sample_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="Bad sample id")
    sample = await db.get(CreatorVoiceSample, sid)
    if sample is None or sample.creator_id != creator.id:
        raise HTTPException(status_code=404, detail="Not found")
    sample.creator_answer = body.answer.strip()
    sample.status = "answered"
    sample.approved = True
    samples = await _samples(creator.id, db)
    answered = sum(1 for s in samples if s.creator_answer)
    phase = onboarding.voice_phase(creator, answered)
    if phase >= 2:
        nxt = await onboarding.next_voice_sample(creator, db)
        if nxt and nxt.status == "pending" and not nxt.draft_answer:
            nxt.draft_answer = await onboarding.generate_voice_draft(creator, nxt, db)
            nxt.status = "draft"
    elif phase == 1:
        nxt = await onboarding.next_voice_sample(creator, db)
        if nxt and nxt.id == sample.id:
            pass  # same sample still pending — ok
    creator.onboarding_step = max(int(creator.onboarding_step or 0), 3)
    await db.commit()
    samples = await _samples(creator.id, db)
    return onboarding.onboarding_state_dict(creator, samples)


class VoiceFeedbackBody(BaseModel):
    sample_id: str
    approved: bool
    correction: str | None = None


@router.post("/voice/feedback")
async def voice_feedback(
    body: VoiceFeedbackBody,
    current_user: dict = Depends(require_creator_user),
    db: AsyncSession = Depends(get_db),
):
    creator = await _creator(current_user, db)
    try:
        sid = uuid.UUID(body.sample_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="Bad sample id")
    sample = await db.get(CreatorVoiceSample, sid)
    if sample is None or sample.creator_id != creator.id:
        raise HTTPException(status_code=404, detail="Not found")
    if body.approved:
        sample.creator_answer = sample.draft_answer or sample.creator_answer
        sample.status = "approved"
        sample.approved = True
    else:
        sample.creator_answer = (body.correction or sample.creator_answer or "").strip()
        sample.status = "answered"
        sample.approved = False
    await db.commit()
    samples = await _samples(creator.id, db)
    return onboarding.onboarding_state_dict(creator, samples)


class HabitLibraryBody(BaseModel):
    habits: list[dict]


@router.put("/habits")
async def update_habit_library(
    body: HabitLibraryBody,
    current_user: dict = Depends(require_creator_user),
    db: AsyncSession = Depends(get_db),
):
    creator = await _creator(current_user, db)
    meta = onboarding._meta(creator)
    meta["habit_library"] = body.habits[:50]
    onboarding._set_meta(creator, meta)
    creator.onboarding_step = max(int(creator.onboarding_step or 0), 4)
    await db.commit()
    samples = await _samples(creator.id, db)
    return onboarding.onboarding_state_dict(creator, samples)


class PricingBody(BaseModel):
    tier: str = Field(..., pattern="^(free|t1|t2|t3|t4)$")


@router.patch("/pricing")
async def set_pricing(
    body: PricingBody,
    current_user: dict = Depends(require_creator_user),
    db: AsyncSession = Depends(get_db),
):
    creator = await _creator(current_user, db)
    creator.price_tier = body.tier
    creator.price_cents = creator_service.price_cents_for_tier(body.tier)
    creator.onboarding_step = max(int(creator.onboarding_step or 0), 6)
    await db.commit()
    samples = await _samples(creator.id, db)
    return onboarding.onboarding_state_dict(creator, samples)


class MediaBody(BaseModel):
    intro_video_url: str | None = None
    welcome_message: str | None = Field(None, max_length=2000)


@router.patch("/media")
async def set_media(
    body: MediaBody,
    current_user: dict = Depends(require_creator_user),
    db: AsyncSession = Depends(get_db),
):
    creator = await _creator(current_user, db)
    if body.intro_video_url is not None:
        creator.intro_video_url = body.intro_video_url.strip()[:500] or None
    if body.welcome_message is not None:
        creator.welcome_message = body.welcome_message.strip()
    creator.onboarding_step = max(int(creator.onboarding_step or 0), 7)
    await db.commit()
    samples = await _samples(creator.id, db)
    return onboarding.onboarding_state_dict(creator, samples)


class TestChatBody(BaseModel):
    message: str = Field(..., min_length=1, max_length=500)


@router.post(
    "/test-chat",
    dependencies=[Depends(rate_limit(limit=30, window_s=600, scope="creator_test_chat"))],
)
async def test_chat(
    body: TestChatBody,
    current_user: dict = Depends(require_creator_user),
    db: AsyncSession = Depends(get_db),
):
    creator = await _creator(current_user, db)
    reply = await onboarding.test_chat(creator, body.message.strip(), db)
    creator.onboarding_step = max(int(creator.onboarding_step or 0), 5)
    await db.commit()
    samples = await _samples(creator.id, db)
    return {"reply": reply, **onboarding.onboarding_state_dict(creator, samples)}


@router.post("/test-reset")
async def test_reset(
    current_user: dict = Depends(require_creator_user),
    db: AsyncSession = Depends(get_db),
):
    creator = await _creator(current_user, db)
    meta = onboarding._meta(creator)
    meta["test_chat"] = []
    onboarding._set_meta(creator, meta)
    await db.commit()
    samples = await _samples(creator.id, db)
    return onboarding.onboarding_state_dict(creator, samples)


@router.post("/sync-habits")
async def sync_habits(
    current_user: dict = Depends(require_creator_user),
    db: AsyncSession = Depends(get_db),
):
    creator = await _creator(current_user, db)
    n = await onboarding.sync_habit_library(creator, db)
    await db.commit()
    return {"synced": n}


@router.post("/launch")
async def launch(
    current_user: dict = Depends(require_creator_user),
    db: AsyncSession = Depends(get_db),
):
    creator = await _creator(current_user, db)
    try:
        await onboarding.launch_creator(creator, db, is_production=settings.is_production)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    await db.commit()
    samples = await _samples(creator.id, db)
    return onboarding.onboarding_state_dict(creator, samples)
