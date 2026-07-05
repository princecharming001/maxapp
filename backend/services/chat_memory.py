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
    user_id: str, query: str, db: AsyncSession, *,
    k: int = 3, scan: int = 200,
    current_conversation_id: str | None = None,
) -> list[str]:
    """Up to `k` past USER turns most relevant to `query`, across every
    conversation, ranked by significant-token overlap. Excludes turns from
    the current conversation (already in the live window). Never raises."""
    try:
        q_tokens = _significant_tokens(query)
        if not q_tokens:
            return []
        from models.sqlalchemy_models import ChatHistory
        stmt = (
            select(ChatHistory.content)
            .where(ChatHistory.user_id == UUID(str(user_id)), ChatHistory.role == "user")
            .order_by(ChatHistory.created_at.desc())
            .limit(scan)
        )
        if current_conversation_id:
            try:
                from uuid import UUID as _UUID
                stmt = stmt.where(
                    ChatHistory.conversation_id != _UUID(str(current_conversation_id))
                )
            except Exception:
                pass
        rows = (await db.execute(stmt)).scalars().all()
        # Fallback: if no conversation_id filter was applied (legacy rows or
        # no conv id provided), skip the 6 most recent to avoid re-surfacing
        # content that's already in the live window.
        candidates = rows if current_conversation_id else rows[6:]
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
        # Recency fallback: token-overlap misses semantic connections (e.g.
        # "peeling and red" doesn't share tokens with "i started tretinoin").
        # When we know which conversation is current (DB already excluded it),
        # also surface the most recent 2 prior-conversation turns so the model
        # knows what the user mentioned lately, even without lexical match.
        # Only applies when current_conversation_id was given — otherwise
        # `candidates` may still include live-window rows (rows[6:] fallback).
        if current_conversation_id:
            recency_added = 0
            for c in candidates[:5]:  # look at the 5 most recent prior-conv turns
                if not c or recency_added >= 2:
                    break
                key = c.lower()[:80]
                if key in seen:
                    continue
                seen.add(key)
                out.append(c if len(c) <= 160 else c[:157] + "…")
                recency_added += 1
        return out
    except Exception as e:
        logger.debug("recall_relevant_turns skipped: %s", e)
        return []
