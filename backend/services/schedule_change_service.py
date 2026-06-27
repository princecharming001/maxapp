"""
schedule_change_service — propose → confirm → apply for chat-driven schedule edits
(RALPH_CHAT_RESCHEDULE).

The coach proposes a concrete change (Phase 1, via the `propose_schedule_change`
agent tool) which is persisted as a `ScheduleChangeProposal` holding the EXACT
deterministic action to replay. On Yes (Phase 2) we load that pending proposal and
execute its stored `action` by dispatching to the matching existing schedule
service with the stored args — NOT a fresh LLM call — so the user gets precisely
what was shown. Apply is atomic + idempotent (a second Yes is a no-op that returns
the cached result). On No (Phase 3) the proposal is marked rejected; the client
re-focuses the composer for a typed re-prompt.

Determinism contract: `action = {"tool": <primitive>, "args": {...}}` where the
primitive is one of the registered, side-effect-only functions below. No primitive
calls the LLM; the WHAT was decided at propose time and frozen into args here.
"""

from __future__ import annotations

import logging
from typing import Any, Optional
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from models.sqlalchemy_models import ScheduleChangeProposal

logger = logging.getLogger(__name__)

# Allowed proposal kinds (mirror RALPH_CHAT_RESCHEDULE Phase 1).
VALID_KINDS = {"switch_workout", "switch_diet", "edit_maxx_tasks", "adjust", "other"}
# Allowed deterministic apply primitives. Anything else is rejected at apply time
# so a malformed/hand-crafted action can never reach an arbitrary code path.
VALID_TOOLS = {"edit_task", "delete_task", "update_preferences", "set_context", "noop"}


# ──────────────────────────────────────────────────────────────────────────
# Create / fetch
# ──────────────────────────────────────────────────────────────────────────
async def create_proposal(
    db: AsyncSession,
    *,
    user_id: str,
    conversation_id: Optional[str],
    kind: str,
    maxx_id: Optional[str],
    summary: str,
    action: dict,
    source: str = "docs",
) -> ScheduleChangeProposal:
    """Persist a pending proposal. Supersedes any prior still-pending proposal in
    the same conversation (only the newest pending one is ever surfaced/applied)."""
    if kind not in VALID_KINDS:
        kind = "other"
    if source not in ("docs", "web"):
        source = "docs"
    tool = (action or {}).get("tool")
    if tool not in VALID_TOOLS:
        raise ValueError(f"invalid action tool: {tool!r}")

    # Supersede older pending proposals in this conversation so Yes is unambiguous.
    if conversation_id:
        await db.execute(
            update(ScheduleChangeProposal)
            .where(
                ScheduleChangeProposal.user_id == UUID(str(user_id)),
                ScheduleChangeProposal.conversation_id == UUID(str(conversation_id)),
                ScheduleChangeProposal.status == "pending",
            )
            .values(status="expired")
        )

    proposal = ScheduleChangeProposal(
        user_id=UUID(str(user_id)),
        conversation_id=UUID(str(conversation_id)) if conversation_id else None,
        kind=kind,
        maxx_id=maxx_id,
        summary=summary.strip()[:600] or "Schedule change",
        action=action,
        source=source,
        status="pending",
    )
    db.add(proposal)
    await db.flush()  # assign id without ending the caller's transaction
    return proposal


async def get_proposal(db: AsyncSession, user_id: str, proposal_id: str) -> Optional[ScheduleChangeProposal]:
    res = await db.execute(
        select(ScheduleChangeProposal).where(
            ScheduleChangeProposal.id == UUID(str(proposal_id)),
            ScheduleChangeProposal.user_id == UUID(str(user_id)),
        )
    )
    return res.scalar_one_or_none()


async def get_pending_for_conversation(
    db: AsyncSession, user_id: str, conversation_id: str
) -> Optional[ScheduleChangeProposal]:
    res = await db.execute(
        select(ScheduleChangeProposal)
        .where(
            ScheduleChangeProposal.user_id == UUID(str(user_id)),
            ScheduleChangeProposal.conversation_id == UUID(str(conversation_id)),
            ScheduleChangeProposal.status == "pending",
        )
        .order_by(ScheduleChangeProposal.created_at.desc())
        .limit(1)
    )
    return res.scalar_one_or_none()


# ──────────────────────────────────────────────────────────────────────────
# Deterministic apply dispatch (no LLM)
# ──────────────────────────────────────────────────────────────────────────
async def _dispatch_action(db: AsyncSession, user_id: str, action: dict) -> str:
    """Execute the stored action against the real schedule services. Returns a
    short human confirmation. Raises on failure so the caller can roll back."""
    from services.schedule_service import schedule_service

    tool = (action or {}).get("tool")
    args = dict((action or {}).get("args") or {})

    if tool == "noop":
        return "Noted."

    if tool == "edit_task":
        updates = dict(args.get("updates") or {})
        if not updates:
            raise ValueError("edit_task requires updates")
        await schedule_service.edit_task(
            user_id=user_id,
            schedule_id=str(args["schedule_id"]),
            task_id=str(args["task_id"]),
            db=db,
            updates=updates,
            scope=str(args.get("scope") or "instance"),
        )
        return "Updated that task."

    if tool == "delete_task":
        await schedule_service.delete_task(
            user_id=user_id,
            schedule_id=str(args["schedule_id"]),
            task_id=str(args["task_id"]),
            db=db,
            scope=str(args.get("scope") or "instance"),
        )
        return "Removed that task."

    if tool == "update_preferences":
        prefs = dict(args.get("preferences") or {})
        if not prefs:
            raise ValueError("update_preferences requires preferences")
        await schedule_service.update_preferences(user_id=user_id, preferences=prefs, db=db)
        return "Updated your schedule preferences."

    if tool == "set_context":
        from services.user_context_service import merge_context
        key = str(args["key"])
        value = args.get("value")
        await merge_context(user_id, {key: value}, db)
        if args.get("regenerate", True):
            from services.schedule_runtime import regenerate_active_schedules
            await regenerate_active_schedules(
                user_id=user_id,
                db=db,
                only_max=args.get("only_max"),
                reason=f"chat_confirm:{key}",
            )
        return "Updated your plan."

    raise ValueError(f"unknown apply tool: {tool!r}")


async def apply_proposal(db: AsyncSession, user_id: str, proposal_id: str) -> tuple[bool, str]:
    """Apply a pending proposal deterministically + atomically + idempotently.

    Returns (ok, message). Idempotent: re-applying an already-'applied' proposal
    returns the cached result without mutating again. A 'rejected'/'expired'
    proposal cannot be applied.
    """
    proposal = await get_proposal(db, user_id, proposal_id)
    if proposal is None:
        return False, "That change is no longer available."

    if proposal.status == "applied":
        # Idempotent re-confirm — do NOT mutate twice.
        return True, proposal.result_message or "Already applied."
    if proposal.status in ("rejected", "expired"):
        return False, "That change was already dismissed. Tell me what you'd prefer."
    if proposal.status != "pending":
        return False, "That change is no longer available."

    try:
        message = await _dispatch_action(db, user_id, proposal.action or {})
        full = f"{message} {proposal.summary}".strip()
        proposal.status = "applied"
        proposal.result_message = full
        await db.commit()
        return True, full
    except Exception as e:  # atomic: leave status pending on failure
        logger.exception("apply_proposal failed for %s: %s", proposal_id, e)
        try:
            await db.rollback()
        except Exception:
            pass
        return False, "I couldn't apply that change — want to try a different tweak?"


async def reject_proposal(db: AsyncSession, user_id: str, proposal_id: str) -> tuple[bool, str]:
    """Mark a pending proposal rejected (Phase 3). Returns (ok, re-prompt message)."""
    proposal = await get_proposal(db, user_id, proposal_id)
    if proposal is None:
        return False, "No problem — tell me what you'd prefer."
    if proposal.status == "pending":
        proposal.status = "rejected"
        await db.commit()
    return True, "No worries — tell me what you'd rather do instead and I'll line it up."
