"""
Skinmax routines and helper utilities.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional, Dict
import re

SKINMAX_CONCERNS: Dict[str, Dict[str, str]] = {
    "acne": {
        "label": "Acne / Congestion",
        "am": "Gentle cleanser -> benzoyl peroxide or salicylic acid -> lightweight moisturizer -> sunscreen",
        "pm": "Cleanser -> adapalene/retinoid -> moisturizer",
        "weekly": "Clay mask 1-2x, BHA exfoliant 1-3x, no strong peels if inflamed",
        "sunscreen": "Oil-free, non-comedogenic SPF 30+ every morning",
    },
    "pigmentation": {
        "label": "Pigmentation / Uneven Tone",
        "am": "Gentle cleanser -> vitamin C or azelaic acid -> moisturizer -> sunscreen",
        "pm": "Cleanser -> retinoid or azelaic acid -> moisturizer",
        "weekly": "Gentle exfoliant 1-2x, brightening mask 1x, mild peel occasionally",
        "sunscreen": "SPF 30-50 daily or dark spots will keep getting worse",
    },
    "texture": {
        "label": "Texture / Scarring",
        "am": "Gentle cleanser -> niacinamide or salicylic acid -> moisturizer -> sunscreen",
        "pm": "Cleanser -> retinoid -> moisturizer",
        "weekly": "AHA/BHA exfoliant 1-2x, smoothing mask 1x, mild peel occasionally",
        "sunscreen": "SPF 30+ daily to protect collagen and prevent scar darkening",
    },
    "redness": {
        "label": "Redness / Sensitivity",
        "am": "Gentle cleanser -> azelaic acid or calming serum -> barrier moisturizer -> sunscreen",
        "pm": "Gentle cleanser -> azelaic acid -> barrier moisturizer",
        "weekly": "Hydrating mask 1-2x, very mild exfoliation or none, avoid aggressive peels",
        "sunscreen": "Mineral SPF 30+ daily, especially if skin gets red easily",
    },
    "aging": {
        "label": "Aging / Skin Quality",
        "am": "Gentle cleanser -> vitamin C -> moisturizer -> sunscreen",
        "pm": "Cleanser -> retinoid/retinol -> moisturizer",
        "weekly": "Hydrating mask 1x, gentle exfoliant 1x, peel occasionally if tolerated",
        "sunscreen": "SPF 30-50 every day since UV ages your face faster than anything",
    },
}


def parse_time_from_text(text: str, default_meridian: Optional[str] = None) -> Optional[str]:
    if not text:
        return None
    s = text.strip().lower()
    match = re.search(r"(\d{1,2})(?::(\d{2}))?\s*(am|pm)?", s)
    if not match:
        return None
    hour = int(match.group(1))
    minute = int(match.group(2) or "0")
    ampm = match.group(3) or default_meridian
    if minute > 59 or hour > 24:
        return None
    if ampm:
        if hour == 12:
            hour = 0
        if ampm == "pm":
            hour += 12
    if hour == 24:
        hour = 0
    return f"{hour:02d}:{minute:02d}"


def add_minutes(time_str: str, minutes: int) -> str:
    base = datetime.strptime(time_str, "%H:%M")
    dt = base + timedelta(minutes=minutes)
    return dt.time().strftime("%H:%M")


def get_concern_key(text: str) -> Optional[str]:
    s = (text or "").lower()
    if "acne" in s or "congestion" in s:
        return "acne"
    if "pigment" in s or "uneven" in s or "tone" in s or "dark spot" in s:
        return "pigmentation"
    if "texture" in s or "scar" in s:
        return "texture"
    if "red" in s or "sensitive" in s or "rosacea" in s:
        return "redness"
    if "aging" in s or "age" in s or "quality" in s or "wrinkle" in s:
        return "aging"
    if s.strip() in {"1", "2", "3", "4", "5"}:
        return {"1": "acne", "2": "pigmentation", "3": "texture", "4": "redness", "5": "aging"}[s.strip()]
    return None


# --------------------------------------------------------------------------- #
#  Personalized routine composer                                              #
#                                                                             #
#  One AM task and one PM task, built for the person's concern + skin type +  #
#  barrier state. Order follows dermatology: lightest -> heaviest, antioxidant#
#  serums (vitamin C) in the AM under SPF, retinoids/strong exfoliants in the #
#  PM (sun-sensitising), SPF always last in the morning, one active per       #
#  routine (layering everything irritates the barrier). Masks, exfoliants and #
#  other occasional steps stay OUT of this — they are separate weekly tasks.  #
# --------------------------------------------------------------------------- #

# Concern -> AM serum / PM treatment.
_AM_SERUM: Dict[str, str] = {
    "acne": "Niacinamide serum",
    "pigmentation": "Vitamin C or azelaic acid serum",
    "texture": "Niacinamide serum",
    "redness": "Azelaic acid or centella serum",
    "aging": "Vitamin C serum",
}
_PM_TREATMENT: Dict[str, str] = {
    "acne": "Adapalene / retinoid (ease in 2-3 nights a week)",
    "pigmentation": "Retinoid or azelaic acid",
    "texture": "Retinoid (build up slowly)",
    "redness": "Azelaic acid (gentle, nightly is fine)",
    "aging": "Retinoid / retinol (build up slowly)",
}


def concern_key_for_state(state: dict) -> str:
    """Resolve the user's skin_concern answer to a known concern key, defaulting
    to a sensible maintenance routine ('aging': antioxidant AM, retinol PM)."""
    raw = str((state or {}).get("skin_concern") or "").strip().lower()
    if raw in SKINMAX_CONCERNS:
        return raw
    alias = {
        "rosacea": "redness", "sensitivity": "redness", "sensitive": "redness",
        "dark_spots": "pigmentation", "uneven": "pigmentation",
        "scarring": "texture", "scars": "texture",
        "wrinkles": "aging", "fine_lines": "aging",
        "maintenance": "aging", "prevention": "aging", "general": "aging",
    }
    return alias.get(raw) or get_concern_key(raw) or "aging"


def _skin_type(state: dict) -> str:
    return str((state or {}).get("skin_type") or "").strip().lower()


def _cleanser(state: dict, concern: str) -> str:
    st = _skin_type(state)
    if concern == "acne" or st == "oily":
        return "Gel or foaming cleanser"
    if st == "dry":
        return "Cream / hydrating cleanser"
    if concern == "redness" or st == "sensitive":
        return "Gentle non-foaming cleanser"
    return "Gentle gel cleanser"


def _moisturizer(state: dict, concern: str) -> str:
    st = _skin_type(state)
    if concern == "acne" or st == "oily":
        return "Lightweight gel moisturizer"
    if st == "dry":
        return "Rich ceramide cream"
    if concern == "redness" or st == "sensitive":
        return "Barrier-repair moisturizer"
    return "Ceramide moisturizer"


def _spf(state: dict, concern: str) -> str:
    st = _skin_type(state)
    if concern == "acne" or st == "oily":
        return "Oil-free SPF 30+"
    if concern == "redness" or st == "sensitive":
        return "Mineral SPF 30+"
    if concern == "pigmentation":
        return "SPF 50 (tinted helps)"
    return "SPF 30-50"


def compose_skincare_routine(state: dict) -> dict:
    """Return the personalized AM and PM routines, each as ONE ordered step list."""
    concern = concern_key_for_state(state)
    barrier = str((state or {}).get("barrier_state") or "").strip().lower()

    if barrier == "damaged":
        am_steps = ["Gentle non-foaming cleanser", "Barrier-repair moisturizer", "Mineral SPF 30+"]
        pm_steps = ["Gentle non-foaming cleanser", "Barrier-repair moisturizer"]
        note = "Barrier in recovery - no actives until it's calm."
        am_note = pm_note = note
    else:
        cleanser = _cleanser(state, concern)
        moist = _moisturizer(state, concern)
        am_serum = _AM_SERUM.get(concern)
        pm_treat = _PM_TREATMENT.get(concern)
        am_steps = [cleanser] + ([am_serum] if am_serum else []) + [moist, _spf(state, concern)]
        pm_steps = [cleanser] + ([pm_treat] if pm_treat else []) + [moist]
        if _skin_type(state) in ("dry", "sensitive"):
            pm_steps.insert(1, "Hydrating serum (hyaluronic acid)")
        am_note = pm_note = None

    def _dur(steps: list) -> int:
        return max(4, 2 * len(steps) - 1)

    return {
        "concern": concern,
        "am": {"title": "Morning skincare", "steps": am_steps, "note": am_note, "duration": _dur(am_steps)},
        "pm": {"title": "Evening skincare", "steps": pm_steps, "note": pm_note, "duration": _dur(pm_steps)},
    }


def routine_description(part: dict) -> str:
    desc = "  ->  ".join(part.get("steps") or [])
    if part.get("note"):
        desc = f"{desc}  -  {part['note']}" if desc else part["note"]
    return desc


def personalize_skinmax_days(days: list, state: dict) -> list:
    """Rewrite the single `skin.am_routine` / `skin.pm_routine` tasks in `days`
    with a routine personalized to the user. No-op when those tasks aren't
    present, so it's safe to call on any generated day list."""
    r = compose_skincare_routine(state or {})
    by_cid = {"skin.am_routine": r["am"], "skin.pm_routine": r["pm"]}
    for day in days or []:
        for t in (day.get("tasks") or []):
            part = by_cid.get(t.get("catalog_id"))
            if not part:
                continue
            t["title"] = part["title"]
            t["description"] = routine_description(part)
            t["duration_min"] = part["duration"]
            t["duration_minutes"] = part["duration"]
    return days
