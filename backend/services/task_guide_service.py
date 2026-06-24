"""
task_guide_service.py — generate and cache step-by-step how-to guides for
schedule tasks.

Every unique task (keyed by normalised title + maxx_id) gets one LLM call;
the result is stored in the `task_guides` table and returned instantly on
subsequent requests.  The same ~15-20 tasks cover a user's whole year so
the cache population is bounded and cheap.

Returns:
    {
        "task_key": "<str>",
        "title": "<str>",
        "overview": "<str>",
        "steps": [
            {
                "n": 1,
                "title": "<str>",
                "body": "<str>",
                "tip": "<str|null>"
            }, ...
        ],
        "duration_minutes": <int>,
        "why_it_matters": "<str>"
    }
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Key normalisation — same logic as the mobile side (scheduleAggregation.ts)
# so a "Morning skincare" and "morning skincare" share a cache slot.
# ---------------------------------------------------------------------------

def _normalise_key(title: str, maxx_id: Optional[str]) -> str:
    slug = title.lower().strip()
    slug = re.sub(r"\s*\([^)]*\)", " ", slug)
    slug = re.sub(r"\s+", " ", slug).strip()[:56]
    return f"{maxx_id or 'generic'}|{slug}"


# ---------------------------------------------------------------------------
# Protocol grounding — pull the authored content for the task's maxx so the
# LLM has real product/step info instead of hallucinating.
# ---------------------------------------------------------------------------

def _protocol_grounding(maxx_id: Optional[str], task_title: str, task_description: str) -> str:
    """Return a short authored-protocol excerpt relevant to the task, or ''."""
    if not maxx_id:
        return ""
    try:
        from services.maxx_guidelines import get_maxx_guideline
        guideline = get_maxx_guideline(maxx_id)
        if not guideline:
            return ""

        protocols = guideline.get("protocols", {})
        if not protocols:
            return ""

        blob = (task_title + " " + task_description).lower()

        # Pick AM vs PM slot based on task content
        slot = "pm" if any(w in blob for w in ("pm", "evening", "night", "bedtime")) else "am"

        # Pick the first concern that has content (or just the first)
        for concern_data in protocols.values():
            if isinstance(concern_data, dict):
                content = concern_data.get(slot) or concern_data.get("am") or ""
                if content:
                    return f"PROTOCOL REFERENCE ({maxx_id} {slot}):\n{content[:600]}"
        return ""
    except Exception:
        return ""


# ---------------------------------------------------------------------------
# LLM prompt + call
# ---------------------------------------------------------------------------

_SYSTEM = """You are Max's step-by-step guide writer. Given a habit task, output a JSON
guide that breaks it into 3-5 simple, do-this-now steps a real person can follow, plus
the products they need. Keep it plain and practical, not fancy.

RULES:
- Steps are concrete: what to do, how long, what motion/amount. 1-2 sentences each.
- Titles short (2-5 words). tip is optional (1 short sentence) or null.
- "products" lists what they need to do this task: 1-4 items, each {name, note}.
  Use generic names (e.g. "gentle cleanser", "vitamin C serum") unless the protocol
  reference names a specific one. note is a few words on what it's for. Empty list [] if
  the task needs no products (e.g. a stretch, a walk).
- overview and why_it_matters: 1-2 sentences each, conversational, like a friend.
- Return ONLY valid JSON matching the schema. No markdown, no prose around it.
- duration_minutes = actual time to complete.

JSON SCHEMA (return exactly this shape):
{
  "overview": "string",
  "steps": [
    { "n": 1, "title": "string", "body": "string", "tip": "string or null" }
  ],
  "products": [
    { "name": "string", "note": "string" }
  ],
  "duration_minutes": 5,
  "why_it_matters": "string"
}"""


async def _generate_guide(
    title: str,
    description: str,
    maxx_id: Optional[str],
    duration_minutes: int,
) -> dict:
    protocol_block = _protocol_grounding(maxx_id, title, description)

    user_prompt = f"""Generate a step-by-step guide for this daily habit:

TASK: {title}
DESCRIPTION: {description}
SCHEDULED DURATION: {duration_minutes} minutes
MAXX PROGRAM: {maxx_id or 'general'}
{protocol_block}

Return the JSON guide with 3-5 steps."""

    raw = ""
    try:
        # Hard timeout so a slow/hung provider can NEVER leave the client stuck on
        # "Preparing your guide…" — fall through to OpenAI, then the grounded
        # fallback, fast.
        from services.claude_service import claude_service
        raw = await asyncio.wait_for(
            claude_service.simple_completion(user_prompt, system_prompt=_SYSTEM, max_tokens=900),
            timeout=22,
        )
    except Exception as e:
        logger.warning("Claude guide gen failed/timed out (%s); trying openai fallback", e)
        try:
            from services.openai_service import openai_service
            raw = await asyncio.wait_for(
                openai_service.completion_text(_SYSTEM + "\n\n" + user_prompt),
                timeout=22,
            )
        except Exception as e2:
            logger.warning("OpenAI guide gen also failed/timed out: %s", e2)

    if not raw:
        # Minimal safe fallback
        return _fallback_guide(title, description, duration_minutes)

    # Strip markdown fences if the model adds them
    raw = re.sub(r"^```(?:json)?\s*", "", raw.strip(), flags=re.MULTILINE)
    raw = re.sub(r"```\s*$", "", raw.strip(), flags=re.MULTILINE)

    try:
        parsed = json.loads(raw.strip())
        _validate(parsed)
        return parsed
    except Exception as e:
        logger.warning("Task guide JSON parse failed (%s): %s…", e, raw[:200])
        return _fallback_guide(title, description, duration_minutes)


def _validate(guide: dict) -> None:
    assert isinstance(guide.get("overview"), str), "missing overview"
    assert isinstance(guide.get("steps"), list) and len(guide["steps"]) >= 1, "bad steps"
    assert isinstance(guide.get("why_it_matters"), str), "missing why_it_matters"
    for s in guide["steps"]:
        assert isinstance(s.get("title"), str), "step missing title"
        assert isinstance(s.get("body"), str), "step missing body"
    # products is optional — normalize to a clean list so the client always has
    # the key (never KeyError on a guide cached before products existed).
    prods = guide.get("products")
    if not isinstance(prods, list):
        guide["products"] = []
    else:
        guide["products"] = [
            {"name": str(p.get("name", "")).strip(), "note": str(p.get("note", "")).strip()}
            for p in prods
            if isinstance(p, dict) and str(p.get("name", "")).strip()
        ]


def _fallback_guide(title: str, description: str, duration_minutes: int) -> dict:
    return {
        "overview": description or f"Complete your {title} habit.",
        "steps": [
            {
                "n": 1,
                "title": "Get set up",
                "body": "Gather everything you need before starting.",
                "tip": None,
            },
            {
                "n": 2,
                "title": "Do the work",
                "body": description or f"Follow through on {title} for {duration_minutes} minutes.",
                "tip": "Consistency matters more than perfection.",
            },
            {
                "n": 3,
                "title": "Mark it done",
                "body": "Check this off to log your progress and build your streak.",
                "tip": None,
            },
        ],
        "products": [],
        "duration_minutes": duration_minutes or 5,
        "why_it_matters": "Building this habit consistently compounds into real results over time.",
    }


# ---------------------------------------------------------------------------
# Cache layer — task_guides table (created on first use via CREATE IF NOT EXISTS)
# ---------------------------------------------------------------------------

_TABLE_INIT = """
CREATE TABLE IF NOT EXISTS task_guides (
    task_key    TEXT PRIMARY KEY,
    payload     JSONB NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
"""

_TABLE_READY = False
# In-flight guard: prevents concurrent LLM calls for the same task key.
_IN_FLIGHT: set[str] = set()


async def _ensure_table(db: AsyncSession) -> None:
    global _TABLE_READY
    if _TABLE_READY:
        return
    await db.execute(text(_TABLE_INIT))
    await db.commit()
    _TABLE_READY = True


async def _cache_get(task_key: str, db: AsyncSession) -> Optional[dict]:
    row = await db.execute(
        text("SELECT payload FROM task_guides WHERE task_key = :k"),
        {"k": task_key},
    )
    result = row.fetchone()
    if result:
        payload = result[0]
        return payload if isinstance(payload, dict) else json.loads(payload)
    return None


async def _cache_set(task_key: str, payload: dict, db: AsyncSession) -> None:
    await db.execute(
        text(
            """
            INSERT INTO task_guides (task_key, payload)
            VALUES (:k, :p::jsonb)
            ON CONFLICT (task_key) DO UPDATE SET payload = :p::jsonb, created_at = NOW()
            """
        ),
        {"k": task_key, "p": json.dumps(payload)},
    )
    await db.commit()


# ---------------------------------------------------------------------------
# Pre-generation — called as a BackgroundTask after schedule create/adapt
# ---------------------------------------------------------------------------

async def pregenerate_for_schedule(schedule_id: str, user_id: str) -> None:
    """
    Warm the task_guides cache for every distinct task in a schedule.
    Opens its own DB session so it is safe to run after the request session
    has been closed (FastAPI BackgroundTask context).
    """
    try:
        from db import AsyncSessionLocal
        async with AsyncSessionLocal() as db:
            await _ensure_table(db)
            row = await db.execute(
                text(
                    "SELECT days, maxx_id FROM user_schedules "
                    "WHERE id = :sid AND user_id = :uid"
                ),
                {"sid": schedule_id, "uid": user_id},
            )
            sched = row.fetchone()
            if not sched:
                return
            days, maxx_id = sched[0] or [], sched[1]

            # Collect distinct tasks (deduplicated by normalised cache key)
            seen: set[str] = set()
            to_warm: list[dict] = []
            for day in days:
                for task in day.get("tasks", []):
                    title = task.get("title", "")
                    if not title:
                        continue
                    key = _normalise_key(title, maxx_id)
                    if key in seen:
                        continue
                    seen.add(key)
                    to_warm.append({"key": key, "task": task})

            if not to_warm:
                return

            logger.info("[task_guide] pre-generating %d tasks for schedule %s", len(to_warm), schedule_id)
            sem = asyncio.Semaphore(3)

            async def _warm(item: dict) -> None:
                key: str = item["key"]
                task: dict = item["task"]
                if key in _IN_FLIGHT:
                    return
                cached = await _cache_get(key, db)
                if cached:
                    return
                _IN_FLIGHT.add(key)
                try:
                    async with sem:
                        title = task.get("title", "")
                        desc = task.get("description", "")
                        dur = int(task.get("duration_minutes") or 5)
                        guide = await _generate_guide(title, desc, maxx_id, dur)
                        guide["duration_minutes"] = guide.get("duration_minutes") or dur
                        await _cache_set(key, guide, db)
                        logger.info("[task_guide] pre-generated: %s", key)
                except Exception as e:
                    logger.warning("[task_guide] pregenerate failed for %s: %s", key, e)
                finally:
                    _IN_FLIGHT.discard(key)

            await asyncio.gather(*[_warm(item) for item in to_warm])
    except Exception as e:
        logger.warning("[task_guide] pregenerate_for_schedule(%s) failed: %s", schedule_id, e)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def get_task_guide(
    schedule_id: str,
    task_id: str,
    user_id: str,
    db: AsyncSession,
) -> dict:
    """
    Return a step-by-step guide for the given task.

    Looks up the task in the schedule JSON, normalises a cache key, returns
    from cache if available, otherwise generates via LLM and caches the result.
    """
    await _ensure_table(db)

    # Fetch the schedule and find the task in its days JSON
    row = await db.execute(
        text(
            "SELECT days, maxx_id FROM user_schedules WHERE id = :sid AND user_id = :uid"
        ),
        {"sid": schedule_id, "uid": user_id},
    )
    sched = row.fetchone()
    if not sched:
        return _error_guide("Schedule not found")

    days, maxx_id = sched[0] or [], sched[1]
    task: Optional[dict] = None
    for day in days:
        for t in day.get("tasks", []):
            if str(t.get("task_id")) == str(task_id):
                task = t
                break
        if task:
            break

    if not task:
        return _error_guide("Task not found")

    title = task.get("title", "")
    description = task.get("description", "")
    duration = int(task.get("duration_minutes") or 5)
    task_key = _normalise_key(title, maxx_id)

    # Cache hit
    cached = await _cache_get(task_key, db)
    if cached:
        return {"task_key": task_key, "title": title, **cached}

    # Generate
    guide = await _generate_guide(title, description, maxx_id, duration)
    guide["duration_minutes"] = guide.get("duration_minutes") or duration

    await _cache_set(task_key, guide, db)
    return {"task_key": task_key, "title": title, **guide}


def _error_guide(msg: str) -> dict:
    return {
        "task_key": "",
        "title": "Task",
        "overview": msg,
        "steps": [{"n": 1, "title": "Unavailable", "body": msg, "tip": None}],
        "duration_minutes": 5,
        "why_it_matters": "",
    }
