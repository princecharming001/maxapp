"""
task_guide_service.py — step-by-step guides for schedule tasks.

A guide belongs to ONE person and ONE scheduled instance of a habit. Its cache
key holds everything the text depends on:

    u:<user>|<catalog_id>|t<HH:MM>|d<minutes>|a<day-anchors hash>|h<plan text hash>|x<days/needs/kind hash>|v<version>

so a retimed or resized task, a changed wake/bed/meal/workout time, or a new
plan text is a cache miss by construction (Beta-1 W3, contract C5). Entries
expire after `_GUIDE_TTL_S`; `invalidate_user_guides` drops a person's rows
after a plan rebuild.

The prompt gets the scheduled time, minutes and days, the person's day
anchors, the habit's library entry (why/how/dose note/timing/avoid if), the
other tasks that day and the products already chosen for the task. The model's
text is then post-processed so the rules hold whatever it wrote: no clock time
but the scheduled one, no alarms/shopping/night-before steps, no workout or meal
that isn't in their day, minutes never above the scheduled minutes, supplement
doses only from the library's dose note, plus a caution and "check with your
clinician". The scheduled duration always wins over the model's.

Products come from the Products tab (`api.products.task_products`): the same
pick per need, consumables under each step's `ingredients` ("What you'll use"),
gear under `gear`, and gear only on a step that uses it.

Returns:
    {
        "task_key": str, "title": str, "overview": str,
        "steps": [{"n": 1, "title": str, "body": str, "tip": str|None,
                   "ingredients": [card], "gear": [card]}],
        "ingredients": [card], "gear": [card], "products": [card],
        "duration_minutes": int, "why_it_matters": str, "kind": str,
        "scheduled_time": "HH:MM"|None, "safety": [str],
    }
    card = {name, brand, need, need_label, strength, strength_note, url, image, asin, ...}
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import re
import time
from datetime import date as _date
from typing import Any, Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from db import release_conn

logger = logging.getLogger(__name__)

WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]

# ---------------------------------------------------------------------------
# Key normalisation — same logic as the mobile side (scheduleAggregation.ts).
# Still the key for per-step images and the gcal mirror; no longer the cache key.
# ---------------------------------------------------------------------------

def _normalise_key(title: str, maxx_id: Optional[str]) -> str:
    slug = title.lower().strip()
    slug = re.sub(r"\s*\([^)]*\)", " ", slug)
    slug = re.sub(r"\s+", " ", slug).strip()[:56]
    return f"{maxx_id or 'generic'}|{slug}"


def _h(obj: Any, n: int = 10) -> str:
    raw = obj if isinstance(obj, str) else json.dumps(obj, sort_keys=True, default=str)
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:n]


def _hm(v: Any) -> str:
    s = str(v or "").strip()
    m = re.fullmatch(r"(\d{1,2}):(\d{2})", s)
    return f"{int(m.group(1)):02d}:{m.group(2)}" if m else ""


def _to_min(hm: str) -> Optional[int]:
    hm = _hm(hm)
    return int(hm[:2]) * 60 + int(hm[3:]) if hm else None


def _pretty(hm: str) -> str:
    m = _to_min(hm)
    if m is None:
        return ""
    h, mm = divmod(m, 60)
    suffix = "am" if h < 12 else "pm"
    h12 = h % 12 or 12
    return f"{h12}:{mm:02d} {suffix}"


# ---------------------------------------------------------------------------
# Legacy protocol grounding (looks programs, MAXX_GUIDELINES)
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
        slot = "pm" if any(w in blob for w in ("pm", "evening", "night", "bedtime")) else "am"
        for concern_data in protocols.values():
            if isinstance(concern_data, dict):
                content = concern_data.get(slot) or concern_data.get("am") or ""
                if content:
                    return f"PROTOCOL REFERENCE ({maxx_id} {slot}):\n{content[:600]}"
        return ""
    except Exception:
        return ""


# ---------------------------------------------------------------------------
# Inputs: everything the guide text depends on
# ---------------------------------------------------------------------------

_WORKOUT_TITLE = re.compile(
    r"\b(workout|training|strength|gym|run|lift(?:ing)?|hiit|cardio|session|zone 2|intervals?)\b", re.I)


def _has_workout(profile: dict, day_tasks: list[dict]) -> bool:
    if _hm((profile or {}).get("workout_time")):
        return True
    for t in day_tasks or []:
        cid = str(t.get("catalog_id") or "")
        if cid.startswith(("trainmax.", "fitmax.")) and _WORKOUT_TITLE.search(str(t.get("title") or "")):
            return True
    return False


def _anchors(profile: dict, has_workout: bool) -> dict:
    meals = (profile or {}).get("meals") or {}
    return {
        "wake": _hm(profile.get("wake_time")) if profile else "",
        "bed": _hm(profile.get("bed_time")) if profile else "",
        "breakfast": _hm(meals.get("breakfast")),
        "lunch": _hm(meals.get("lunch")),
        "dinner": _hm(meals.get("dinner")),
        "workout": _hm((profile or {}).get("workout_time")),
        "has_workout": bool(has_workout),
    }


def _meal_at(anchors: dict, hm: str, window: int = 45) -> str:
    """The meal within `window` minutes of the scheduled time, or ''."""
    t = _to_min(hm)
    if t is None:
        return ""
    best, gap = "", window + 1
    for meal in ("breakfast", "lunch", "dinner"):
        m = _to_min(anchors.get(meal) or "")
        if m is None:
            continue
        d = min(abs(m - t), 1440 - abs(m - t))
        if d <= window and d < gap:
            best, gap = meal, d
    return best


def _task_days(days: list[dict], task: dict) -> list[str]:
    """Weekdays this habit happens at this same time across the schedule."""
    cid, title, tm = task.get("catalog_id"), task.get("title"), _hm(task.get("time"))
    out: set[str] = set()
    for d in days or []:
        try:
            wd = WEEKDAYS[_date.fromisoformat(str(d.get("date"))[:10]).weekday()]
        except Exception:
            continue
        for t in d.get("tasks") or []:
            same = (cid and t.get("catalog_id") == cid) or (not cid and t.get("title") == title)
            if same and _hm(t.get("time")) == tm:
                out.add(wd)
    return [w for w in WEEKDAYS if w in out]


def _habit_ids(task: dict) -> list[tuple[str, str]]:
    """[(maxx_id, habit_id)] — several for a folded supplement row."""
    ids = [str(c) for c in (task.get("group") or []) if c] or [str(task.get("catalog_id") or "")]
    out = []
    for cid in ids:
        if "." in cid:
            mid, hid = cid.split(".", 1)
            out.append((mid, hid))
    return out


def build_inputs(*, user_id: str, maxx_id: Optional[str], task: dict, days: list[dict],
                 profile: dict, day_tasks: list[dict], needs: list[dict]) -> dict:
    """Pure: the full set of things one guide's text depends on."""
    from services.habit_library import entry_kind, library_entry
    libs = [e for e in (library_entry(m, h) for m, h in _habit_ids(task)) if e]
    lib = libs[0] if libs else {}
    duration = int(task.get("duration_minutes") or task.get("duration_min") or 0) or 5
    tm = _hm(task.get("time"))
    # the task itself counts: a Trainmax session's own guide may say "workout"
    has_wo = _has_workout(profile, [t for t in day_tasks if t.get("task_id") != task.get("task_id")] + [task])
    anchors = _anchors(profile or {}, has_wo)
    cid = str(task.get("catalog_id") or "")
    hid = cid.split(".", 1)[-1] if cid else ""
    is_supp = (maxx_id == "suppmax") or any(e.get("dose note") for e in libs)
    others = sorted(
        ((_hm(t.get("time")), str(t.get("title") or "")) for t in day_tasks or []
         if t.get("task_id") != task.get("task_id") and t.get("title")),
        key=lambda x: x[0] or "99:99")
    return {
        "user_id": str(user_id),
        "maxx_id": maxx_id or "",
        "catalog_id": cid,
        "habit_id": hid,
        "image_key": _normalise_key(str(task.get("title") or ""), maxx_id),
        "title": str(task.get("title") or ""),
        "description": str(task.get("description") or ""),
        "time": tm,
        "duration": duration,
        "days": _task_days(days, task),
        "kind": entry_kind(lib, task),
        "libs": libs,
        "anchors": anchors,
        "meal_at_time": _meal_at(anchors, tm),
        "others": [f"{t or '--:--'} {title}" for t, title in others][:12],
        "needs": needs,
        "is_supp": is_supp,
        "is_peptide": maxx_id == "peptidemax",
    }


_PAYLOAD_V = 4                       # v4 = per-user, per-instance guides (Beta-1 W3)
_GUIDE_TTL_S = 30 * 24 * 60 * 60     # real guides regenerate after 30 days


def guide_key(inp: dict) -> str:
    """Per user, per scheduled instance. Every input the text depends on is in it."""
    ident = inp["catalog_id"] or inp["image_key"]
    extra = {"days": inp["days"], "kind": inp["kind"],
             "needs": sorted((n["need"], bool(n.get("gear"))) for n in inp["needs"])}
    return (f"u:{inp['user_id']}|{ident}|t{inp['time'] or '-'}|d{inp['duration']}"
            f"|a{_h(inp['anchors'])}|h{_h(inp['description'].strip().lower())}|x{_h(extra)}|v{_PAYLOAD_V}")


def _user_prefix(user_id: str) -> str:
    return f"u:{user_id}|"


# ---------------------------------------------------------------------------
# LLM prompt + call
# ---------------------------------------------------------------------------

_SYSTEM = """You are Superpower's step-by-step guide writer. You turn ONE scheduled habit into short
steps the person does at the scheduled time. Output JSON only.

HARD RULES (a guide that breaks one is thrown away):
1. Steps are only actions done NOW, at the scheduled time, inside the scheduled minutes. Never
   preparation for later, never "the night before", "in advance" or "ahead of time".
2. Never write a clock time other than SCHEDULED TIME. Prefer "now" or "at this time" (the card shows the time).
3. Never tell them to set an alarm or a reminder (the app reminds them).
4. Never tell them to buy, order, pick up, shop for, choose or stock up on anything. Their products are
   already chosen (PRODUCTS); call them by their plain name, only in the step that uses them.
5. Never mention a workout, meal, commute or event that is not in THEIR DAY. If THEIR DAY says there is no
   workout, never mention one. Name a meal (breakfast/lunch/dinner) only if MEAL AT THIS TIME is that meal.
6. The steps together fit inside SCHEDULED MINUTES and there are never more steps than minutes (max 5).
   If you state how long, it is exactly SCHEDULED MINUTES; never write a different number of minutes.
7. Supplements (a DOSE NOTE is given): say "take the serving on your label". Write no dose, range or amount
   that is not in the DOSE NOTE, and never a narrower or wider range than it gives. Add one short caution
   from AVOID IF or TIMING (e.g. "Don't drive after taking it.") and the sentence
   "Check with your clinician if you take other medicines."
8. Peptides: never state a dose, never say how to get it; refer to "the protocol your prescriber gave you".
9. Tips are optional and practical. No claims: never "maximum", "optimal", "boosts", "works as well",
   "studies show", "proven". Use null when there's nothing practical to add.
10. why_it_matters is ONE sentence based on the LIBRARY why. Add no numbers or claims that aren't in it.
11. No absolutes like "before you do anything else" and no fixed amounts (ml, litres, grams of food) unless
    the LIBRARY gives them.
12. Plain words. Step titles 2-5 words, bodies 1-2 sentences.
13. KIND setup = done once (say so). KIND checkin = a short log or review.

JSON SCHEMA (return exactly this shape):
{
  "overview": "string",
  "steps": [ { "n": 1, "title": "string", "body": "string", "tip": "string or null" } ],
  "why_it_matters": "string"
}"""


def _lib_block(libs: list[dict]) -> str:
    if not libs:
        return "LIBRARY ENTRY: none"
    out = []
    for e in libs:
        lines = [f"LIBRARY ENTRY: {e.get('title') or e.get('habit_id')}"]
        for k in ("kind", "anchor", "frequency", "why", "how", "dose note", "timing", "avoid if"):
            if e.get(k):
                lines.append(f"- {k}: {e[k]}")
        out.append("\n".join(lines))
    return "\n\n".join(out)


def build_prompt(inp: dict) -> str:
    a = inp["anchors"]
    meals = ", ".join(f"{m} {a[m]}" for m in ("breakfast", "lunch", "dinner") if a.get(m)) or "not known"
    if a.get("has_workout"):
        workout = f"yes, at {a['workout']}" if a.get("workout") else "yes (a training task is in their plan today)"
    else:
        workout = "NO workout in their plans: never mention one"
    needs = "\n".join(
        f"- {n.get('label') or n['need']} ({'gear' if n.get('gear') else 'consumable'})" for n in inp["needs"]
    ) or "- none (don't name products)"
    others = "\n".join(f"- {o}" for o in inp["others"]) or "- none"
    sched = f"{inp['time']} ({_pretty(inp['time'])})" if inp["time"] else "not fixed"
    legacy = "" if inp["libs"] else _protocol_grounding(inp["maxx_id"], inp["title"], inp["description"])
    max_steps = max(1, min(5, inp["duration"]))
    return f"""Write the guide for this scheduled habit.

HABIT: {inp['title']}
PROGRAM: {inp['maxx_id'] or 'general'}
KIND: {inp['kind']}
SCHEDULED TIME: {sched}
SCHEDULED MINUTES: {inp['duration']}
DAYS: {', '.join(inp['days']) or 'as scheduled'}
PLAN TEXT FOR THIS TASK: {inp['description'] or '(none)'}

{_lib_block(inp['libs'])}
{legacy}

THEIR DAY:
- wake {a.get('wake') or 'not known'}, bed {a.get('bed') or 'not known'}
- meals: {meals}
- MEAL AT THIS TIME: {inp['meal_at_time'] or 'none'}
- workout: {workout}
- other tasks that day (context only; never mention their times):
{others}

PRODUCTS (already chosen):
{needs}

Return the JSON guide with {'1 step' if max_steps == 1 else f'1-{max_steps} steps'}."""


async def _call_llm(system: str, prompt: str) -> str:
    """One provider round: Claude, then OpenAI. '' when both fail (tests stub this)."""
    try:
        from services.claude_service import claude_service
        return await asyncio.wait_for(
            claude_service.simple_completion(prompt, system_prompt=system, max_tokens=900), timeout=22)
    except Exception as e:
        logger.warning("Claude guide gen failed/timed out (%s); trying openai fallback", e)
    try:
        from services.openai_service import openai_service
        return await asyncio.wait_for(openai_service.completion_text(system + "\n\n" + prompt), timeout=22)
    except Exception as e2:
        logger.warning("OpenAI guide gen also failed/timed out: %s", e2)
    return ""


def _validate(guide: dict) -> None:
    assert isinstance(guide.get("overview"), str), "missing overview"
    assert isinstance(guide.get("steps"), list) and len(guide["steps"]) >= 1, "bad steps"
    assert isinstance(guide.get("why_it_matters"), str), "missing why_it_matters"
    for s in guide["steps"]:
        assert isinstance(s.get("title"), str), "step missing title"
        assert isinstance(s.get("body"), str), "step missing body"


async def _generate_guide(inp: dict) -> dict:
    """LLM text for one instance, post-processed. Degraded library fallback on failure."""
    if inp["kind"] == "rule":
        return postprocess(_library_guide(inp), inp)
    raw = await _call_llm(_SYSTEM, build_prompt(inp))
    if raw:
        raw = re.sub(r"^```(?:json)?\s*", "", raw.strip(), flags=re.MULTILINE)
        raw = re.sub(r"```\s*$", "", raw.strip(), flags=re.MULTILINE)
        try:
            parsed = json.loads(raw.strip())
            _validate(parsed)
            out = postprocess(parsed, inp)
            if out.get("steps"):
                return out
        except Exception as e:
            logger.warning("Task guide JSON parse failed (%s): %s…", e, raw[:200])
    return _fallback_guide(inp)


# ---------------------------------------------------------------------------
# Post-processing: the rules hold whatever the model wrote
# ---------------------------------------------------------------------------

_ALARM = re.compile(r"\bset\b[^.!?]{0,30}\b(alarm|reminder)s?\b|\b(phone|an|your) alarm\b(?!\s+clock)"
                    r"|\b(alarm|reminder) (for|at|on your phone)\b", re.I)
_SHOP = re.compile(
    r"\b(buy|buying|bought|purchase|purchasing|shop(?:ping)? for|stock up|add (?:it )?to (?:your )?cart"
    r"|order (?:a|an|some|one|it|more)|pick(?:ing)? up\b(?! (?:your|the) (?:phone|pace|speed))|grab (?:a|an|some) (?:bottle|pack|box|bag))\b"
    r"|\b(choose|pick|select|look for|find) (?:a|an|one)\b[^.!?]{0,40}\b(tablet|capsule|product|brand|bottle|"
    r"supplement|seal|formula|version|pack)\b"
    r"|\b(choose|pick|select|look for|find)\b[^.!?]{0,40}\d[\d,.]*\s*(?:mg|mcg|iu|g)\b", re.I)
_BEFOREHAND = re.compile(r"\b(the )?(night|evening|day) before\b|\bin advance\b|\bahead of time\b|\bbeforehand\b"
                         r"|\bwhen you go to bed tonight\b", re.I)
_WORKOUT = re.compile(r"\b(work ?outs?|training session|gym|post-workout|pre-workout|after (?:you )?train(?:ing)?"
                      r"|your (?:training )?session|exercise session)\b", re.I)
_CLAIM = re.compile(r"\b(maximum|maximi[sz]e[sd]?|optimal|optimi[sz]e[sd]?|boosts?|supercharge[sd]?|proven|guarantee[sd]?"
                    r"|studies show|research shows|science (?:says|shows)|works? (?:just )?as well|just as well"
                    r"|most effective|more effective|best results|ideal|perfect window)\b", re.I)
# a number of minutes stated for the WHOLE task: always the scheduled minutes
_MIN_TOTAL = re.compile(r"\b(at least|the full|a full|full|a total of|in total|all|whole)\s+(\d{1,3})(\s*|-)(minutes?|mins?)\b",
                        re.I)
_ABSOLUTE = re.compile(r",?\s*before you do anything else\b|,?\s*first thing,? before anything else\b", re.I)
_AMOUNT = re.compile(r"\b\d+(?:[.,]\d+)?\s*(ml|millilit(?:er|re)s?|lit(?:er|re)s?|l|oz|ounces|cups?)\b", re.I)
_MEAL_REF = re.compile(
    r"\b(with|after|before|at|during|alongside|over|until|till|by)\s+(your\s+|a\s+|the\s+)?"
    r"(?:(?:\d{1,2}(?::\d{2})?\s?[ap]\.?m\.?|\d{1,2}:\d{2})\s+)?(breakfast|lunch|dinner)\b", re.I)
_YOUR_MEAL = re.compile(r"\b(your)\s+(?:(?:\d{1,2}(?::\d{2})?\s?[ap]\.?m\.?|\d{1,2}:\d{2})\s+)?"
                        r"(breakfast|lunch|dinner)\b", re.I)
_MIN_RANGE = re.compile(r"\b(\d{1,3})\s*(?:–|—|-|to)\s*(\d{1,3})(\s*|-)(minutes?|mins?)\b", re.I)
_MIN_ONE = re.compile(r"\b(\d{1,3})(\s*|-)(minutes?|mins?)\b", re.I)
_PEPTIDE_DOSE = re.compile(r"\b\d+(?:\.\d+)?\s*(mg|mcg|µg|iu|units?|ml|cc)\b", re.I)
_CLINICIAN = "Check with your clinician if you take other medicines."


def _clock_tokens(s: str) -> list[str]:
    from services.ai_programs import _CLOCK
    return [m.group(0) for m in _CLOCK.finditer(s or "")]


def _clock_ok(tok: str, scheduled: str) -> bool:
    from services.ai_programs import _clock_min
    v, want = _clock_min(tok), _to_min(scheduled)
    if v is None or want is None:
        return False
    return v == want or (v + 720) % 1440 == want or (v - 720) % 1440 == want


def _unit_word(unit: str, n: int) -> str:
    u = unit.lower()
    if u.startswith("mins") or u == "min":
        return "min"
    return "minute" if n == 1 else "minutes"


def _fix_minutes(s: str, dur: int) -> str:
    """Ranges collapse to the scheduled minutes; any count above it becomes it."""
    def rng(m: re.Match) -> str:
        sep = m.group(3)
        return f"{dur}{sep}{_unit_word(m.group(4), dur) if sep != '-' else 'minute'}"

    def one(m: re.Match) -> str:
        n = int(m.group(1))
        if n <= dur:
            return m.group(0)
        sep = m.group(2)
        return f"{dur}{sep}{_unit_word(m.group(3), dur) if sep != '-' else 'minute'}"
    s = _MIN_RANGE.sub(rng, s)
    s = _MIN_TOTAL.sub(lambda m: f"{m.group(1)} {dur}{m.group(3)}"
                       f"{_unit_word(m.group(4), dur) if m.group(3) != '-' else 'minute'}", s)
    return _MIN_ONE.sub(one, s)


def minute_mentions(text_: str) -> list[int]:
    """Minute counts in a text; a range counts once, by its top."""
    t = text_ or ""
    out = [int(m.group(2)) for m in _MIN_RANGE.finditer(t)]
    return out + [int(m.group(1)) for m in _MIN_ONE.finditer(_MIN_RANGE.sub(" ", t))]


def minutes_ok(texts: list[str], dur: int) -> bool:
    """No count above the scheduled minutes, and the smaller ones (sub-steps) add up to at most it."""
    nums = [n for t in texts for n in minute_mentions(t)]
    if any(n > dur for n in nums):
        return False
    return sum(n for n in nums if n != dur) <= dur


def _fix_meal(s: str, inp: dict) -> str:
    at = inp.get("meal_at_time") or ""

    def sub(m: re.Match) -> str:
        if m.group(3).lower() == at:
            return re.sub(r"\s(?:\d{1,2}(?::\d{2})?\s?[ap]\.?m\.?|\d{1,2}:\d{2})\s", " ", m.group(0), flags=re.I)
        return f"{m.group(1)} your {at}" if at else f"{m.group(1)} a meal"

    def sub_your(m: re.Match) -> str:
        if m.group(2).lower() == at:
            return f"{m.group(1)} {m.group(2)}"
        return f"{m.group(1)} {at}" if at else f"{m.group(1)} meal"
    return _YOUR_MEAL.sub(sub_your, _MEAL_REF.sub(sub, s))


def _lib_dose_numbers(inp: dict) -> set[float]:
    from services.habit_library import dose_numbers
    nums: set[float] = set()
    for e in inp.get("libs") or []:
        nums |= dose_numbers(" ".join(str(e.get(k) or "") for k in ("dose note", "how", "timing")))
    return nums


def _sentences(t: str) -> list[str]:
    t = re.sub(r"\s+", " ", t or "").strip()
    return [x for x in re.split(r"(?<=[.!?])\s+(?=[A-Z0-9\"'(])", t) if x.strip()]


def clean_text(t: str, inp: dict, *, minutes: bool = True) -> str:
    """Drop sentences that break a rule; fix the ones that can be fixed.
    `minutes=False` for why_it_matters: "7 min faster" there is a library fact,
    not how long the task takes."""
    from services.ai_programs import _fix_clock
    from services.habit_library import dose_numbers, mentions_dose
    lib_nums = _lib_dose_numbers(inp)
    scheduled = inp.get("time") or ""
    setup = inp.get("kind") == "setup"
    keep: list[str] = []
    for s in _sentences(t):
        if _ALARM.search(s) or _SHOP.search(s):
            continue
        if not setup and _BEFOREHAND.search(s):
            continue
        if not inp["anchors"].get("has_workout") and _WORKOUT.search(s):
            continue
        if _CLAIM.search(s):
            continue
        if inp.get("is_peptide") and _PEPTIDE_DOSE.search(s):
            continue
        if mentions_dose(s) and inp.get("is_supp") and not dose_numbers(s) <= lib_nums:
            continue
        if _AMOUNT.search(s) and not any(_AMOUNT.search(str(e.get("how") or "")) for e in inp.get("libs") or []):
            # "Drink the entire 500ml of water" -> "Drink water": no invented amounts
            s = re.sub(r"(?:\b(?:the |a )?(?:entire|full|whole) )?" + _AMOUNT.pattern + r"(?:\s+of)?\s*", "", s, flags=re.I)
            s = re.sub(r"\b(drink|fill|pour|finish)\s+(glass|bottle)\b", r"\1 a \2", s, flags=re.I)
        s = _ABSOLUTE.sub("", s)
        s = _fix_meal(s, inp)
        s = _fix_clock(s, {scheduled} if scheduled else set())
        if any(not _clock_ok(tok, scheduled) for tok in _clock_tokens(s)):
            continue
        if minutes:
            s = _fix_minutes(s, inp["duration"])
        s = re.sub(r"\s{2,}", " ", s).strip()
        if len(re.sub(r"[^A-Za-z]", "", s)) >= 3:
            keep.append(s[0].upper() + s[1:])
    return " ".join(keep).strip()


def _caution(libs: list[dict]) -> str:
    """One short caution from the library: a 'do not' in timing, else the avoid-if list."""
    for e in libs:
        for sent in _sentences(str(e.get("timing") or "")):
            if re.search(r"\b(do not|don't|never|not close|avoid)\b", sent, re.I):
                return sent.rstrip(".") + "."
    for e in libs:
        avoid = [x.strip() for x in str(e.get("avoid if") or "").split(",") if x.strip() and x.strip().lower() != "none"]
        if avoid:
            items = avoid[:4]
            listed = ", ".join(items[:-1]) + (" or " if len(items) > 1 else "") + items[-1]
            return f"Skip it if this applies to you: {listed}."
    return ""


def _first_sentence(t: str) -> str:
    s = _sentences(t)
    return s[0] if s else ""


def postprocess(guide: dict, inp: dict) -> dict:
    """Apply every rule deterministically; the scheduled duration always wins."""
    dur = inp["duration"]
    steps_in = [s for s in (guide.get("steps") or []) if isinstance(s, dict)]
    steps: list[dict] = []
    for s in steps_in:
        body = clean_text(str(s.get("body") or ""), inp)
        if not body:
            continue
        title = clean_text(str(s.get("title") or ""), inp) or "Do it now"
        tip = clean_text(str(s.get("tip") or ""), inp) or None
        steps.append({"title": title[:60], "body": body, "tip": tip})
    steps = steps[: max(1, min(5, dur))]

    # minutes: smaller counts (sub-steps) must add up to at most the scheduled minutes
    texts = [x for st in steps for x in (st["title"], st["body"], st["tip"] or "")]
    if not minutes_ok(texts, dur):
        def vague(m: re.Match) -> str:
            n = int(m.group(1))
            return m.group(0) if n == dur else "a few minutes" if m.group(2) != "-" else "short"
        for st in steps:
            for k in ("title", "body", "tip"):
                if st.get(k):
                    st[k] = _MIN_ONE.sub(vague, st[k])

    out: dict[str, Any] = {
        "overview": clean_text(str(guide.get("overview") or ""), inp) or inp["title"],
        "steps": steps,
        "duration_minutes": dur,                      # the scheduled minutes, never the model's
        "why_it_matters": _first_sentence(clean_text(str(guide.get("why_it_matters") or ""), inp, minutes=False))
        or _first_sentence(str((inp["libs"][0] if inp["libs"] else {}).get("why") or "")),
        "kind": inp["kind"],
        "scheduled_time": inp["time"] or None,
        "safety": [],
    }
    if guide.get("degraded"):
        out["degraded"] = True
        out["degraded_at"] = guide.get("degraded_at") or time.time()

    if inp.get("is_supp") and steps:
        all_text = " ".join(f"{st['body']} {st['tip'] or ''}" for st in steps)
        if not re.search(r"serving on (?:your|the) label", all_text, re.I):
            steps[0]["body"] = f"{steps[0]['body'].rstrip('.')}. Take the serving on your label."
        caution = _caution(inp["libs"])
        safety = [c for c in (caution, _CLINICIAN) if c]
        out["safety"] = safety
        last = steps[-1]
        if not re.search(r"\bclinician|doctor|pharmacist\b", all_text, re.I) or (caution and caution not in all_text):
            last["tip"] = " ".join(safety)
    for i, st in enumerate(steps, 1):
        st["n"] = i
        st["ingredients"] = []
        st["gear"] = []
    return out


def _library_steps(inp: dict) -> list[dict]:
    how = " ".join(str(e.get("how") or "") for e in inp["libs"]) or inp["description"]
    parts = [p.strip() for p in re.split(r"\s*\d\)\s*", how) if p.strip()]
    return [{"title": _first_sentence(p).split(",")[0].rstrip(".")[:40] or inp["title"], "body": p, "tip": None}
            for p in parts] or [{"title": inp["title"], "body": inp["description"] or inp["title"], "tip": None}]


def _library_guide(inp: dict) -> dict:
    """A rule (or a failed LLM call): straight from the library text."""
    lib = inp["libs"][0] if inp["libs"] else {}
    if inp["kind"] == "rule":
        body = inp["description"] or str(lib.get("how") or "") or inp["title"]
        steps = [{"title": inp["title"], "body": body, "tip": None}]
    else:
        steps = _library_steps(inp)
    return {"overview": _first_sentence(str(lib.get("why") or "")) or inp["title"],
            "steps": steps, "why_it_matters": str(lib.get("why") or "")}


def _fallback_guide(inp: dict) -> dict:
    # `degraded` + `degraded_at`: both providers failed. Built from the library
    # entry (or the plan text) and run through the same rules; the cache keeps
    # it for _DEGRADED_TTL_S only and the client refetches it on next open.
    g = _library_guide(inp)
    g["degraded"] = True
    g["degraded_at"] = time.time()
    out = postprocess(g, inp)
    if not out["steps"]:
        out["steps"] = [{"n": 1, "title": "Do it now", "body": inp["title"], "tip": None,
                         "ingredients": [], "gear": []}]
    return out


# ---------------------------------------------------------------------------
# Cache — task_guides table (created on first use via CREATE IF NOT EXISTS)
# ---------------------------------------------------------------------------

_DEGRADED_TTL_S = 60 * 60


def _degraded_expired(cached: Optional[dict]) -> bool:
    if not cached or not cached.get("degraded"):
        return False
    try:
        at = float(cached.get("degraded_at") or 0)
    except (TypeError, ValueError):
        at = 0.0
    return (time.time() - at) >= _DEGRADED_TTL_S


def _expired(cached: Optional[dict]) -> bool:
    try:
        at = float((cached or {}).get("generated_at") or 0)
    except (TypeError, ValueError):
        at = 0.0
    return (time.time() - at) >= _GUIDE_TTL_S


def _cache_usable(cached: Optional[dict]) -> bool:
    """Current payload version, inside its TTL (30 days; 1 hour for a degraded one)."""
    if not cached or cached.get("_v") != _PAYLOAD_V:
        return False
    return not _degraded_expired(cached) and not _expired(cached)


_TABLE_INIT = """
CREATE TABLE IF NOT EXISTS task_guides (
    task_key    TEXT PRIMARY KEY,
    payload     JSONB NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
"""

_TABLE_READY = False
_IN_FLIGHT: set[str] = set()
# Per-key in-process lock: concurrent opens of the SAME guide share one LLM call.
_GUIDE_LOCKS: dict[str, asyncio.Lock] = {}
_GUIDE_LOCKS_GUARD: asyncio.Lock = asyncio.Lock()


async def _get_guide_lock(task_key: str) -> asyncio.Lock:
    async with _GUIDE_LOCKS_GUARD:
        lock = _GUIDE_LOCKS.get(task_key)
        if lock is None:
            lock = asyncio.Lock()
            _GUIDE_LOCKS[task_key] = lock
        return lock


async def _ensure_table(db: AsyncSession) -> None:
    global _TABLE_READY
    if _TABLE_READY:
        return
    await db.execute(text(_TABLE_INIT))
    await db.commit()
    _TABLE_READY = True


async def _cache_get(task_key: str, db: AsyncSession) -> Optional[dict]:
    row = await db.execute(text("SELECT payload FROM task_guides WHERE task_key = :k"), {"k": task_key})
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
            VALUES (:k, CAST(:p AS jsonb))
            ON CONFLICT (task_key) DO UPDATE SET payload = CAST(:p AS jsonb), created_at = NOW()
            """
        ),
        {"k": task_key, "p": json.dumps(payload)},
    )
    await db.commit()


async def invalidate_user_guides(user_id: str, db: AsyncSession, *, commit: bool = False) -> int:
    """Delete every cached guide of this user (call after a plan rebuild or a
    day-shape write). Runs in a SAVEPOINT so a missing table never aborts the
    caller's transaction; commits only when asked. Returns rows deleted."""
    try:
        async with db.begin_nested():
            res = await db.execute(
                text("DELETE FROM task_guides WHERE task_key LIKE :p"),
                {"p": _user_prefix(str(user_id)).replace("%", r"\%").replace("_", r"\_") + "%"},
            )
        if commit:
            await db.commit()
        return int(getattr(res, "rowcount", 0) or 0)
    except Exception as e:
        logger.warning("[task_guide] invalidate_user_guides(%s) failed: %s", user_id, e)
        return 0


# ---------------------------------------------------------------------------
# Loading the person's day
# ---------------------------------------------------------------------------

async def _reset(db: AsyncSession) -> None:
    """A failed read leaves the transaction aborted; these paths only read, so roll back."""
    try:
        await db.rollback()
    except Exception:
        pass


async def _load_profile(user_id: str, db: AsyncSession) -> dict:
    try:
        from services.ai_programs import _user_state, build_profile
        _, _, state = await _user_state(str(user_id), db)
        return build_profile(state)
    except Exception as e:
        logger.debug("[task_guide] profile load failed: %s", e)
        await _reset(db)
        return {}


async def _active_days(user_id: str, db: AsyncSession) -> dict[str, list[dict]]:
    """date -> every task on that date across the person's active schedules."""
    out: dict[str, list[dict]] = {}
    try:
        rows = await db.execute(
            text("SELECT days FROM user_schedules WHERE user_id = :uid AND is_active IS TRUE"),
            {"uid": str(user_id)},
        )
        for (days,) in rows.fetchall():
            for d in days or []:
                key = str(d.get("date") or "")[:10]
                if key:
                    out.setdefault(key, []).extend(t for t in d.get("tasks") or [] if isinstance(t, dict))
    except Exception as e:
        logger.debug("[task_guide] active days load failed: %s", e)
        await _reset(db)
    return out


def _task_needs(items: list[tuple[str, dict]], habit_id: str) -> list[dict]:
    """Needs for the prompt/key: gear the habit can't use (a bottle for water on
    waking: any glass works) is left out."""
    from api.products import is_gear
    out = []
    for need, card in items:
        if not _gear_allowed(need, habit_id):
            continue
        out.append({"need": need, "label": card.get("need_label") or need, "gear": is_gear(need)})
    return out


# gear needs whose generic words ("water", "light") would match almost any step
_GEAR_WORDS = {
    "water_bottle": ("bottle",), "wake_light": ("sunrise", "wake light", "wake-up light"),
    "light_therapy": ("lamp", "light box", "light therapy"), "analog_alarm": ("alarm clock",),
    "travel_cooler": ("cooler",),
}
_NO_GEAR = {("water_bottle", "water_on_waking")}


def _gear_allowed(need: str, habit_id: str) -> bool:
    return (need, habit_id) not in _NO_GEAR


async def _task_items(user_id: str, task: dict, maxx_id: Optional[str], db: AsyncSession):
    from api.products import _context, task_products
    habit_id = str(task.get("catalog_id") or "").split(".", 1)[-1]
    words = f"{task.get('title') or ''} {task.get('description') or ''}"
    active, facts, picks = await _context(str(user_id), db)
    return task_products(active, facts, picks, maxx_id or "", habit_id, words)


# ---------------------------------------------------------------------------
# Finalisation — hero image, step images, products (per request, on a copy)
# ---------------------------------------------------------------------------

def _stamp(guide: dict, maxx_id: Optional[str]) -> None:
    from services.hero_image_service import resolve_hero_image
    guide["_v"] = _PAYLOAD_V
    guide["generated_at"] = time.time()
    guide["hero_image"] = resolve_hero_image(maxx_id)


def _with_step_images(guide: dict, image_key: str) -> dict:
    import copy as _copy
    out = _copy.deepcopy(guide)
    try:
        from services.step_image_service import resolve_step_image
        for s in (out.get("steps") or []):
            img = resolve_step_image(image_key, int(s.get("n") or 0))
            if img:
                s["image"] = img
    except Exception as e:
        logger.debug("[task_guide] step image resolve skipped: %s", e)
    return out


def strength_note(need: str, strength: Optional[str]) -> Optional[str]:
    """Product strength vs the library's range, said plainly."""
    if not strength:
        return None
    from services.habit_library import need_range, parse_strength
    rng, got = need_range(need), parse_strength(strength)
    if not rng or not got:
        return None
    inside = rng.contains(*got)
    if inside is None:
        return None
    if not inside:
        return (f"This one is {strength}, outside the usual {rng.text}: take no more than the label serving "
                f"and check with your clinician.")
    if rng.at_low_end(*got):
        return f"This one is {strength}."
    return (f"Most people start low ({rng.text}). This one is {strength}; if you want less, "
            f"use the lowest strength you can find.")


def _step_text(s: dict) -> str:
    return f"{s.get('title', '')} {s.get('body', '')}".lower()


def attach_products(guide: dict, items: list[tuple[str, dict]], habit_id: str) -> None:
    """The Products tab's pick for each need, on the step that uses it.
    Consumables -> step['ingredients'] ("What you'll use"; unmatched ones go on
    the first step). Gear -> step['gear'], only on a step that names it, never
    for water on waking."""
    from api.products import NEED_WORDS, _SKIN_STEPS, is_gear
    steps = guide.get("steps") or []
    for s in steps:
        s["ingredients"] = []
        s["gear"] = []
    if not steps:
        guide["ingredients"], guide["gear"], guide["products"] = [], [], []
        return
    for need, card in items:
        if not _gear_allowed(need, habit_id):
            continue
        gear = is_gear(need)
        note = None if gear else strength_note(need, card.get("strength"))
        entry = {"name": card["name"], "generic_name": card.get("need_label") or need, "brand": card.get("brand"),
                 "note": card.get("need_label") or need, "url": card.get("url"), "image": card.get("image"),
                 "asin": card.get("asin"), "price_usd": card.get("price_usd"), "rating": card.get("rating"),
                 "need": need, "need_label": card.get("need_label") or need,
                 "strength": card.get("strength") or None, "strength_note": note, "gear": gear}
        words = _GEAR_WORDS.get(need) if gear else None
        words = words or NEED_WORDS.get(need, ())
        pats = [p for p, n in _SKIN_STEPS if n == need]
        home = next((s for s in steps if any(w in _step_text(s) for w in words)
                     or any(re.search(p, _step_text(s)) for p in pats)), None)
        if gear:
            if home is None:
                continue          # the task doesn't use it: no gear card
            home["gear"].append(entry)
        else:
            home = home or steps[0]
            home["ingredients"].append(entry)
            if note and note not in home.get("body", ""):
                home["body"] = f"{home['body'].rstrip()} {note}".strip()
    guide["ingredients"] = [e for s in steps for e in s["ingredients"]]
    guide["gear"] = [e for s in steps for e in s["gear"]]
    guide["products"] = guide["ingredients"] + guide["gear"]


# ---------------------------------------------------------------------------
# Pre-generation — BackgroundTask after schedule create/adapt
# ---------------------------------------------------------------------------

async def pregenerate_for_schedule(schedule_id: str, user_id: str, *, days_ahead: int = 7) -> None:
    """Warm the cache for the next `days_ahead` days of this schedule, under the
    SAME per-user, per-instance keys `get_task_guide` reads. Own DB session (safe
    after the request closed); DB work is sequential, LLM calls run 3 at a time."""
    try:
        from db import AsyncSessionLocal
        async with AsyncSessionLocal() as db:
            await _ensure_table(db)
            row = await db.execute(
                text("SELECT days, maxx_id FROM user_schedules WHERE id = :sid AND user_id = :uid"),
                {"sid": schedule_id, "uid": user_id},
            )
            sched = row.fetchone()
            if not sched:
                return
            days, maxx_id = sched[0] or [], sched[1]
            profile = await _load_profile(user_id, db)
            by_date = await _active_days(user_id, db)
            todo: list[tuple[str, dict]] = []
            seen: set[str] = set()
            items_cache: dict[str, list] = {}
            for day in days[:days_ahead]:
                for task in day.get("tasks") or []:
                    if not task.get("title"):
                        continue
                    ik = f"{task.get('catalog_id')}|{task.get('description')}"
                    if ik not in items_cache:
                        try:
                            items_cache[ik] = await _task_items(user_id, task, maxx_id, db)
                        except Exception:
                            items_cache[ik] = []
                    inp = build_inputs(user_id=user_id, maxx_id=maxx_id, task=task, days=days, profile=profile,
                                       day_tasks=by_date.get(str(day.get("date") or "")[:10], []),
                                       needs=_task_needs(items_cache[ik], str(task.get("catalog_id") or "").split(".", 1)[-1]))
                    if inp["kind"] == "rule":
                        continue
                    key = guide_key(inp)
                    if key in seen or key in _IN_FLIGHT:
                        continue
                    seen.add(key)
                    if _cache_usable(await _cache_get(key, db)):
                        continue
                    todo.append((key, inp))
            if not todo:
                return
            await release_conn(db)
            logger.info("[task_guide] pre-generating %d guides for schedule %s", len(todo), schedule_id)
            sem = asyncio.Semaphore(3)

            async def _gen(key: str, inp: dict) -> Optional[dict]:
                _IN_FLIGHT.add(key)
                try:
                    async with sem:
                        g = await _generate_guide(inp)
                    _stamp(g, maxx_id)
                    return g
                except Exception as e:
                    logger.warning("[task_guide] pregenerate failed for %s: %s", key, e)
                    return None

            try:
                done = await asyncio.gather(*[_gen(k, i) for k, i in todo])
                for (key, _), g in zip(todo, done):
                    if g is not None:
                        await _cache_set(key, g, db)
            finally:
                for key, _ in todo:
                    _IN_FLIGHT.discard(key)
    except Exception as e:
        logger.warning("[task_guide] pregenerate_for_schedule(%s) failed: %s", schedule_id, e)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def get_task_guide(schedule_id: str, task_id: str, user_id: str, db: AsyncSession) -> dict:
    """The guide for one scheduled task instance (see module docstring)."""
    try:
        from uuid import UUID as _UUID
        _UUID(str(schedule_id))
    except (ValueError, TypeError):
        return _error_guide("Schedule not found")

    await _ensure_table(db)
    row = await db.execute(
        text("SELECT days, maxx_id FROM user_schedules WHERE id = :sid AND user_id = :uid"),
        {"sid": schedule_id, "uid": user_id},
    )
    sched = row.fetchone()
    if not sched:
        return _error_guide("Schedule not found")

    days, maxx_id = sched[0] or [], sched[1]
    task: Optional[dict] = None
    day: dict = {}
    for d in days:
        for t in d.get("tasks", []):
            if str(t.get("task_id")) == str(task_id):
                task, day = t, d
                break
        if task:
            break
    if not task:
        return _error_guide("Task not found")

    habit_id = str(task.get("catalog_id") or "").split(".", 1)[-1]
    profile = await _load_profile(user_id, db)
    by_date = await _active_days(user_id, db)
    try:
        items = await _task_items(user_id, task, maxx_id, db)
    except Exception as e:  # products are a bonus; the guide still works
        logger.warning("[task_guide] routine products failed: %s", e)
        await _reset(db)
        items = []
    inp = build_inputs(user_id=user_id, maxx_id=maxx_id, task=task, days=days, profile=profile,
                       day_tasks=by_date.get(str(day.get("date") or "")[:10], []),
                       needs=_task_needs(items, habit_id))
    title = inp["title"]

    if inp["kind"] == "rule":
        # Rules aren't tasks (C1); if an old row still asks, answer from the library.
        guide = await _generate_guide(inp)
        _stamp(guide, maxx_id)
        task_key = ""
    else:
        task_key = guide_key(inp)
        cached = await _cache_get(task_key, db)
        if _cache_usable(cached):
            guide = cached
        else:
            # Hand the connection back before waiting on / running the LLM call.
            await release_conn(db)
            lock = await _get_guide_lock(task_key)
            async with lock:
                cached = await _cache_get(task_key, db)
                if _cache_usable(cached):
                    guide = cached
                else:
                    await release_conn(db)
                    guide = await _generate_guide(inp)
                    _stamp(guide, maxx_id)
                    await _cache_set(task_key, guide, db)

    out = _with_step_images(guide, inp["image_key"])
    out["duration_minutes"] = inp["duration"]
    try:
        attach_products(out, items, habit_id)
    except Exception as e:
        logger.warning("[task_guide] attach products failed: %s", e)
    return {"task_key": task_key, "title": title, **out}


def _error_guide(msg: str) -> dict:
    # Returned with HTTP 200; `unavailable` tells the client this placeholder
    # from a real guide. Never written to the server cache (no task_key).
    return {
        "task_key": "",
        "title": "Task",
        "overview": msg,
        "hero_image": "",
        "steps": [{"n": 1, "title": "Unavailable", "body": msg, "tip": None, "ingredients": [], "gear": []}],
        "products": [],
        "ingredients": [],
        "gear": [],
        "duration_minutes": 5,
        "why_it_matters": "",
        "unavailable": True,
        "error": msg,
        "_v": _PAYLOAD_V,
    }
