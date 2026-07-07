"""Creator post-approval onboarding — knowledge ingest, voice teaching, habit library."""
from __future__ import annotations

import json
import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from models.sqlalchemy_models import (
    Creator,
    CreatorApplication,
    CreatorHabit,
    CreatorPost,
    CreatorVoiceSample,
)
from services import creator_service
from services.claude_service import claude_service

logger = logging.getLogger(__name__)

ONBOARDING_COMPLETE_STEP = 9
VOICE_PHASE1_COUNT = 8
VOICE_PHASE2_COUNT = 15

DEFAULT_VOICE_QUESTIONS = [
    "How long until this actually works?",
    "What should a beginner do on day one?",
    "How do I know if I'm doing it wrong?",
    "How much time per day do I really need?",
    "What mistakes do most people make?",
    "Can I skip rest days?",
    "What results should I expect in 30 days?",
    "How do I stay consistent when I'm busy?",
    "Is this safe to combine with other routines?",
    "What gear or tools do I actually need?",
]

_ASSIST = (
    "You help creators onboard a coaching max on a self-improvement app. "
    "Reply with RAW JSON only — no fences, no commentary."
)


def _meta(creator: Creator) -> dict:
    m = creator.onboarding_meta
    return dict(m) if isinstance(m, dict) else {}


def _set_meta(creator: Creator, meta: dict) -> None:
    creator.onboarding_meta = meta


def voice_phase(creator: Creator, answered: int) -> int:
    if answered < VOICE_PHASE1_COUNT:
        return 1
    if answered < VOICE_PHASE2_COUNT:
        return 2
    return 3


def voice_pct(creator: Creator, samples: list[CreatorVoiceSample]) -> int:
    answered = sum(1 for s in samples if s.creator_answer)
    approved = sum(1 for s in samples if s.status == "approved" or s.approved is True)
    if not samples:
        return 0
    return min(100, int((answered * 6 + approved * 4) / max(len(samples), 1)))


def protocols_pct(creator: Creator) -> int:
    meta = _meta(creator)
    if meta.get("protocols_pct") is not None:
        return int(meta["protocols_pct"])
    docs = creator.knowledge_docs or []
    if not docs:
        return 0
    return min(95, 40 + len(docs) * 15)


async def copy_application_docs(creator: Creator, user_id: str, db: AsyncSession) -> None:
    """Hand off course_docs from the approved application."""
    if creator.knowledge_docs:
        return
    row = (
        await db.execute(
            select(CreatorApplication)
            .where(CreatorApplication.user_id == uuid.UUID(str(user_id)))
            .order_by(CreatorApplication.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if row and row.course_docs:
        creator.knowledge_docs = list(row.course_docs)


def _default_habit_library(creator: Creator) -> list[dict]:
    name = creator.display_name or creator.maxx_id
    return [
        {
            "id": str(uuid.uuid4()),
            "title": f"Morning {creator.maxx_id} check-in",
            "description": "5 min review of today's focus and cues.",
            "duration_minutes": 5,
            "frequency_type": "daily",
            "frequency_n": 1,
            "window": "morning",
            "tags": ["Foundation"],
            "conditions": ["shown to all beginners"],
            "sample_questions": ["What should I do first thing?", "How do I start my day?"],
            "shown_to_count": 100,
            "enabled": True,
        },
        {
            "id": str(uuid.uuid4()),
            "title": "Core protocol block",
            "description": f"The main daily practice from {name}'s method.",
            "duration_minutes": 15,
            "frequency_type": "daily",
            "frequency_n": 1,
            "window": "any",
            "tags": ["Protocol"],
            "conditions": ["goal matches this max", "past the first week"],
            "sample_questions": DEFAULT_VOICE_QUESTIONS[:3],
            "shown_to_count": 67,
            "enabled": True,
        },
        {
            "id": str(uuid.uuid4()),
            "title": "Evening recovery routine",
            "description": "Wind-down habits that support progress.",
            "duration_minutes": 10,
            "frequency_type": "daily",
            "frequency_n": 1,
            "window": "evening",
            "tags": ["Recovery"],
            "conditions": ["training 3+ days/week", "reports soreness or fatigue"],
            "sample_questions": ["Should I rest tonight?", "How do I recover faster?"],
            "shown_to_count": 42,
            "enabled": True,
        },
    ]


async def analyze_knowledge(creator: Creator, db: AsyncSession) -> dict[str, Any]:
    """Score protocols + generate habit library and voice question queue."""
    meta = _meta(creator)
    docs = creator.knowledge_docs or []
    doc_summary = "\n".join(
        f"- {d.get('filename', 'doc')}: {d.get('url', '')}" for d in docs[:20]
    )
    topic = creator.tagline or creator.display_name or creator.maxx_id

    habits: list[dict] = []
    questions: list[str] = list(DEFAULT_VOICE_QUESTIONS)
    pct = min(95, 50 + len(docs) * 12) if docs else 35

    raw = await claude_service.simple_completion(
        user_prompt=(
            f"Max: {creator.maxx_id}. Topic: {topic}.\n"
            f"Creator docs:\n{doc_summary or '(no docs yet)'}\n\n"
            "Return JSON: {\"protocols_pct\": 0-95, \"habits\": [{\"title\",\"description\","
            "\"duration_minutes\":10,\"tags\":[\"tag\"],\"conditions\":[\"when shown\"],"
            "\"sample_questions\":[\"q1\"],\"shown_to_count\":30}], "
            "\"voice_questions\": [\"subscriber question\", ...]}"
        ),
        system_prompt=_ASSIST,
        max_tokens=2000,
    )
    if raw:
        try:
            obj = json.loads(re.sub(r"^```(?:json)?|```$", "", raw.strip(), flags=re.MULTILINE))
            if isinstance(obj.get("protocols_pct"), (int, float)):
                pct = int(min(95, max(20, obj["protocols_pct"])))
            for h in (obj.get("habits") or [])[:50]:
                if not isinstance(h, dict) or not h.get("title"):
                    continue
                habits.append({
                    "id": str(uuid.uuid4()),
                    "title": str(h["title"])[:60],
                    "description": str(h.get("description") or "")[:300],
                    "duration_minutes": min(90, max(2, int(h.get("duration_minutes") or 10))),
                    "frequency_type": "daily",
                    "frequency_n": 1,
                    "window": "any",
                    "tags": [str(t)[:24] for t in (h.get("tags") or [])[:5]],
                    "conditions": [str(c)[:120] for c in (h.get("conditions") or [])[:8]],
                    "sample_questions": [str(q)[:200] for q in (h.get("sample_questions") or [])[:5]],
                    "shown_to_count": int(h.get("shown_to_count") or 30),
                    "enabled": True,
                })
            vq = obj.get("voice_questions")
            if isinstance(vq, list) and vq:
                questions = [str(q)[:200] for q in vq[:20]]
        except Exception as e:
            logger.warning("[creator_onboarding] analyze parse failed: %s", e)

    if not habits:
        habits = _default_habit_library(creator)

    meta["protocols_pct"] = pct
    meta["habit_library"] = habits
    meta["voice_questions"] = questions
    meta["analyzed_at"] = datetime.now(timezone.utc).isoformat()
    _set_meta(creator, meta)

    # Seed voice sample rows if empty
    existing = (
        await db.execute(
            select(func.count()).select_from(CreatorVoiceSample).where(
                CreatorVoiceSample.creator_id == creator.id
            )
        )
    ).scalar_one()
    if not existing:
        for i, q in enumerate(questions[:12]):
            db.add(CreatorVoiceSample(
                creator_id=creator.id, question=q, sort=i, status="pending",
            ))

    return {"protocols_pct": pct, "habit_count": len(habits), "voice_questions": len(questions)}


async def next_voice_sample(creator: Creator, db: AsyncSession) -> Optional[CreatorVoiceSample]:
    for s in (
        await db.execute(
            select(CreatorVoiceSample)
            .where(CreatorVoiceSample.creator_id == creator.id)
            .order_by(CreatorVoiceSample.sort.asc())
        )
    ).scalars().all():
        if s.status in ("pending", "draft"):
            return s
    return None


async def generate_voice_draft(creator: Creator, sample: CreatorVoiceSample, db: AsyncSession) -> str:
    """Phase 2/3 — draft an answer in the creator's emerging voice."""
    prior = (
        await db.execute(
            select(CreatorVoiceSample)
            .where(
                (CreatorVoiceSample.creator_id == creator.id)
                & (CreatorVoiceSample.creator_answer.isnot(None))
            )
            .order_by(CreatorVoiceSample.created_at.desc())
            .limit(8)
        )
    ).scalars().all()
    examples = "\n".join(
        f"Q: {s.question}\nA: {s.creator_answer}" for s in reversed(prior) if s.creator_answer
    )
    draft = await claude_service.simple_completion(
        user_prompt=(
            f"You are {creator.display_name}, creator of {creator.maxx_id}.\n"
            f"Tagline: {creator.tagline}\n\n"
            f"Examples of how this creator writes:\n{examples or '(none yet)'}\n\n"
            f"Subscriber asks: {sample.question}\n\n"
            "Write ONE answer in their voice — direct, second person, no fluff. Max 120 words."
        ),
        system_prompt="You mimic a creator's voice from their sample answers.",
        max_tokens=400,
    )
    return (draft or "").strip()[:800]


async def sync_habit_library(creator: Creator, db: AsyncSession) -> int:
    """Push enabled habit_library entries into CreatorHabit rows."""
    meta = _meta(creator)
    library = [h for h in (meta.get("habit_library") or []) if h.get("enabled", True)]
    if len(library) < 2:
        library = _default_habit_library(creator)

    existing = (
        await db.execute(
            select(CreatorHabit).where(
                (CreatorHabit.creator_id == creator.id) & (CreatorHabit.status == "active")
            )
        )
    ).scalars().all()
    by_slug = {h.slug: h for h in existing}

    count = 0
    for i, item in enumerate(library[:8]):
        title = str(item.get("title") or f"Habit {i + 1}")[:60]
        slug = creator_service._slug(title) or f"habit{i + 1}"
        if slug in by_slug:
            row = by_slug[slug]
        else:
            row = CreatorHabit(
                creator_id=creator.id,
                maxx_id=creator.maxx_id,
                slug=slug,
            )
            db.add(row)
        row.title = title
        row.description = str(item.get("description") or "")[:300]
        row.duration_minutes = min(90, max(2, int(item.get("duration_minutes") or 10)))
        row.frequency_type = item.get("frequency_type") or "daily"
        row.frequency_n = int(item.get("frequency_n") or 1)
        row.window = item.get("window") if item.get("window") in ("morning", "evening", "any") else "any"
        row.targeting_conditions = item.get("conditions") or []
        row.sample_questions = item.get("sample_questions") or []
        row.sort = i
        row.status = "active"
        count += 1

    creator.habits_version = int(creator.habits_version or 1) + 1
    creator_service.register_creator_doc(creator)
    return count


async def test_chat(creator: Creator, message: str, db: AsyncSession) -> str:
    meta = _meta(creator)
    history = meta.get("test_chat") or []
    samples = (
        await db.execute(
            select(CreatorVoiceSample)
            .where(
                (CreatorVoiceSample.creator_id == creator.id)
                & (CreatorVoiceSample.creator_answer.isnot(None))
            )
            .limit(5)
        )
    ).scalars().all()
    voice_ex = "\n".join(f"- {s.creator_answer[:200]}" for s in samples)
    reply = await claude_service.simple_completion(
        user_prompt=(
            f"You are the AI coach for {creator.maxx_id} by {creator.display_name}.\n"
            f"Voice samples:\n{voice_ex or creator.tagline}\n\n"
            f"Subscriber: {message}\n\nReply in the creator's voice. Max 100 words."
        ),
        system_prompt=_ASSIST,
        max_tokens=300,
    )
    history = (history + [{"role": "user", "text": message}, {"role": "max", "text": reply}])[-20:]
    meta["test_chat"] = history
    _set_meta(creator, meta)
    return reply or "Still learning your voice — teach me a few more answers first."


async def launch_creator(creator: Creator, db: AsyncSession, *, is_production: bool) -> None:
    """Finalize onboarding: sync habits, intro post, go live."""
    await sync_habit_library(creator, db)
    welcome = (creator.welcome_message or "").strip()
    has_post = int((await db.execute(
        select(func.count()).select_from(CreatorPost).where(
            (CreatorPost.creator_id == creator.id) & (CreatorPost.status == "published")
        )
    )).scalar_one() or 0)
    if not has_post:
        body = welcome or f"Welcome to {creator.display_name}'s max. Let's get started."
        db.add(CreatorPost(
            creator_id=creator.id,
            maxx_id=creator.maxx_id,
            type="text",
            body=body[:2200],
            status="published",
        ))
        creator.post_count = int(creator.post_count or 0) + 1

    n_habits = int((await db.execute(
        select(func.count()).select_from(CreatorHabit).where(
            (CreatorHabit.creator_id == creator.id) & (CreatorHabit.status == "active")
        )
    )).scalar_one() or 0)
    if not (2 <= n_habits <= 8):
        raise ValueError("Need 2-8 habits before launch")
    if is_production and creator.price_tier != "free":
        if creator.apple_review_status != "approved":
            raise ValueError("Apple subscription still in review")
    creator.status = "live"
    creator.onboarding_step = ONBOARDING_COMPLETE_STEP
    creator.onboarding_completed_at = datetime.now(timezone.utc)
    creator.updated_at = datetime.now(timezone.utc)


def onboarding_state_dict(creator: Creator, samples: list[CreatorVoiceSample]) -> dict[str, Any]:
    meta = _meta(creator)
    answered = sum(1 for s in samples if s.creator_answer)
    phase = voice_phase(creator, answered)
    current = None
    for s in samples:
        if s.status in ("pending", "draft"):
            current = s
            break
    return {
        "step": int(creator.onboarding_step or 0),
        "complete": bool(creator.onboarding_completed_at) or int(creator.onboarding_step or 0) >= ONBOARDING_COMPLETE_STEP,
        "max_name": creator.maxx_id,
        "display_name": creator.display_name,
        "knowledge_docs": creator.knowledge_docs or [],
        "protocols_pct": protocols_pct(creator),
        "voice_pct": voice_pct(creator, samples),
        "voice_phase": phase,
        "voice_samples_total": len(samples),
        "voice_samples_answered": answered,
        "current_voice_sample": {
            "id": str(current.id),
            "question": current.question,
            "draft_answer": current.draft_answer,
            "status": current.status,
        } if current else None,
        "habit_library": meta.get("habit_library") or [],
        "voice_questions": meta.get("voice_questions") or DEFAULT_VOICE_QUESTIONS,
        "price_tier": creator.price_tier,
        "price_cents": creator.price_cents,
        "price_tiers": creator_service.PRICE_TIERS,
        "intro_video_url": creator.intro_video_url,
        "welcome_message": creator.welcome_message or "",
        "test_chat": meta.get("test_chat") or [],
        "status": creator.status,
    }
