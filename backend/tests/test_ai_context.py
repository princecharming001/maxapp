"""Unified context layer — pure-logic tests for the brief + cross-chat recall.

Covers the invariants behind "the chatbot shouldn't re-ask or forget": the brief
knows() check (skip-if-known), and recall_relevant_turns surfacing a specific term
from an EARLIER conversation (weighted so one strong keyword is enough), while
staying quiet on generic overlap.
"""
from __future__ import annotations

import asyncio
import re
import uuid

from services.user_brief import UserBrief
from services.chat_memory import recall_relevant_turns, _significant_tokens


# ── UserBrief.knows ──────────────────────────────────────────────────────────
def test_brief_knows_substring_and_regex():
    b = UserBrief(user_id="u", searchable="i have acne and oily skin\nprimary goal: build muscle")
    assert b.knows("acne") is True
    assert b.knows(re.compile(r"\b(acne|dryness)\b")) is True
    assert b.knows("psoriasis") is False


def test_brief_knows_empty_is_false():
    assert UserBrief(user_id="u").knows("acne") is False


# ── recall_relevant_turns ────────────────────────────────────────────────────
class _FakeResult:
    def __init__(self, rows): self._rows = rows
    def scalars(self): return self
    def all(self): return self._rows


class _FakeDB:
    """Returns the given USER-message contents newest-first, ignoring the query."""
    def __init__(self, rows): self._rows = rows
    async def execute(self, _stmt): return _FakeResult(self._rows)


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def _rows(*contents):
    # 6 recent fillers (skipped by recall) + the older, real content.
    fillers = ["what should i eat", "how much protein", "good warmup", "sleep tips",
               "posture help", "creatine?"]
    return fillers + list(contents)


def test_recall_surfaces_one_strong_keyword():
    uid = str(uuid.uuid4())
    db = _FakeDB(_rows("i started using tretinoin 0.025 three weeks ago"))
    out = _run(recall_relevant_turns(uid, "is my tretinoin dose right", db))
    assert any("tretinoin" in t for t in out)  # one specific shared term is enough


def test_recall_ignores_generic_overlap():
    uid = str(uuid.uuid4())
    # shares only the short/common token "eat" — below the weighted threshold
    db = _FakeDB(_rows("what should i eat for dinner"))
    out = _run(recall_relevant_turns(uid, "should i eat now", db))
    assert out == []


def test_recall_skips_recent_window():
    uid = str(uuid.uuid4())
    # tretinoin is among the newest 6 → treated as already in the live window
    db = _FakeDB(["i use tretinoin nightly", "a", "b", "c", "d", "e"])
    out = _run(recall_relevant_turns(uid, "tretinoin strength question", db))
    assert out == []


def test_recall_bad_uuid_is_safe():
    db = _FakeDB(_rows("i take minoxidil daily"))
    assert _run(recall_relevant_turns("not-a-uuid", "minoxidil timing", db)) == []


def test_significant_tokens_drops_stopwords():
    toks = _significant_tokens("give me a routine for my acne please")
    assert "acne" in toks
    assert "give" not in toks and "for" not in toks and "my" not in toks
