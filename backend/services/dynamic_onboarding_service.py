"""LLM-driven max onboarding — asks only what is missing for schedule generation.

Steps implemented:
  1. Merge global onboarding + schedule context into known user facts.
  2. Compute missing required fields for the schedule engine.
  3. LLM picks the next question (or infers a value) from gaps only.
  4. Wire format matches existing mobile chip / slider payloads.
  5. When nothing is missing, caller triggers generate_and_persist().
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from typing import Any, Optional, TYPE_CHECKING

from config import settings
from services.onboarding_questioner import (
    coerce_answer,
    expand_field_answer,
    field_to_question_payload,
)
from services.task_catalog_service import get_doc, missing_required

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

# Internal keys never shown to the model or treated as onboarding answers.
_INTERNAL_KEYS = frozenset({
    "_onboarding_pending",
    "_dynamic_onboarding_asked",
    "user_facts",
    "facial_scan_summary",
})

# Global onboarding → max field aliases (rule prefill, no LLM).
_RULE_PREFILL: dict[str, dict[str, str]] = {
    "skinmax": {
        "skin_type": "skin_type",
        "primary_skin_concern": "skin_concern",
        "secondary_skin_concern": "skin_concern",
        "climate": "climate",
        "dietary_restrictions": "dietary_restrictions",
        "wake_time": "wake_time",
        "sleep_time": "sleep_time",
    },
    "hairmax": {
        "hair_type": "hair_type",
        "scalp_state": "scalp_state",
        "wake_time": "wake_time",
        "sleep_time": "sleep_time",
    },
    "fitmax": {
        "dietary_restrictions": "dietary_restrictions",
        "equipment_access": "equipment_access",
        "wake_time": "wake_time",
        "sleep_time": "sleep_time",
        "workout_frequency": "workout_frequency",
    },
    "bonemax": {
        "bonemax_workout_frequency": "workout_frequency",
        "bonemax_tmj_history": "tmj_history",
        "bonemax_heavy_screen_time": "heavy_screen_time",
        "bonemax_mastic_gum_regular": "mastic_gum_regular",
        "wake_time": "wake_time",
        "sleep_time": "sleep_time",
    },
    "heightmax": {
        "wake_time": "wake_time",
        "sleep_time": "sleep_time",
        "heightmax_goal": "height_goal",
        "heightmax_sleep_quality": "sleep_quality",
        "growth_plate_status": "growth_plate_status",
    },
}

_SKIN_CONCERN_KEYWORDS: list[tuple[tuple[str, ...], str]] = [
    (("acne", "breakout", "blemish", "pimple"), "acne"),
    (("pigment", "dark spot", "melasma", "uneven"), "pigmentation"),
    (("texture", "scar", "pore"), "texture"),
    (("red", "rosacea", "flush"), "rosacea"),
    (("aging", "wrinkle", "fine line"), "aging"),
    (("maintain", "solid", "keep"), "maintenance"),
]


def _is_empty(v: Any) -> bool:
    return v is None or v == "" or v == [] or v == {}


def _clean_state_view(state: dict[str, Any]) -> dict[str, Any]:
    """User-facing facts only — no internal pending keys."""
    out: dict[str, Any] = {}
    for k, v in (state or {}).items():
        if k.startswith("_") or k in _INTERNAL_KEYS:
            continue
        if _is_empty(v):
            continue
        out[k] = v
    return out


def build_known_facts(state: dict[str, Any], maxx_id: str) -> dict[str, Any]:
    """Step 1 — everything we already know about this user for onboarding."""
    known = _clean_state_view(state)
    known["_target_max"] = maxx_id
    return known


def format_known_facts_for_prompt(known: dict[str, Any]) -> str:
    """Human-readable block for LLM prompts."""
    lines: list[str] = []
    for k, v in sorted(known.items()):
        if k.startswith("_"):
            continue
        if isinstance(v, (dict, list)):
            lines.append(f"- {k}: {json.dumps(v, ensure_ascii=False)}")
        else:
            lines.append(f"- {k}: {v}")
    return "\n".join(lines) if lines else "- (nothing collected yet)"


def rule_prefill_updates(maxx_id: str, state: dict[str, Any]) -> dict[str, Any]:
    """Copy global onboarding answers into max-specific field ids when empty."""
    mapping = _RULE_PREFILL.get(maxx_id) or {}
    updates: dict[str, Any] = {}
    for src, dst in mapping.items():
        if not _is_empty(state.get(dst)):
            continue
        val = state.get(src)
        if _is_empty(val):
            continue
        updates[dst] = val

    if maxx_id == "skinmax" and _is_empty(state.get("skin_concern")):
        inferred = _infer_skin_concern(state)
        if inferred:
            updates["skin_concern"] = inferred

    return updates


def _infer_skin_concern(state: dict[str, Any]) -> Optional[str]:
    for key in ("primary_skin_concern", "secondary_skin_concern"):
        text = str(state.get(key) or "").strip().lower()
        if not text:
            continue
        for needles, cid in _SKIN_CONCERN_KEYWORDS:
            if any(n in text for n in needles):
                return cid
    ac = state.get("appearance_concerns")
    if isinstance(ac, list):
        blob = " ".join(str(x).lower() for x in ac if x)
        for needles, cid in _SKIN_CONCERN_KEYWORDS:
            if any(n in blob for n in needles):
                return cid
    return None


def missing_for_schedule(maxx_id: str, state: dict[str, Any]) -> list[dict]:
    """Step 2 — field specs still required before schedule generation."""
    return missing_required(maxx_id, state)


def prepare_state_for_maxx(maxx_id: str, state: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    """Apply rule prefill and return (merged_state, updates_to_persist)."""
    updates = rule_prefill_updates(maxx_id, state)
    merged = {**state, **updates}
    return merged, updates


def _field_spec(maxx_id: str, field_id: str) -> Optional[dict]:
    doc = get_doc(maxx_id)
    if not doc:
        return None
    return next((f for f in doc.required_fields if f.get("id") == field_id), None)


def _missing_fields_brief(missing: list[dict]) -> str:
    brief: list[dict[str, Any]] = []
    for f in missing:
        entry: dict[str, Any] = {
            "id": f.get("id"),
            "type": f.get("type"),
            "why": f.get("why"),
        }
        opts = f.get("options")
        if isinstance(opts, dict):
            entry["options"] = {str(k): str(v) for k, v in opts.items()}
        elif f.get("type") == "yes_no":
            entry["options"] = {"true": "Yes", "false": "No"}
        if f.get("type") == "composite":
            entry["fills"] = f.get("fills") or []
        brief.append(entry)
    return json.dumps(brief, ensure_ascii=False, indent=2)


async def fetch_rag_inspiration(
    db: Optional["AsyncSession"],
    maxx_id: str,
    *,
    target_field_id: Optional[str] = None,
    missing: Optional[list[dict]] = None,
) -> str:
    """Pull module doc snippets to inspire onboarding question wording (products, protocols)."""
    if db is None:
        return ""
    try:
        from services.rag_service import retrieve_chunks

        field = _field_spec(maxx_id, target_field_id) if target_field_id else None
        why = str((field or {}).get("why") or "")
        question = str((field or {}).get("question") or target_field_id or "")
        missing_ids = " ".join(str(f.get("id") or "") for f in (missing or [])[:5])
        query = f"{maxx_id} onboarding {question} {why} {missing_ids} products protocol routine".strip()
        chunks = await retrieve_chunks(db, maxx_id, query, k=3)
        if not chunks:
            chunks = await retrieve_chunks(db, maxx_id, f"{maxx_id} schedule protocol products", k=3)
        if not chunks:
            return ""
        lines = [
            "MODULE DOC INSPIRATION (use for question topics — shampoos, actives, timing — do NOT quote verbatim):"
        ]
        for i, c in enumerate(chunks, 1):
            meta = c.get("metadata") or {}
            section = meta.get("section") or c.get("doc_title") or "section"
            body = (c.get("content") or "").strip()
            if len(body) > 500:
                body = body[:497] + "..."
            lines.append(f"[{i}] {section}\n{body}")
        return "\n\n".join(lines)
    except Exception as e:
        logger.warning("[dynamic_onboarding] RAG inspiration failed: %s", e)
        return ""


def _coach_voice_note() -> str:
    provider = str(getattr(settings, "llm_provider", "") or "").strip().lower()
    if provider == "huggingface":
        return (
            "Voice: fine-tuned Max coach — direct, lowercase-friendly, practical lookmaxxing tone. "
            "Vary acknowledgments; never open with 'got it' every turn."
        )
    return (
        "Voice: direct Max coach — lowercase-friendly, practical lookmaxxing tone. "
        "Vary acknowledgments; never open with 'got it' every turn."
    )


def _parse_json_object(raw: str) -> dict[str, Any]:
    text = (raw or "").strip()
    if not text:
        return {}
    try:
        obj = json.loads(text)
        return obj if isinstance(obj, dict) else {}
    except json.JSONDecodeError:
        m = re.search(r"\{[\s\S]*\}", text)
        if m:
            try:
                obj = json.loads(m.group(0))
                return obj if isinstance(obj, dict) else {}
            except json.JSONDecodeError:
                pass
    return {}


@dataclass
class DynamicOnboardingStep:
    """Next action from the dynamic onboarding planner."""

    done: bool = False
    field_id: Optional[str] = None
    question_text: Optional[str] = None
    inferred_updates: Optional[dict[str, Any]] = None


async def _llm_infer_fields(
    maxx_id: str,
    known: dict[str, Any],
    missing: list[dict],
    *,
    db: Optional["AsyncSession"] = None,
    persona_block: str = "",
) -> dict[str, Any]:
    """Ask the model to silently fill fields already implied by known facts."""
    if not missing:
        return {}
    doc = get_doc(maxx_id)
    display = (doc.display_name if doc else maxx_id).lower()
    rag_block = await fetch_rag_inspiration(db, maxx_id, missing=missing)
    persona_section = f"\n\n{persona_block}\n" if persona_block else ""
    rag_section = f"\n\n{rag_block}\n" if rag_block else ""
    prompt = f"""You are onboarding a user for their {display} schedule.

{_coach_voice_note()}

KNOWN USER FACTS (do NOT re-ask these):
{format_known_facts_for_prompt(known)}
{persona_section}
MISSING FIELDS (only infer when clearly implied by KNOWN facts or persona):
{_missing_fields_brief(missing)}
{rag_section}
Return JSON ONLY — an object mapping field_id -> value for fields you can infer with HIGH confidence.
Use exact enum option keys from MISSING FIELDS, not display labels.
For composite fields, use the composite field id and a valid composite option key.
If you cannot infer a field, omit it or set it to null.
Example: {{"skin_type": "oily", "barrier_state": "stable"}}
"""
    try:
        from services.llm_sync import async_llm_json_response

        raw = await async_llm_json_response(prompt, max_tokens=512)
        parsed = _parse_json_object(raw)
        out: dict[str, Any] = {}
        missing_ids = {str(f.get("id")) for f in missing}
        for fid, val in parsed.items():
            if fid not in missing_ids or _is_empty(val):
                continue
            spec = _field_spec(maxx_id, fid)
            if not spec:
                continue
            coerced = coerce_answer(spec, str(val))
            if coerced is not None:
                out[fid] = coerced
        return out
    except Exception as e:
        logger.warning("[dynamic_onboarding] infer failed (non-fatal): %s", e)
        return {}


async def plan_next_onboarding_step(
    maxx_id: str,
    state: dict[str, Any],
    *,
    asked_field_ids: Optional[list[str]] = None,
    db: Optional["AsyncSession"] = None,
    persona_block: str = "",
) -> DynamicOnboardingStep:
    """Step 3 — LLM chooses the next question or infers remaining fields."""
    known = build_known_facts(state, maxx_id)
    missing = missing_for_schedule(maxx_id, state)
    if not missing:
        return DynamicOnboardingStep(done=True)

    asked = list(asked_field_ids or [])
    missing_not_asked = [f for f in missing if str(f.get("id")) not in asked]
    if not missing_not_asked:
        missing_not_asked = missing

    doc = get_doc(maxx_id)
    display = (doc.display_name if doc else maxx_id).lower()
    candidate_field = str(missing_not_asked[0].get("id") or "")
    rag_block = await fetch_rag_inspiration(
        db, maxx_id, target_field_id=candidate_field, missing=missing_not_asked,
    )
    persona_section = f"\n\n{persona_block}\n" if persona_block else ""
    rag_section = f"\n\n{rag_block}\n" if rag_block else ""

    prompt = f"""You are Max, a direct lookmaxxing coach onboarding someone for {display}.

{_coach_voice_note()}

DIGITAL PERSONA + KNOWN FACTS (never repeat these — includes other maxes they've set up):
{format_known_facts_for_prompt(known)}
{persona_section}
STILL NEEDED FOR THEIR SCHEDULE:
{_missing_fields_brief(missing_not_asked)}

ALREADY ASKED THIS SESSION: {asked or "none"}
{rag_section}
Pick ONE missing field to ask about next OR infer it from KNOWN/persona facts.

Rules:
- Do NOT ask about anything already in KNOWN or persona.
- Use MODULE DOC INSPIRATION for specific product/protocol angles (e.g. shampoo type, actives) when relevant.
- One question only, conversational, lowercase-friendly.
- If a field is clearly answered already, infer it instead of asking.
- field_id MUST be one of the missing field ids.
- Chip choices stay the same enum keys — you only rewrite the question text.

Return JSON ONLY:
{{"field_id": "...", "question": "...", "inferred_value": null}}

OR if inferring without asking:
{{"field_id": "...", "question": null, "inferred_value": "<exact enum key>"}}
"""
    try:
        from services.llm_sync import async_llm_json_response

        raw = await async_llm_json_response(prompt, max_tokens=400)
        parsed = _parse_json_object(raw)
    except Exception as e:
        logger.warning("[dynamic_onboarding] plan failed, using fallback: %s", e)
        parsed = {}

    field_id = str(parsed.get("field_id") or "").strip()
    inferred = parsed.get("inferred_value")
    spec = _field_spec(maxx_id, field_id) if field_id else None

    if spec and not _is_empty(inferred):
        coerced = coerce_answer(spec, str(inferred))
        if coerced is not None:
            return DynamicOnboardingStep(
                field_id=field_id,
                inferred_updates=expand_field_answer(spec, coerced),
            )

    if not spec:
        spec = missing_not_asked[0]
        field_id = str(spec.get("id"))

    question = str(parsed.get("question") or spec.get("question") or field_id).strip()
    return DynamicOnboardingStep(field_id=field_id, question_text=question)


def build_question_payload(maxx_id: str, field_id: str, question_text: Optional[str]) -> dict[str, Any]:
    """Step 4 — mobile-compatible payload (chips / slider)."""
    spec = _field_spec(maxx_id, field_id)
    if not spec:
        return {"text": question_text or field_id, "field_id": field_id}
    payload = field_to_question_payload(spec)
    if question_text:
        payload["text"] = question_text
    return payload


async def apply_llm_prefill(
    maxx_id: str,
    state: dict[str, Any],
    *,
    db: Optional["AsyncSession"] = None,
    persona_block: str = "",
) -> dict[str, Any]:
    """Run LLM inference pass to auto-fill obvious gaps."""
    missing = missing_for_schedule(maxx_id, state)
    if not missing:
        return {}
    known = build_known_facts(state, maxx_id)
    inferred_raw = await _llm_infer_fields(
        maxx_id, known, missing, db=db, persona_block=persona_block,
    )
    updates: dict[str, Any] = {}
    for fid, coerced in inferred_raw.items():
        spec = _field_spec(maxx_id, fid)
        if spec:
            updates.update(expand_field_answer(spec, coerced))
        else:
            updates[fid] = coerced
    return updates


def get_asked_field_ids(state: dict[str, Any]) -> list[str]:
    raw = state.get("_dynamic_onboarding_asked")
    if isinstance(raw, list):
        return [str(x) for x in raw if x]
    return []


def append_asked_field(state: dict[str, Any], field_id: str) -> dict[str, Any]:
    asked = get_asked_field_ids(state)
    if field_id and field_id not in asked:
        asked.append(field_id)
    return {"_dynamic_onboarding_asked": asked}


def is_dynamic_onboarding_enabled() -> bool:
    return bool(getattr(settings, "dynamic_onboarding_enabled", True))


async def resolve_after_prefill(
    maxx_id: str,
    state: dict[str, Any],
    *,
    asked_field_ids: Optional[list[str]] = None,
    max_infer_loops: int = 4,
    db: Optional["AsyncSession"] = None,
    persona_block: str = "",
) -> tuple[DynamicOnboardingStep, dict[str, Any]]:
    """Apply LLM inference loops then return the next ask step or done."""
    merged = dict(state)
    persisted: dict[str, Any] = {}
    asked = list(asked_field_ids or [])

    llm_fill = await apply_llm_prefill(maxx_id, merged, db=db, persona_block=persona_block)
    if llm_fill:
        merged.update(llm_fill)
        persisted.update(llm_fill)

    for _ in range(max_infer_loops):
        if not missing_for_schedule(maxx_id, merged):
            return DynamicOnboardingStep(done=True), persisted

        step = await plan_next_onboarding_step(
            maxx_id, merged, asked_field_ids=asked, db=db, persona_block=persona_block,
        )
        if step.inferred_updates:
            merged.update(step.inferred_updates)
            persisted.update(step.inferred_updates)
            if step.field_id:
                asked.append(step.field_id)
            continue
        return step, persisted

    if not missing_for_schedule(maxx_id, merged):
        return DynamicOnboardingStep(done=True), persisted
    first = missing_for_schedule(maxx_id, merged)[0]
    fid = str(first.get("id"))
    return DynamicOnboardingStep(field_id=fid, question_text=str(first.get("question") or fid)), persisted

