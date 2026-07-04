"""chat_memory — recall relevant things the user said in EARLIER conversations.

The default chat window is the last ~20 messages of the CURRENT thread, so a
detail from another conversation ("i'm on tretinoin", "i'm training for a
marathon") is invisible once it scrolls off. This retrieves the most relevant
prior USER turns across ALL of the user's conversations and hands them to the
agent, so it can recall "you mentioned tretinoin last week" without the user
repeating themselves — true cross-chat memory.

v1 scores by significant-token overlap (fast, no embeddings, works everywhere).
It's a drop-in seam for pgvector: swap `recall_relevant_turns` for an embedding
KNN when the vector store is provisioned; callers don't change.
"""
from __future__ import annotations

import logging
import re
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

_STOPWORDS = {
    "the", "a", "an", "and", "or", "but", "for", "to", "of", "in", "on", "at",
    "is", "are", "am", "was", "were", "be", "been", "i", "im", "i'm", "you",
    "my", "me", "we", "it", "this", "that", "what", "how", "can", "do", "does",
    "give", "get", "want", "need", "have", "has", "with", "about", "please",
    "would", "should", "could", "some", "any", "your", "our", "so", "just",
    "like", "help", "tell", "make", "routine", "plan", "good", "best",
}
_TOKEN_RE = re.compile(r"[a-z][a-z0-9'\-]{2,}")


def _significant_tokens(text: str) -> set[str]:
    if not text:
        return set()
    return {t for t in _TOKEN_RE.findall(text.lower()) if t not in _STOPWORDS}


async def recall_relevant_turns(
    user_id: str, query: str, db: AsyncSession, *, k: int = 3, scan: int = 200
) -> list[str]:
    """Up to `k` past USER turns most relevant to `query`, across every
    conversation, ranked by significant-token overlap. Excludes the trivially
    recent (the current-thread window already carries those). Never raises."""
    try:
        q_tokens = _significant_tokens(query)
        if not q_tokens:
            return []
        from models.sqlalchemy_models import ChatHistory
        rows = (await db.execute(
            select(ChatHistory.content)
            .where(ChatHistory.user_id == UUID(str(user_id)), ChatHistory.role == "user")
            .order_by(ChatHistory.created_at.desc())
            .limit(scan)
        )).scalars().all()
        # Skip the newest few (they're in the live window already).
        candidates = rows[6:]
        scored: list[tuple[int, str]] = []
        for c in candidates:
            if not c:
                continue
            shared = q_tokens & _significant_tokens(c)
            if not shared:
                continue
            # Weight specific/rare tokens: one shared long, specific term (e.g.
            # "tretinoin", "marathon", "minoxidil") is a strong recall signal on
            # its own; short/common shared tokens need company to count.
            score = sum(2 if len(t) >= 7 else 1 for t in shared)
            if score >= 2:
                scored.append((score, c.strip()))
        scored.sort(key=lambda x: -x[0])
        out: list[str] = []
        seen: set[str] = set()
        for _, c in scored:
            key = c.lower()[:80]
            if key in seen:
                continue
            seen.add(key)
            out.append(c if len(c) <= 160 else c[:157] + "…")
            if len(out) >= k:
                break
        return out
    except Exception as e:
        logger.debug("recall_relevant_turns skipped: %s", e)
        return []
