"""Digital user persona for dynamic onboarding and schedule personalization."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from services.conversation_memory import build_memory_context, format_user_profile
from services.user_context_service import merge_context

logger = logging.getLogger(__name__)

PERSONA_CONTEXT_KEY = "digital_persona"


async def load_persona_block(
    db: AsyncSession,
    user_id: str,
    *,
    onboarding: Optional[dict] = None,
    persistent: Optional[dict] = None,
) -> str:
    """Combined persona text: UserMemory brief + user_facts + stored digital summary."""
    blocks: list[str] = []

    try:
        from services.personalization import personalization_brief

        brief = await personalization_brief(db, user_id)
        if brief:
            blocks.append(brief.strip())
    except Exception as e:
        logger.debug("persona brief load skipped: %s", e)

    facts = (persistent or {}).get("user_facts") if isinstance(persistent, dict) else None
    profile = format_user_profile(
        user_facts=facts if isinstance(facts, dict) else None,
        onboarding=onboarding,
        persistent_ctx=persistent,
    )
    if profile:
        blocks.append(profile.strip())

    stored = (persistent or {}).get(PERSONA_CONTEXT_KEY) if isinstance(persistent, dict) else None
    if isinstance(stored, dict):
        summary = str(stored.get("summary") or "").strip()
        if summary:
            blocks.append(
                "## DIGITAL PERSONA (learned habits & nuances — never re-ask these)\n"
                + summary
            )

    if not blocks:
        return ""
    return "\n\n".join(blocks)


async def remember_onboarding_answer(
    db: AsyncSession,
    user_id: str,
    *,
    maxx_id: str,
    field_id: str,
    coerced: Any,
    raw_message: str,
    field_spec: Optional[dict] = None,
) -> None:
    """Persist one onboarding answer into long-term persona memory."""
    label = str((field_spec or {}).get("question") or field_id).strip()
    value_str = json.dumps(coerced) if isinstance(coerced, (dict, list, bool)) else str(coerced)
    text = f"{maxx_id}: {field_id} = {value_str}"
    if raw_message and raw_message.strip().lower() not in value_str.lower():
        text += f" (user said: {raw_message.strip()[:120]})"

    try:
        from services.personalization import remember_fact

        await remember_fact(
            db,
            user_id,
            dimension="constraints" if maxx_id in ("fitmax", "skinmax", "hairmax") else "lifestyle",
            text=text,
            key=f"onboarding.{maxx_id}.{field_id}",
            value=coerced,
            source="onboarding",
            confidence=0.95,
            rebuild=True,
        )
    except Exception as e:
        logger.warning("remember_onboarding_answer failed: %s", e)

    # Regex fact extraction from free-text replies (product names, habits).
    try:
        from services.user_facts_service import extract_facts_from_message, merge_facts

        extracted = extract_facts_from_message(raw_message)
        if extracted:
            existing = ((await _get_persistent(db, user_id)) or {}).get("user_facts") or {}
            merged = merge_facts(existing if isinstance(existing, dict) else {}, extracted)
            await merge_context(user_id, {"user_facts": merged}, db)
    except Exception as e:
        logger.debug("onboarding fact extract skipped: %s", e)


async def refresh_digital_persona_summary(
    db: AsyncSession,
    user_id: str,
    *,
    onboarding: dict,
    persistent: dict,
    maxx_id: Optional[str] = None,
) -> dict[str, Any]:
    """LLM-compressed persona summary stored on user_schedule_context."""
    mem = build_memory_context(
        onboarding=onboarding,
        user_facts=persistent.get("user_facts") if isinstance(persistent.get("user_facts"), dict) else None,
        persistent_ctx=persistent,
        history=None,
        exclude_current_user_message=False,
    )
    known_lines = []
    for k, v in sorted(persistent.items()):
        if k.startswith("_") or k in (PERSONA_CONTEXT_KEY, "user_facts"):
            continue
        if v is None or v == "":
            continue
        known_lines.append(f"- {k}: {v}")
    if not known_lines and mem.is_empty:
        return {}

    prompt = f"""Compress what we know about this user into a short persona for a lookmaxxing coach app.
Focus on: diet, products they use/want, habits, constraints, tone preference, schedule timing, things to NEVER re-ask.
Max 6 bullet lines, lowercase, direct, no fluff.

ONBOARDING PROFILE:
{mem.user_profile or "(none)"}

SCHEDULE CONTEXT:
{chr(10).join(known_lines[:40]) or "(none)"}

{f"CURRENT MAX BEING SET UP: {maxx_id}" if maxx_id else ""}

Return JSON only: {{"summary": "bullet lines as one string with newlines"}}"""

    try:
        from services.llm_sync import async_llm_json_response

        raw = await async_llm_json_response(prompt, max_tokens=350)
        obj = json.loads(raw) if raw else {}
        summary = str(obj.get("summary") or "").strip()
        if not summary:
            return {}
        payload = {
            PERSONA_CONTEXT_KEY: {
                "summary": summary,
                "updated_at": datetime.now(timezone.utc).isoformat(),
                "last_maxx": maxx_id,
            }
        }
        await merge_context(user_id, payload, db)
        return payload
    except Exception as e:
        logger.warning("refresh_digital_persona_summary failed: %s", e)
        return {}


async def _get_persistent(db: AsyncSession, user_id: str) -> dict:
    from services.user_context_service import get_context

    return await get_context(user_id, db)
