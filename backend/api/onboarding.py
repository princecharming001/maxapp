"""Dynamic max onboarding API — same flow as chat, for direct mobile integration."""

from __future__ import annotations

import logging
from typing import Any, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from db import get_db
from middleware.auth_middleware import get_current_user
from models.sqlalchemy_models import User
from services.onboarding_questioner import (
    clear_pending,
    coerce_answer,
    detect_max_start_intent,
    expand_field_answer,
    get_pending,
    make_pending,
)
from services.task_catalog_service import get_doc, is_loaded, warm_catalog
from services.user_context_service import get_context, merge_context, merged_user_state
from services.dynamic_onboarding_service import (
    append_asked_field,
    build_question_payload,
    get_asked_field_ids,
    is_dynamic_onboarding_enabled,
    missing_for_schedule,
    prepare_state_for_maxx,
    resolve_after_prefill,
)
from services.user_persona_service import (
    load_persona_block,
    remember_onboarding_answer,
    refresh_digital_persona_summary,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/onboarding", tags=["Onboarding"])


class OnboardingTurnRequest(BaseModel):
    maxx_id: Optional[str] = Field(default=None, description="Target max, e.g. hairmax")
    message: Optional[str] = Field(default=None, description="User answer or start intent text")
    action: Optional[str] = Field(default=None, description="Set to 'start' to begin without a message")


class OnboardingQuestionPayload(BaseModel):
    field_id: str
    text: str
    choices: list[str] = Field(default_factory=list)
    input_widget: Optional[dict[str, Any]] = None


class OnboardingTurnResponse(BaseModel):
    status: str  # questioning | complete | error
    assistant_text: str = ""
    question: Optional[OnboardingQuestionPayload] = None
    maxx_id: Optional[str] = None


def _pack_question(maxx_id: str, field_id: str, question_text: Optional[str]) -> OnboardingQuestionPayload:
    payload = build_question_payload(maxx_id, field_id, question_text)
    return OnboardingQuestionPayload(
        field_id=str(payload.get("field_id") or field_id),
        text=str(payload.get("text") or question_text or field_id),
        choices=list(payload.get("choices") or []),
        input_widget=payload.get("input_widget"),
    )


@router.post("/turn", response_model=OnboardingTurnResponse)
async def onboarding_turn(
    body: OnboardingTurnRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Run one dynamic onboarding step (start, answer, or next question)."""
    if not is_dynamic_onboarding_enabled():
        raise HTTPException(status_code=503, detail="Dynamic onboarding is disabled")

    if not is_loaded():
        await warm_catalog()

    user_id = str(current_user["id"])
    user = await db.get(User, UUID(user_id))
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    onboarding = dict(getattr(user, "onboarding", {}) or {})
    persistent = await get_context(user_id, db)
    state = merged_user_state(onboarding, persistent)
    pending = get_pending(state)
    msg = (body.message or "").strip()
    persona = await load_persona_block(db, user_id, onboarding=onboarding, persistent=persistent)

    maxx_id = (body.maxx_id or "").strip().lower() or None
    if not maxx_id and pending:
        maxx_id = str(pending.get("max") or "")
    if not maxx_id and msg:
        maxx_id = detect_max_start_intent(msg)
    if not maxx_id and body.action == "start":
        raise HTTPException(status_code=400, detail="maxx_id required to start onboarding")
    if not maxx_id:
        raise HTTPException(status_code=400, detail="No active onboarding and no maxx_id provided")

    doc = get_doc(maxx_id)
    if doc is None:
        raise HTTPException(status_code=404, detail=f"Unknown max: {maxx_id}")

    # Start fresh
    if body.action == "start" or (detect_max_start_intent(msg) == maxx_id and not pending):
        merged, prefill = prepare_state_for_maxx(maxx_id, state)
        if prefill:
            await merge_context(user_id, {**prefill, "_dynamic_onboarding_asked": []}, db)
            merged = {**merged, **prefill}
        if not missing_for_schedule(maxx_id, merged):
            return OnboardingTurnResponse(
                status="complete",
                assistant_text=f"already have what i need for {doc.display_name.lower()} — say 'start my {maxx_id}' in chat to generate.",
                maxx_id=maxx_id,
            )
        asked = get_asked_field_ids(merged)
        step, infer_updates = await resolve_after_prefill(
            maxx_id, merged, asked_field_ids=asked, db=db, persona_block=persona,
        )
        merged = {**merged, **infer_updates}
        if infer_updates:
            await merge_context(user_id, infer_updates, db)
        if step.done or not missing_for_schedule(maxx_id, merged):
            return OnboardingTurnResponse(
                status="complete",
                assistant_text="ready to build your schedule — open chat to finish.",
                maxx_id=maxx_id,
            )
        fid = str(step.field_id or "")
        await merge_context(
            user_id,
            {
                "_onboarding_pending": make_pending(maxx_id, fid),
                **append_asked_field(merged, fid),
            },
            db,
        )
        q = _pack_question(maxx_id, fid, step.question_text)
        return OnboardingTurnResponse(
            status="questioning",
            assistant_text=q.text.lower(),
            question=q,
            maxx_id=maxx_id,
        )

    if not pending or pending.get("max") != maxx_id:
        raise HTTPException(status_code=400, detail="No pending onboarding for this max")

    last_qid = str(pending.get("last_question") or "")
    last_field = next((f for f in doc.required_fields if f.get("id") == last_qid), None)
    if last_field is None:
        await merge_context(user_id, clear_pending(), db)
        raise HTTPException(status_code=400, detail="Pending question invalid")

    if not msg:
        q = _pack_question(maxx_id, last_qid, last_field.get("question"))
        return OnboardingTurnResponse(
            status="questioning",
            assistant_text=q.text.lower(),
            question=q,
            maxx_id=maxx_id,
        )

    coerced = coerce_answer(last_field, msg)
    if coerced is None:
        q = _pack_question(maxx_id, last_qid, last_field.get("question"))
        return OnboardingTurnResponse(
            status="questioning",
            assistant_text="didn't quite catch that — " + q.text.lower(),
            question=q,
            maxx_id=maxx_id,
        )

    update = expand_field_answer(last_field, coerced)
    next_state = {**state, **update}
    await remember_onboarding_answer(
        db, user_id, maxx_id=maxx_id, field_id=last_qid, coerced=coerced,
        raw_message=msg, field_spec=last_field,
    )
    await merge_context(user_id, {**update, **append_asked_field(next_state, last_qid)}, db)
    pers = await get_context(user_id, db)
    await refresh_digital_persona_summary(
        db, user_id, onboarding=onboarding, persistent={**pers, **next_state}, maxx_id=maxx_id,
    )
    persona = await load_persona_block(db, user_id, onboarding=onboarding, persistent=await get_context(user_id, db))

    if not missing_for_schedule(maxx_id, next_state):
        await merge_context(user_id, {**clear_pending(), "_dynamic_onboarding_asked": None}, db)
        return OnboardingTurnResponse(
            status="complete",
            assistant_text="got everything — open chat to generate your schedule.",
            maxx_id=maxx_id,
        )

    asked = get_asked_field_ids(next_state)
    step, infer_updates = await resolve_after_prefill(
        maxx_id, next_state, asked_field_ids=asked, db=db, persona_block=persona,
    )
    next_state = {**next_state, **infer_updates}
    if infer_updates:
        await merge_context(user_id, infer_updates, db)

    if step.done or not missing_for_schedule(maxx_id, next_state):
        await merge_context(user_id, {**clear_pending(), "_dynamic_onboarding_asked": None}, db)
        return OnboardingTurnResponse(
            status="complete",
            assistant_text="got everything — open chat to generate your schedule.",
            maxx_id=maxx_id,
        )

    fid = str(step.field_id or "")
    await merge_context(
        user_id,
        {
            "_onboarding_pending": make_pending(maxx_id, fid),
            **append_asked_field(next_state, fid),
        },
        db,
    )
    q = _pack_question(maxx_id, fid, step.question_text)
    return OnboardingTurnResponse(
        status="questioning",
        assistant_text=q.text.lower(),
        question=q,
        maxx_id=maxx_id,
    )
