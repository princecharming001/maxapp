"""assemble_user_brief — the single per-user CONTEXT LAYER every AI path reads.

The problem this solves: the app's memory (chat history, extracted user_facts,
durable UserMemory, the personalization profile, the active plan) was stitched
together differently at each call site — so one code path could re-ask a thing
another already knew (the "what are you trying to fix?" bug). This makes it a
RULE: one cached function merges everything and exposes:

  • .prose          — the injectable context block for the RAG + agent prompts
  • .searchable     — a lowercased concatenation of everything we KNOW about the
                      user (recent turns + facts + durable memory + onboarding),
                      so any clarifier can `.knows(regex)` and skip what's known
  • .known          — normalized canonical slots {slot: value}
  • .low_confidence — known facts whose best evidence is weak (feeds "still true?")

Consulted before every clarifier gate, RAG answer, and agent turn, so no path
re-asks what another path already learned — across chats and app surfaces.
"""
from __future__ import annotations

import logging
import re
import time
from dataclasses import dataclass, field
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

_TTL_SECONDS = 30.0
_CACHE: dict[str, tuple[float, "UserBrief"]] = {}
_LOW_CONFIDENCE = 0.5  # UserMemory.confidence below this is "worth re-confirming"

# Canonical slots we try to fill, mapped from user_facts / onboarding keys.
_SLOT_SOURCES = {
    "skin_concern": ("primary_skin_concern",),
    "skin_type": ("skin_type",),
    "hair_type": ("hair_type",),
    "goal": ("primary_goal",),
    "experience_level": ("experience_level",),
    "wake_time": ("wake_time",),
    "sleep_time": ("sleep_time",),
    "diet": ("diet",),
    "biological_sex": ("biological_sex", "gender"),
}


@dataclass
class UserBrief:
    user_id: str
    prose: str = ""                       # injectable context block for prompts
    recent_turns: str = ""
    profile_block: str = ""
    personalization: str = ""
    plan_summary: str = ""
    searchable: str = ""                  # lowercased "everything we know" for regex checks
    known: dict[str, Any] = field(default_factory=dict)
    low_confidence: list[dict] = field(default_factory=list)
    facts: dict[str, Any] = field(default_factory=dict)

    def knows(self, pattern: "re.Pattern | str") -> bool:
        """True if the user's known context already names something matching
        `pattern` (a compiled regex or a plain substring). Used by clarifiers to
        skip a question we can already answer."""
        if not self.searchable:
            return False
        if isinstance(pattern, str):
            return pattern.lower() in self.searchable
        try:
            return bool(pattern.search(self.searchable))
        except Exception:
            return False


def invalidate_brief(user_id: str) -> None:
    """Drop the cached brief (call after writing new facts/memory)."""
    _CACHE.pop(str(user_id), None)


async def assemble_user_brief(
    user_id: str,
    db: AsyncSession,
    *,
    history: Optional[list[dict]] = None,
    force: bool = False,
) -> UserBrief:
    """Merge the whole per-user context into one cached brief. Never raises —
    a partial brief (or an empty one) is always safe to consult."""
    uid = str(user_id)
    now = time.time()
    if not force and history is None:
        cached = _CACHE.get(uid)
        if cached and now - cached[0] < _TTL_SECONDS:
            return cached[1]

    brief = UserBrief(user_id=uid)
    try:
        from models.sqlalchemy_models import User, ChatHistory, UserSchedule
        from services.user_context_service import get_context
        from services.user_facts_service import FACTS_KEY, format_facts_for_prompt, PROFILE_SCALARS
        from services.conversation_memory import build_memory_context

        user = None
        try:
            from uuid import UUID
            user = await db.get(User, UUID(uid))
        except Exception:
            user = None
        onboarding = dict(getattr(user, "onboarding", None) or {})

        # persistent context + extracted facts
        persistent_ctx = {}
        try:
            persistent_ctx = await get_context(uid, db) or {}
        except Exception:
            persistent_ctx = {}
        facts = dict(persistent_ctx.get(FACTS_KEY) or {})
        brief.facts = facts

        # recent conversation (this + recent chats)
        turns = history
        if turns is None:
            try:
                rows = (await db.execute(
                    select(ChatHistory.role, ChatHistory.content)
                    .where(ChatHistory.user_id == user.id, ChatHistory.channel == "app")
                    .order_by(ChatHistory.created_at.desc())
                    .limit(20)
                )).all()
                turns = [{"role": r[0], "content": r[1]} for r in reversed(rows)]
            except Exception:
                turns = []

        # recent turns + profile block (reuse the existing formatter)
        try:
            mc = build_memory_context(
                history=turns, user_facts=facts, onboarding=onboarding,
                persistent_ctx=persistent_ctx, exclude_current_user_message=False,
            )
            brief.recent_turns = mc.recent_turns or ""
            brief.profile_block = mc.user_profile or ""
        except Exception:
            pass

        # personalization brief
        try:
            from services.personalization import personalization_brief as _pbrief
            brief.personalization = (await _pbrief(db, uid)) or ""
        except Exception:
            brief.personalization = ""

        # durable memory facts (with confidence → low-confidence list)
        mem_texts: list[str] = []
        try:
            from services.personalization import get_memories
            for m in await get_memories(db, uid):
                txt = (getattr(m, "text", "") or "").strip()
                if txt:
                    mem_texts.append(txt)
                conf = float(getattr(m, "confidence", 0.8) or 0.8)
                if conf < _LOW_CONFIDENCE:
                    brief.low_confidence.append({
                        "key": getattr(m, "key", None),
                        "text": txt,
                        "confidence": round(conf, 2),
                        "source": getattr(m, "source", "chat"),
                    })
        except Exception:
            pass

        # active plan summary
        try:
            srows = (await db.execute(
                select(UserSchedule.maxx_id, UserSchedule.course_title)
                .where(UserSchedule.user_id == user.id, UserSchedule.is_active.is_(True))
            )).all()
            labels = [str(r[1] or r[0]) for r in srows if (r[0] or r[1])]
            if labels:
                brief.plan_summary = "active plans: " + ", ".join(dict.fromkeys(labels))
        except Exception:
            pass

        # canonical known slots (facts → onboarding fallback)
        for slot, keys in _SLOT_SOURCES.items():
            val = None
            for k in keys:
                v = facts.get(k) if facts else None
                if v in (None, "", [], {}):
                    v = onboarding.get(k)
                if v not in (None, "", [], {}):
                    val = v
                    break
            if val is not None:
                brief.known[slot] = val

        # searchable blob: recent USER turns + fact values + memory + onboarding scalars
        parts: list[str] = []
        for t in (turns or []):
            if t.get("role") == "user" and t.get("content"):
                parts.append(str(t["content"]))
        for v in (facts or {}).values():
            if isinstance(v, (str, int, float)):
                parts.append(str(v))
            elif isinstance(v, list):
                parts.extend(str(x) for x in v if isinstance(x, (str, int, float)))
        parts.extend(mem_texts)
        for k in PROFILE_SCALARS:
            ov = onboarding.get(k)
            if isinstance(ov, (str, int, float)):
                parts.append(str(ov))
        brief.searchable = " \n ".join(parts).lower()

        # injectable prose (only the parts that carry signal)
        prose_parts = [p for p in [
            brief.personalization.strip(),
            brief.profile_block.strip(),
            brief.plan_summary.strip(),
            brief.recent_turns.strip(),
        ] if p]
        brief.prose = "\n\n".join(prose_parts)
    except Exception as e:
        logger.warning("assemble_user_brief degraded (non-fatal): %s", e)

    if history is None:
        _CACHE[uid] = (now, brief)
    return brief
