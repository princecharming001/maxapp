"""In-memory task catalog cache.

The schedule generator reads from this cache, NOT from the DB on the
hot path. Cache is loaded once at startup (warm_catalog) and rebuilt
on demand via reload_catalog() after ingest.

Loading from disk (data/maxes/*.md) is the source of truth — the DB
copy in `task_catalog` exists for parity with RAG and for read-only
access from other services. If the on-disk file disagrees with the DB
row, the on-disk file wins on next ingest.
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass
from typing import Any, Optional

from services.max_doc_loader import MaxDoc, TaskDef, parse_all_max_docs
from services.onboarding_gap import InfoSchema, compile_info_schema
from services.schedule_dsl import evaluate_all, evaluate_any

logger = logging.getLogger(__name__)

# --------------------------------------------------------------------------- #
#  In-memory cache                                                            #
# --------------------------------------------------------------------------- #

@dataclass
class _Entry:
    doc: MaxDoc
    by_id: dict[str, TaskDef]
    info_schema: Optional[InfoSchema] = None


_CACHE: dict[str, _Entry] = {}
_CACHE_LOAD_TS: float = 0.0
_LOCK = asyncio.Lock()


async def warm_catalog() -> None:
    """Load every max doc into memory. Call from app startup."""
    async with _LOCK:
        await _load()


async def reload_catalog() -> None:
    """Force reload (e.g. after `ingest_max_docs` runs)."""
    async with _LOCK:
        _CACHE.clear()
        await _load()


async def _load() -> None:
    global _CACHE_LOAD_TS
    t0 = time.perf_counter()
    docs = await asyncio.to_thread(parse_all_max_docs)
    for doc in docs:
        try:
            info_schema = compile_info_schema(doc)
        except Exception:  # compile is defensive, but never break catalog load
            logger.exception("task_catalog: compile_info_schema failed for %s", doc.maxx_id)
            info_schema = None
        _CACHE[doc.maxx_id] = _Entry(
            doc=doc,
            by_id={t.id: t for t in doc.tasks},
            info_schema=info_schema,
        )
    _CACHE_LOAD_TS = time.time()
    logger.info(
        "task_catalog: loaded %d maxes (%d total tasks) in %.0fms",
        len(_CACHE),
        sum(len(e.by_id) for e in _CACHE.values()),
        (time.perf_counter() - t0) * 1000,
    )


def get_doc(maxx_id: str) -> Optional[MaxDoc]:
    e = _CACHE.get(maxx_id)
    return e.doc if e else None


def get_info_schema(maxx_id: str) -> Optional[InfoSchema]:
    """Compiled info_schema for a max (cached at warm). None if unknown/uncompiled."""
    e = _CACHE.get(maxx_id)
    return e.info_schema if e else None


def get_task(maxx_id: str, task_id: str) -> Optional[TaskDef]:
    e = _CACHE.get(maxx_id)
    return e.by_id.get(task_id) if e else None


def all_tasks(maxx_id: str) -> list[TaskDef]:
    e = _CACHE.get(maxx_id)
    return list(e.by_id.values()) if e else []


def register_doc(doc: MaxDoc) -> None:
    """Inject a dynamically-provisioned max into the in-memory catalog.

    Creator maxes are DB-backed (not .md files on disk), so they're registered
    here at provision time + on startup rather than parsed by warm_catalog. Safe
    to call repeatedly — it overwrites the entry. Never raises (a bad creator doc
    must not take down the catalog)."""
    try:
        try:
            info_schema = compile_info_schema(doc)
        except Exception:
            logger.exception("task_catalog: compile_info_schema failed for creator doc %s", doc.maxx_id)
            info_schema = None
        _CACHE[doc.maxx_id] = _Entry(
            doc=doc,
            by_id={t.id: t for t in doc.tasks},
            info_schema=info_schema,
        )
    except Exception:
        logger.exception("task_catalog: register_doc failed for %s", getattr(doc, "maxx_id", "?"))


def has_doc(maxx_id: str) -> bool:
    return maxx_id in _CACHE


# Tag → user-facing focus-area label. Generic across maxes; the first tag that
# maps wins, else we title-case the task's first tag, else "Other".
_AREA_BY_TAG: dict[str, str] = {
    "supplement": "Supplements", "supplements": "Supplements", "creatine": "Supplements",
    "tracking": "Tracking", "review": "Tracking", "progress": "Tracking",
    "checkpoint": "Tracking", "medical": "Tracking", "dermatology": "Tracking",
    "monthly": "Tracking", "biannual": "Tracking", "weighin": "Tracking", "form": "Tracking",
    "protect": "Protection",
    "internal": "Lifestyle", "diet": "Lifestyle", "hydration": "Lifestyle",
    "lifestyle": "Lifestyle", "environment": "Lifestyle", "hygiene": "Lifestyle",
    "nutrition": "Nutrition", "protein": "Nutrition", "fuel": "Nutrition",
    "mobility": "Recovery", "recovery": "Recovery", "sleep": "Recovery",
    "stretch": "Recovery", "prehab": "Recovery", "deload": "Recovery", "warmup": "Recovery",
    "workout": "Training", "training": "Training", "lift": "Training",
    "cardio": "Training", "conditioning": "Training", "steps": "Training", "neat": "Training",
    "routine": "Routine", "foundation": "Routine",
    "active": "Treatment", "treatment": "Treatment", "collagen": "Treatment",
    "exfoliation": "Treatment", "mask": "Treatment", "retinoid": "Treatment",
    "circulation": "Care", "calming": "Care", "barrier": "Care", "repair": "Care",
    "posture": "Posture", "decompression": "Posture", "hang": "Posture",
    "mewing": "Jaw", "masseter": "Jaw", "jaw": "Jaw", "chewing": "Jaw",
    "scalp": "Scalp", "wash": "Scalp", "styling": "Styling",
}


def _area_for_tags(tags: list[str]) -> str:
    for t in (tags or []):
        a = _AREA_BY_TAG.get(str(t).strip().lower())
        if a:
            return a
    if tags:
        return str(tags[0]).strip().replace("_", " ").title()
    return "Other"


def _short_label(title: str, fallback: str) -> str:
    """Trim a task title into a chip label: drop a trailing parenthetical hint
    like 'Hydration mask (15 min)' -> 'Hydration mask'."""
    t = (title or "").strip()
    if not t:
        return fallback
    # strip one trailing "(...)" group
    cut = t.rfind("(")
    if cut > 0 and t.rstrip().endswith(")"):
        t = t[:cut].strip()
    return t or fallback


def build_offered_habits(
    maxx_id: str, days: list[dict], extra_ids: list[str] | None = None,
) -> list[dict]:
    """The picker's offered set = the DISTINCT catalog tasks actually on this
    schedule, in first-appearance order. Each entry: {id, label, area}.

    Resolves id -> title/tags via the loaded catalog; falls back to the task's
    own stored title when the catalog lacks it. This is the single source of
    truth for both the onboarding habit-picker payload and the tune-later sheet,
    so the chips correspond 1:1 to the real plan (no orphans, no id-mismatched
    stand-ins).

    `extra_ids` appends catalog tasks NOT currently on the schedule (resolved
    from the catalog alone) — used by the tune-later sheet to keep previously
    AVOIDED tasks offered (shown unselected, so the user can re-add them);
    SC4 "unselected = previously avoided". For a freshly generated schedule
    callers pass no extra_ids, so offered == the distinct scheduled ids (SC1)."""
    seen: dict[str, dict] = {}

    def _add(cid: str, task: dict | None):
        cid = str(cid)
        if not cid or cid in seen:
            return
        td = get_task(maxx_id, cid)
        title = (td.title if td else None) or (task or {}).get("title") or cid
        tags = list(td.tags) if (td and td.tags) else [str(x) for x in ((task or {}).get("tags") or [])]
        seen[cid] = {"id": cid, "label": _short_label(title, cid), "area": _area_for_tags(tags)}

    for d in (days or []):
        for t in (d.get("tasks") or []):
            cid = t.get("catalog_id")
            if cid:
                _add(cid, t)
    # Append avoided-but-no-longer-scheduled tasks last (resolved from catalog),
    # so the picker can still surface and re-enable them.
    for cid in (extra_ids or []):
        if cid and get_task(maxx_id, str(cid)):
            _add(cid, None)
    return list(seen.values())


def is_loaded() -> bool:
    return bool(_CACHE)


def loaded_maxes() -> list[str]:
    return sorted(_CACHE.keys())


# --------------------------------------------------------------------------- #
#  Filtering: which tasks apply to this user / phase?                         #
# --------------------------------------------------------------------------- #

def eligible_tasks(
    maxx_id: str,
    user_ctx: dict[str, Any],
    *,
    intensity_cap: float = 1.0,
) -> list[TaskDef]:
    """Return tasks whose applies_when is true AND contraindicated_when is
    false AND intensity ≤ cap. The generator picks from this filtered set
    so the LLM can't choose a task that conflicts with the user state.
    """
    out: list[TaskDef] = []
    for task in all_tasks(maxx_id):
        if task.intensity > intensity_cap + 1e-6:
            continue
        if task.contraindicated_when and evaluate_any(task.contraindicated_when, user_ctx):
            continue
        if not evaluate_all(task.applies_when, user_ctx):
            continue
        out.append(task)
    return out


def required_field_ids(maxx_id: str) -> list[str]:
    """Field IDs the bot MUST collect before generating for this max."""
    doc = get_doc(maxx_id)
    if not doc:
        return []
    return [str(f["id"]) for f in doc.required_fields if f.get("required", True)]


def missing_required(maxx_id: str, user_ctx: dict[str, Any]) -> list[dict]:
    """Return the field-spec dicts for any required field not yet
    answered. The bot uses these to drive the next question(s)."""
    doc = get_doc(maxx_id)
    if not doc:
        return []
    out: list[dict] = []
    for f in doc.required_fields:
        if not f.get("required", True):
            continue
        fid = f.get("id")
        if not fid:
            continue
        v = user_ctx.get(fid)
        if v is None or (isinstance(v, str) and not v.strip()):
            out.append(f)
    return out


def applicable_modifiers(maxx_id: str, user_ctx: dict[str, Any]) -> list[str]:
    """Return the `then:` strings of every prompt_modifier whose
    condition fires. Order matches doc declaration."""
    doc = get_doc(maxx_id)
    if not doc:
        return []
    out: list[str] = []
    for mod in doc.prompt_modifiers:
        cond = mod.get("if") or "always"
        if evaluate_all([cond], user_ctx):
            then = mod.get("then")
            if then:
                out.append(str(then))
    return out
