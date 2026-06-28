"""Deterministic onboarding question driver.

Replaces free-form LLM questioning during max-schedule onboarding. Walks
required_fields from the max-doc one at a time, returning structured
question payloads (text + choices OR slider widget) that the mobile UI
renders via its existing quick-reply / new slider components.

State machine lives in `user_schedule_context._onboarding_pending`:
    {"max": "skinmax", "last_question": "skin_concern"}

Flow per chat turn:
1. peek_pending(user_state) → {max, last_question} | None
2. If pending and the user message is the answer to last_question:
     coerce_answer(field_spec, user_msg) → coerced value | None
     If coerced: persist to context under field_id, advance.
     If not:     re-ask the same question.
3. peek_next_question(maxx_id, merged_state) → next field spec or None
4. If next field exists: emit question payload (text + choices/slider).
5. If no next field: clear pending state, signal "ready to generate".

The driver is purely additive — it sits in front of the chat agent and
returns early when it has a question to ask. The agent never sees the
turn.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from services.task_catalog_service import (
    get_doc,
    get_info_schema,
    missing_required,
    warm_catalog,
    is_loaded,
)

logger = logging.getLogger(__name__)


# --------------------------------------------------------------------------- #
#  Pending-state helpers                                                      #
# --------------------------------------------------------------------------- #

PENDING_KEY = "_onboarding_pending"


def get_pending(user_state: dict) -> Optional[dict]:
    """Return the current pending onboarding step, or None."""
    p = user_state.get(PENDING_KEY)
    if isinstance(p, dict) and p.get("max") and p.get("last_question"):
        return dict(p)
    return None


def make_pending(maxx_id: str, field_id: str) -> dict:
    return {"max": maxx_id, "last_question": field_id}


def clear_pending() -> dict:
    """Returns a context update that clears the pending state."""
    return {PENDING_KEY: None}


# --------------------------------------------------------------------------- #
#  Plan queue (dynamic onboarding; backward compatible with old pending)      #
# --------------------------------------------------------------------------- #
# A "plan pending" extends the old {max, last_question} shape with a slot queue:
#   {max, last_question, plan:[slot_id], idx, adapted:{slot:text}, plan_dirty,
#    generated_by:"llm"|"prefill"|"raw"}
# `get_pending` accepts BOTH shapes (it only requires max + last_question), so
# nothing that reads the old shape breaks.


def _field_id_for_slot(maxx_id: str, slot_id: str) -> Optional[str]:
    """Map a plan slot id -> the required_fields[].id it asks. Returns None for
    infer-only slots (no field) or unknown slots; falls back to slot_id itself
    when no info_schema is available (auto-derive convention slot==field)."""
    schema = get_info_schema(maxx_id)
    if schema is None:
        return slot_id
    slot = next((s for s in schema.slots if s.slot == slot_id), None)
    if slot is None:
        return None
    return slot.field  # may be None for infer-only slots


def _field_spec_for_slot(maxx_id: str, slot_id: str) -> Optional[dict]:
    """Resolve a plan slot id to its doc required_fields spec dict, or None."""
    doc = get_doc(maxx_id)
    if doc is None:
        return None
    field_id = _field_id_for_slot(maxx_id, slot_id)
    if not field_id:
        return None
    return next((f for f in doc.required_fields if f.get("id") == field_id), None)


def make_plan_pending(
    maxx_id: str,
    plan: list[str],
    idx: int = 0,
    adapted: Optional[dict] = None,
    generated_by: str = "llm",
) -> dict:
    """Build a plan-pending state. `plan` is an ordered list of slot ids;
    `adapted` maps slot id -> adapted question text. `last_question` is kept in
    sync with the current slot's FIELD id so the existing coerce path works."""
    plan = [str(s) for s in (plan or [])]
    cur_slot = plan[idx] if 0 <= idx < len(plan) else (plan[-1] if plan else "")
    last_field = _field_id_for_slot(maxx_id, cur_slot) or cur_slot
    return {
        "max": maxx_id,
        "last_question": last_field,
        "plan": plan,
        "idx": idx,
        "adapted": dict(adapted or {}),
        "plan_dirty": False,
        "generated_by": generated_by,
    }


def advance_plan(pending: dict) -> dict:
    """Move the plan cursor forward one slot, re-syncing `last_question` to the
    new current slot's field id. Caller persists the returned dict. Advance
    should happen ONLY after a successful coerce of the current answer."""
    p = dict(pending or {})
    plan = p.get("plan") or []
    p["idx"] = int(p.get("idx") or 0) + 1
    if 0 <= p["idx"] < len(plan):
        p["last_question"] = _field_id_for_slot(p.get("max", ""), plan[p["idx"]]) or plan[p["idx"]]
    return p


def _is_answered(v: Any) -> bool:
    return not (v is None or v == "" or v == [] or v == {})


def recompute_dirty_plan(maxx_id: str, pending: dict, user_state: dict) -> dict:
    """Re-anchor a plan-dirty queue: DROP queued slots whose field is now known
    in `user_state` (e.g. a chat-volunteered fact), keep the cursor on the right
    remaining slot, and clear `plan_dirty`. Pure / deterministic — NO LLM (the
    recompute only shrinks the queue; it never re-asks or invents). Returns the
    updated pending dict for the caller to persist."""
    plan = list(pending.get("plan") or [])
    if not plan:
        return {**pending, "plan_dirty": False}

    idx = int(pending.get("idx") or 0)
    cur_slot = plan[idx] if 0 <= idx < len(plan) else None
    orig_index = {sid: i for i, sid in enumerate(plan)}

    kept = [
        sid for sid in plan
        if (fid := _field_id_for_slot(maxx_id, sid)) and not _is_answered(user_state.get(fid))
    ]

    if cur_slot in kept:
        new_idx = kept.index(cur_slot)
    else:
        new_idx = next(
            (j for j, sid in enumerate(kept) if orig_index.get(sid, 0) >= idx),
            len(kept),
        )

    out = {**pending, "plan": kept, "idx": new_idx, "plan_dirty": False}
    if 0 <= new_idx < len(kept):
        out["last_question"] = _field_id_for_slot(maxx_id, kept[new_idx]) or kept[new_idx]
    return out


async def mark_onboarding_plan_dirty(user_id: str, db) -> None:
    """Flag an active plan-driven onboarding dirty so the NEXT questioner turn
    drops any queued slot a chat-volunteered fact just satisfied. Cheap: one
    context read + conditional write, NO synchronous LLM. Never raises."""
    try:
        from services.user_context_service import get_context, merge_context

        ctx = await get_context(user_id, db)
        pending = get_pending(ctx)
        if not pending or not pending.get("plan") or pending.get("plan_dirty"):
            return
        await merge_context(
            user_id, {PENDING_KEY: {**pending, "plan_dirty": True}}, db
        )
    except Exception as e:  # pragma: no cover - non-fatal best effort
        logger.warning("mark_onboarding_plan_dirty failed (non-fatal): %s", e)


def _peek_plan_field(maxx_id: str, pending: dict) -> Optional[dict]:
    """Field spec for the plan's current slot, with `question` overridden by the
    adapted text. None when the plan is exhausted or the current slot can't be
    resolved (caller then falls through to raw missing_required as a backstop)."""
    plan = pending.get("plan") or []
    idx = int(pending.get("idx") or 0)
    if idx < 0 or idx >= len(plan):
        return None
    slot_id = plan[idx]
    spec = _field_spec_for_slot(maxx_id, slot_id)
    if spec is None:
        return None
    # `confirm` slots render as a one-tap yes/no regardless of the field's own
    # type (the existing client already handles yes_no chips).
    action = (pending.get("actions") or {}).get(slot_id, "ask")
    if action == "confirm":
        spec = {**spec, "type": "yes_no"}
    adapted = (pending.get("adapted") or {}).get(slot_id)
    if adapted:
        spec = {**spec, "question": adapted}
    return spec


# --------------------------------------------------------------------------- #
#  Question building                                                          #
# --------------------------------------------------------------------------- #

# Label appended to an `allow_custom` enum's choices. Must be one of the
# strings in mobile/screens/chat/MaxChatScreen.tsx CUSTOM_CHIP_LABELS so the
# client renders it as the custom-input chip (focuses the text box) rather than
# a normal quick-reply. Lowercase-compared client-side, so case here is cosmetic.
CUSTOM_CHOICE_LABEL = "Something else"


def _flag(field_spec: dict, name: str) -> bool:
    """Read a boolean schema flag (multi / allow_custom) tolerantly: accepts
    real booleans and the strings 'true'/'yes'/'1' (YAML front-matter quirks)."""
    v = (field_spec or {}).get(name)
    if isinstance(v, bool):
        return v
    if isinstance(v, str):
        return v.strip().lower() in ("true", "yes", "1")
    return bool(v)


def _as_int(v: Any, d: int) -> int:
    """Coerce a doc-provided numeric bound to int, falling back to `d`. A YAML
    blank (`min:` -> None) or a non-numeric string would otherwise make
    `int(...)` raise TypeError/ValueError and 500 the intake mid-onboarding."""
    try:
        return int(v)
    except (TypeError, ValueError):
        return d


def peek_next_question(maxx_id: str, user_state: dict) -> Optional[dict]:
    """Return the next question's field spec, or None when nothing is left.

    If an active plan queue exists for `maxx_id`, drive it (returning the
    current slot's field spec with adapted wording). When the plan is exhausted
    or a slot can't resolve, fall through to the UNCHANGED raw `missing_required`
    path — which is also the independent backstop that catches any required
    field the plan under-asked. With no plan, behavior is byte-for-byte today's.
    """
    if not is_loaded():
        # Caller is async; we can't await here. Caller must warm before invoking.
        logger.warning("peek_next_question called before catalog warm; expect empty.")

    pending = get_pending(user_state)
    if pending and pending.get("max") == maxx_id and pending.get("plan"):
        spec = _peek_plan_field(maxx_id, pending)
        if spec is not None:
            return spec
        # Plan exhausted / unresolvable → backstop on raw missing_required below.

    missing = missing_required(maxx_id, user_state)
    return missing[0] if missing else None


def plan_progress(pending: Optional[dict]) -> Optional[dict]:
    """`{index, total}` (1-based) for an active plan queue, else None. Used to
    render an optional progress hint; the client ignores it when absent."""
    if not pending:
        return None
    plan = pending.get("plan") or []
    if not plan:
        return None
    idx = int(pending.get("idx") or 0)
    if idx < 0 or idx >= len(plan):
        return None
    return {"index": idx + 1, "total": len(plan)}


def field_to_question_payload(field_spec: dict, progress: Optional[dict] = None) -> dict:
    """Convert a doc required_field spec into the wire format the mobile UI
    expects.  Always returns a dict with at minimum:
        {"text": "<question>", "field_id": "<id>"}
    Plus EITHER:
        "choices": ["Option A", ...]   for enum/yes_no
        "input_widget": {...}          for numeric / slider questions
    """
    fid = str(field_spec.get("id") or "")
    qtext = str(field_spec.get("question") or fid).strip()
    ftype = str(field_spec.get("type") or "str").strip().lower()

    payload: dict[str, Any] = {"text": qtext, "field_id": fid}

    if ftype == "enum":
        opts = field_spec.get("options") or {}
        # `options` is {value: label}. UI shows labels but answers map back.
        # We expose ordered labels as choices; coerce_answer maps label→value.
        labels = [str(v) for v in (opts.values() if isinstance(opts, dict) else opts)]
        # `allow_custom` → append an "Other" chip the mobile client recognises as
        # the custom-input path (its label is in MaxChatScreen's CUSTOM_CHIP_LABELS).
        # Tapping it focuses the text box so the user types their own answer,
        # which coerce_answer accepts as raw text (see below).
        if _flag(field_spec, "allow_custom"):
            labels = labels + [CUSTOM_CHOICE_LABEL]
        payload["choices"] = labels
        # `multi` → tell the client to render multi-select toggle chips + a
        # "submit N picks" button. `multi_choice` is exactly the wire flag
        # MaxChatScreen reads to enter that mode.
        if _flag(field_spec, "multi"):
            payload["multi_choice"] = True
        if _flag(field_spec, "allow_custom"):
            payload["allow_custom"] = True
        # Stash the value→label map so coerce_answer can do the inverse lookup.
        payload["_value_map"] = (
            {str(k): str(v) for k, v in opts.items()} if isinstance(opts, dict) else None
        )

    elif ftype == "yes_no":
        payload["choices"] = ["Yes", "No"]

    elif ftype == "int":
        # Slider widget. Sensible defaults per field; can be overridden in doc.
        slider = {
            "type": "slider",
            "min": _as_int(field_spec.get("min"), 13),
            "max": _as_int(field_spec.get("max"), 50),
            "step": _as_int(field_spec.get("step"), 1),
            "default": _as_int(field_spec.get("default"), 18),
            "label": qtext,
            "unit": field_spec.get("unit") or "",
        }
        payload["input_widget"] = slider

    elif ftype in ("clock", "time"):
        # Common clock answers as quick replies.
        payload["choices"] = ["06:00", "06:30", "07:00", "07:30", "08:00", "22:00", "22:30", "23:00", "23:30"]

    else:
        # str — no constrained input; just emit the question. UI falls back to free text.
        pass

    # Optional plan-progress hint (only when an LLM/plan-driven queue exists).
    if progress:
        payload["progress"] = progress

    return payload


# --------------------------------------------------------------------------- #
#  Answer coercion                                                            #
# --------------------------------------------------------------------------- #

def coerce_answer(field_spec: dict, raw: str) -> Optional[Any]:
    """Try to parse user message into the field's expected value.
    Returns the parsed value on success, None on failure (caller should re-ask).
    """
    if raw is None:
        return None
    text = str(raw).strip()
    if not text:
        return None
    ftype = str(field_spec.get("type") or "str").strip().lower()
    low = text.lower()

    if ftype == "enum":
        opts = field_spec.get("options") or {}
        if not isinstance(opts, dict):
            return None
        multi = _flag(field_spec, "multi")
        allow_custom = _flag(field_spec, "allow_custom")

        if multi:
            # Multi-select: the client submits the picked labels comma-joined
            # (e.g. "Vegetarian, Gluten-free"), or the user typed a free-text
            # answer. Match each token through the same single-value logic;
            # unmatched tokens become raw custom values when allow_custom.
            values: list[str] = []
            for tok in _split_multi(text):
                tl = tok.strip().lower()
                if not tl or _is_custom_label(tl):
                    continue
                v = _match_enum_token(opts, tl)
                if v is not None:
                    if v not in values:
                        values.append(v)
                elif allow_custom:
                    raw = tok.strip()
                    if raw and raw not in values:
                        values.append(raw)
            values = _apply_exclusive(field_spec, values)
            return values or None

        # Single-select.
        if _is_custom_label(low):
            return None  # tapped the custom chip but sent no real answer yet
        v = _match_enum_token(opts, low)
        if v is not None:
            return v
        if allow_custom:
            return text  # accept the raw typed answer instead of re-asking
        return None

    if ftype == "yes_no":
        if low in ("yes", "y", "yeah", "yep", "true", "1"):
            return True
        if low in ("no", "n", "nope", "nah", "false", "0"):
            return False
        return None

    if ftype == "int":
        # Tolerate "i'm 17" or "17 years old".
        import re
        m = re.search(r"\b(\d{1,3})\b", text)
        if not m:
            return None
        v = int(m.group(1))
        lo = int(field_spec.get("min", 0))
        hi = int(field_spec.get("max", 200))
        return max(lo, min(hi, v))

    if ftype in ("clock", "time"):
        import re
        m = re.match(r"^\s*(\d{1,2}):(\d{2})\s*(am|pm)?\s*$", text, re.IGNORECASE)
        if not m:
            # Try "7am" / "11pm"
            m2 = re.match(r"^\s*(\d{1,2})\s*(am|pm)\s*$", text, re.IGNORECASE)
            if not m2:
                return None
            h = int(m2.group(1)) % 12
            if (m2.group(2) or "").lower() == "pm":
                h += 12
            return f"{h:02d}:00"
        h = int(m.group(1))
        mm = int(m.group(2))
        suf = (m.group(3) or "").lower()
        if suf == "pm" and h < 12:
            h += 12
        if suf == "am" and h == 12:
            h = 0
        return f"{h:02d}:{mm:02d}"

    # str — accept whatever they typed.
    return text


# Labels the mobile client treats as the custom-input chip (kept in sync with
# MaxChatScreen.tsx CUSTOM_CHIP_LABELS). A bare submission of one of these is
# the chip tap itself, not an answer.
_CUSTOM_LABELS = {
    "something else", "other", "none of these", "type my own", "type your own",
    "something else…",
}


def _is_custom_label(low: str) -> bool:
    return (low or "").strip().lower() in _CUSTOM_LABELS


def _split_multi(text: str) -> list[str]:
    """Split a multi-select submission into tokens. The client joins picks with
    ', '; free-typed answers may use commas, 'and', '&', '/', or '+'."""
    import re
    parts = re.split(r"\s*,\s*|\s*;\s*|\s*&\s*|\s*\+\s*|\s*/\s*|\s+and\s+", text or "")
    return [p for p in (p.strip() for p in parts) if p]


def _apply_exclusive(field_spec: dict, values: list[str]) -> list[str]:
    """If the user picked a value the field marks `exclusive` (e.g. skinmax
    'maintenance', or a 'none' that contradicts other picks), collapse to just
    that one value."""
    ex = field_spec.get("exclusive")
    if isinstance(ex, str):
        ex = [ex]
    ex_set = {str(x).strip().lower() for x in (ex or [])}
    if not ex_set:
        return values
    for v in values:
        if str(v).strip().lower() in ex_set:
            return [v]
    return values


def _match_enum_token(opts: dict, low: str) -> Optional[str]:
    """Resolve a single token to an enum value, or None. Order: exact value,
    exact label, label substring, keyword heuristic."""
    # 1) exact value match
    for k in opts:
        if low == str(k).lower():
            return str(k)
    # 2) exact label match
    for k, v in opts.items():
        if low == str(v).lower():
            return str(k)
    # 3) substring on label (user typed a fragment)
    for k, v in opts.items():
        if low in str(v).lower() or str(v).lower() in low:
            return str(k)
    # 4) keyword heuristic
    keywords = _ENUM_KEYWORDS
    for value, kws in keywords.items():
        if value in opts and any(k in low for k in kws):
            return value
    return None


# Keyword heuristics shared by single- and multi-select coercion. Each enum
# value maps to phrases that should resolve to it; the `value in opts` guard in
# _match_enum_token limits a keyword to fields that actually offer that value.
_ENUM_KEYWORDS = {
            "acne": ["acne", "pimple", "breakout", "zit"],
            "pigmentation": ["pigment", "dark spot", "scar", "uneven", "post-acne"],
            "rosacea": ["rosacea", "redness", "flush", "sensitive"],
            "texture": ["texture", "rough", "pore", "congest"],
            "aging": ["wrinkle", "fine line", "fine-line", "firmness", "sagging", "aging", "ageing", "anti-aging", "anti aging", "elasticity"],
            "maintenance": ["maintain", "fine", "preventive"],
            "untested": ["haven't", "havent", "never used", "no clue", "no idea", "not tried", "not sure", "unsure", "don't know", "dont know", "new to"],
            "stable": ["stable", "fine", "tolerate", "not really", "no", "no problem"],
            "sensitive": ["sometimes", "depends", "occasion"],
            "damaged": ["damaged", "irritate", "burn", "sting", "red"],
            "oily": ["oily", "shiny", "greasy"],
            "dry": ["dry", "tight", "flaky"],
            "combo": ["combo", "combination", "t-zone", "tzone"],
            "normal": ["normal", "balanced"],
            "straight": ["straight", "no curl"],
            "wavy": ["wavy", "wave", "loose"],
            "curly": ["curly", "curl", "spiral"],
            "coily": ["coily", "coil", "kinky", "kinks", "coarse", "afro", "nappy", "tight curl", "4a", "4b", "4c"],
            "yes_active": ["yes", "yeah", "yep", "want to act", "definitely"],
            "yes_observing": ["maybe", "not sure", "thinking", "watching"],
            "no_but_family": ["family", "runs in", "father", "uncle"],
            "no": ["no", "nope", "none"],
            "yes_regular": ["3+", "regular", "every day", "5", "4", "lift"],
            "yes_some": ["sometimes", "1-2", "occasional", "now and then"],
            "posture": ["posture", "stand"],
            "retention": ["retention", "decompress", "loss"],
            "perceived": ["fashion", "look taller", "shoes", "perceived"],
            "growth": ["grow", "growth", "natural"],
            "all": ["all", "everything"],
            # bonemax jaw chew tolerance (mastic_gum_regular enum). Safety order:
            # ambiguous free text biases toward the gentler ramp (painful > weak >
            # average > strong), since a too-cautious ramp is harmless but a
            # too-aggressive one can flare a sensitive jaw.
            "painful": ["click", "clicks", "clicking", "ache", "aches", "aching", "pops", "popping", "hurts"],
            "weak": ["sore", "tired fast", "tires fast", "gets tired", "fatigue", "fatigues", "wears out", "doesn't last", "pretty fast", "quickly"],
            "average": ["after a while", "after a bit", "eventually", "fine but", "okay but", "bit tired", "tires after"],
            "strong": ["easily", "all day", "chew tough", "no problem", "no issue", "never sore", "strong jaw", "tough stuff"],
            # Generic "none / nothing" → the `none` enum value. The `value in
            # opts` guard limits this to fields that actually have a `none`
            # option (workout_frequency, mewing_experience, current_treatment,
            # routine_level, fitmax dietary/injury/supplement, spine_health,
            # posture_issues, equipment_access). Placed before the fitmax injury
            # keywords below so a clean negation ("no injuries") wins over a
            # bare body-part match.
            "none": ["none", "nothing", "nope", "nada", "not really", "no restriction",
                     "no injuries", "no injury", "no supplements", "i eat everything",
                     "eat everything", "all good", "no issues", "no problems"],
            # --- fitmax: goal (recomp first so "at the same time" beats the
            # fat_loss / muscle_gain single-intent matches) ---
            "recomp": ["recomp", "recomposition", "at the same time", "both at once",
                       "lean out and build", "build and lean", "lose fat and build"],
            "fat_loss": ["lose fat", "fat loss", "lose", "losing", "cut", "cutting", "shred",
                         "leaner", "get lean", "lose weight", "slim down", "drop fat", "drop weight"],
            "muscle_gain": ["build muscle", "gain muscle", "grow muscle", "bulk", "bulking",
                            "add size", "put on size", "get bigger", "more mass", "pack on"],
            "performance": ["performance", "athletic", "more athletic", "stronger",
                            "strength", "explosive", "conditioning", "for sport"],
            # --- fitmax: equipment ---
            "full_gym": ["full gym", "commercial gym", "gym membership", "proper gym",
                         "real gym", "big gym", "machines"],
            "home_barbell": ["barbell", "rack", "squat rack", "power rack", "garage gym",
                             "home gym with a barbell", "bar and plates", "home barbell"],
            "home_dumbbells": ["dumbbell", "dumbbells", "db only", "just dumbbells",
                               "adjustable dumbbell", "bands at home", "kettlebell"],
            "bodyweight_only": ["bodyweight", "body weight", "no equipment", "calisthenics",
                                "no gym", "no weights", "just my body"],
            # --- fitmax: dietary_restrictions ("other" last as catch-all) ---
            "vegan": ["vegan", "plant based", "plant-based"],
            "vegetarian": ["vegetarian", "veggie"],
            "pescatarian": ["pescatarian", "pescetarian", "fish but no meat",
                            "only fish", "fish no meat"],
            "keto": ["keto", "ketogenic", "low carb", "low-carb"],
            "gluten_free": ["gluten", "celiac", "coeliac", "gluten free", "gluten-free"],
            "lactose_free": ["lactose", "dairy free", "dairy-free", "no dairy"],
            "halal_kosher": ["halal", "kosher"],
            "other": ["paleo", "carnivore", "fasting", "intermittent", "mediterranean",
                      "custom diet", "something else", "a mix", "mix of"],
            # --- fitmax: injury_history ---
            "knee": ["knee pain", "bad knee", "bad knees", "knee issue", "my knees",
                     "acl", "meniscus", "patella", "trick knee"],
            "shoulder": ["shoulder pain", "bad shoulder", "rotator cuff", "rotator",
                         "shoulder issue", "labrum"],
            "back": ["lower back", "back pain", "bad back", "on my back", "spine",
                     "sciatica", "herniated", "disc", "lumbar"],
            "multiple": ["multiple", "a few things", "several", "more than one",
                         "bunch of", "couple of injuries"],
            # --- bonemax: sleep_position (the `back` value is served by the
            # injury keyword above; add the other three positions here) ---
            "side": ["side sleeper", "on my side", "sleep on my side", "left side",
                     "right side", "fetal"],
            "stomach": ["stomach sleeper", "on my stomach", "face down", "front sleeper",
                        "on my front"],
            "mixed": ["mixed", "switch sides", "all over the place", "move around",
                      "different positions", "change positions"],
            # --- fitmax: estimated_body_fat unknown (guarded; `untested` above
            # covers the same phrases for skinmax barrier_state) ---
            "unknown": ["not sure", "no idea", "no clue", "don't know", "dont know", "dunno"],
}


# --------------------------------------------------------------------------- #
#  Trigger detection                                                          #
# --------------------------------------------------------------------------- #

_START_INTENT_KEYWORDS = {
    "skinmax":   ["skinmax", "skin max", "skin schedule", "skin plan", "skin routine"],
    "hairmax":   ["hairmax", "hair max", "hair schedule", "hair plan", "hair routine"],
    "heightmax": ["heightmax", "height max", "height schedule", "height plan", "posture plan"],
    "fitmax":    ["fitmax", "fit max", "fit schedule", "fit plan", "fitness plan", "workout plan", "training plan", "lifting plan", "gym plan"],
    "bonemax":   ["bonemax", "bone max", "bone schedule", "bone plan", "jaw plan", "mewing plan"],
}


def detect_max_start_intent(message: str) -> Optional[str]:
    """If the user's message is asking to start a max schedule, return the
    maxx_id (only for maxes that have a doc). Otherwise None."""
    if not message:
        return None
    text = message.lower()
    # Require an action verb to avoid false positives on "what is skinmax"
    has_action = any(w in text for w in ["start", "begin", "create", "build", "make", "set up", "want", "i'd like", "id like", "let's do", "lets do"])
    if not has_action:
        return None
    for max_, kws in _START_INTENT_KEYWORDS.items():
        if any(kw in text for kw in kws):
            doc = get_doc(max_)
            if doc is not None:
                return max_
    return None
