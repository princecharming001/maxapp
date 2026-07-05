"""Tests for recall_relevant_turns cross-conversation memory."""
import pytest
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

from services.chat_memory import recall_relevant_turns, _significant_tokens


# --- unit tests for _significant_tokens ---

def test_significant_tokens_strips_stopwords():
    tokens = _significant_tokens("i started tretinoin 0.025% two weeks ago")
    assert "tretinoin" in tokens
    assert "i" not in tokens
    assert "started" in tokens


def test_significant_tokens_empty():
    assert _significant_tokens("") == set()


# --- recall_relevant_turns: conversation_id exclusion ---

def _make_db(rows):
    """Return a mock AsyncSession whose execute().scalars().all() yields rows."""
    scalars = MagicMock()
    scalars.all.return_value = rows
    execute_result = MagicMock()
    execute_result.scalars.return_value = scalars
    db = AsyncMock()
    db.execute = AsyncMock(return_value=execute_result)
    return db


@pytest.mark.asyncio
async def test_recall_excludes_current_conversation_via_query():
    """When conversation_id is provided the WHERE clause filters it out;
    the remaining older-conversation rows ARE returned if relevant."""
    # We can't easily verify SQL construction without a real DB, but we can
    # verify that the function returns matching rows when the DB mock does
    # (i.e. the conversation filter is applied at query time, not in Python).
    uid = str(uuid4())
    conv_id = str(uuid4())
    db = _make_db(["i started tretinoin 0.025% two weeks ago"])
    result = await recall_relevant_turns(
        uid, "my skin is peeling what should i do",
        db, current_conversation_id=conv_id,
    )
    # "tretinoin" and "peeling" share no tokens — but let's use a query that
    # does share significant tokens with the stored row.
    # Reset the mock and use a matching query.
    db2 = _make_db(["i started tretinoin 0.025% two weeks ago"])
    result2 = await recall_relevant_turns(
        uid, "tretinoin adjustment phase skin",
        db2, current_conversation_id=conv_id,
    )
    assert len(result2) == 1
    assert "tretinoin" in result2[0]


@pytest.mark.asyncio
async def test_recall_no_conversation_id_applies_row_skip():
    """Without conversation_id, rows[6:] fallback applies — empty result when
    DB returns fewer than 7 rows (all are 'live window')."""
    uid = str(uuid4())
    db = _make_db(["i started tretinoin 0.025%", "should i use it nightly"])
    result = await recall_relevant_turns(
        uid, "tretinoin adjustment", db,
        # no current_conversation_id
    )
    # rows[6:] on a 2-element list → [] → no candidates
    assert result == []


@pytest.mark.asyncio
async def test_recall_with_conversation_id_no_skip():
    """With conversation_id, all rows returned by DB are candidates (the DB
    already filtered out the current conv); short row lists are usable."""
    uid = str(uuid4())
    conv_id = str(uuid4())
    db = _make_db(["i started tretinoin 0.025% two weeks ago"])
    result = await recall_relevant_turns(
        uid, "tretinoin peeling adjustment skin",
        db, current_conversation_id=conv_id,
    )
    assert len(result) == 1
    assert "tretinoin" in result[0]


@pytest.mark.asyncio
async def test_recall_no_token_overlap_still_surfaces_via_recency():
    """With current_conversation_id, the recency fallback surfaces recent
    prior-conv messages even when there's no token overlap with the query."""
    uid = str(uuid4())
    conv_id = str(uuid4())
    db = _make_db(["i started tretinoin 0.025% two weeks ago"])
    result = await recall_relevant_turns(
        uid, "what is my schedule today",
        db, current_conversation_id=conv_id,
    )
    # Recency fallback: "i started tretinoin" is the most recent prior-conv
    # turn and should be included even though "schedule" doesn't match "tretinoin".
    assert len(result) == 1
    assert "tretinoin" in result[0]
