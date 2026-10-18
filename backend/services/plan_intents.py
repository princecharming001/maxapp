"""Plan requests the coach must answer truthfully before any model sees them.

Beta-1: "pause my plan" got "plan paused" (there is no pause), a flight got
two tasks moved to the same time and a protein list, "simplify everything,
I have 15 minutes" got one line and no change, and "swap my 6am workout"
was answered as if a workout existed.

  * pause / away / trek            → say plainly it can't pause; nothing moves
  * flight / trip / time zone      → say what it can do (retime to wake/bed there)
  * "only N minutes" / simplify    → set the daily minutes, refit every program
  * a named habit that isn't in any plan → say so and list what is there
"""
from __future__ import annotations

import re
from typing import Optional

_PAUSE = re.compile(r"\b(pause|freeze|put (?:my |the )?plan on hold|on hold|vacation mode|take a break from|"
                    r"no (?:phone )?signal|trek|hike for \d|camping|away for \d|off the grid)\b", re.I)
_TRAVEL = re.compile(r"\b(flight|flying|fly (?:to|from|tomorrow|tonight)|jet ?lag|time ?zone|layover|"
                     r"travel(?:l?ing)? (?:to|tomorrow)|landing)\b", re.I)
_MINUTES = re.compile(r"\b(?:only (?:have|got) |just |about |)(\d{1,3})\s*(?:min|mins|minutes)\b"
                      r"(?:\s*(?:a|per|each)\s*day)?", re.I)
_SIMPLIFY = re.compile(r"\b(simplify|simpler|less stuff|too much|overwhelm|cut (?:it|everything) down|"
                       r"fewer (?:tasks|habits))\b", re.I)
_REQUEST = re.compile(r"\b(remove|drop|delete|get rid of|move|swap|shift|change|reschedule|skip|replace)\b\s+"
                      r"(?:my |the |your |that |this )?(.+?)(?=\s+(?:to|for|into|at|from|on|in|and|so|"
                      r"because|with)\b|[.?!,]|$)", re.I)
_TIMEWORD = re.compile(r"\b\d{1,2}(?::\d{2})?\s?(?:am|pm)?\b|\b(?:morning|evening|night|today|tomorrow|"
                       r"everything|it|them|things|stuff|plan|schedule|routine|day|week|time|timing)\b", re.I)
_WORKOUT = re.compile(r"\b(workout|work-out|training|gym|lift(?:ing)?|run|session|cardio|exercise)s?\b", re.I)
_STOP = {"my", "the", "a", "an", "your", "of", "for", "with", "and", "or", "to", "habit", "task", "reminder",
         "all", "any", "some", "please", "post", "pre", "time", "timing", "times", "one", "thing", "bit"}
# words people use for what the plan calls something else
_SYN = {"skincare": "skin", "spf": "sunscreen", "sunscreen": "skin", "coffee": "caffeine", "caffeine": "coffee",
        "booze": "alcohol", "drinking": "alcohol", "phone": "screens", "screen": "screens", "bed": "wind",
        "supplement": "supp", "supplements": "supp", "vitamin": "vitamin", "d3": "vitamin", "meds": "supp"}


def _tokens(s: str) -> set[str]:
    words = re.findall(r"[a-z0-9]+", (s or "").lower())
    out = set()
    for w in words:
        if w in _STOP or (len(w) < 3 and not re.fullmatch(r"[a-z]\d", w)):
            continue
        out.add(w[:4])
        if w in _SYN:
            out.add(_SYN[w][:4])
    return out


def plan_items(snapshot: dict) -> list[dict]:
    """[{program, habit, title, kind}] across the snapshot."""
    out = []
    for mid, hs in (snapshot or {}).items():
        for hid, h in hs.items():
            out.append({"program": mid, "habit": hid, "title": h.get("title") or hid, "kind": h.get("kind") or ""})
    return out


def _has_workout(items: list[dict]) -> bool:
    from services.ai_fit import WORKOUT
    return any(i["habit"] in WORKOUT or i["program"] in ("trainmax", "fitmax") and i["kind"] != "rule"
               for i in items)


def resolve_target(request: str, items: list[dict]) -> tuple[Optional[str], list[dict]]:
    """(the thing the request names, the plan items that match it). The name
    is None when the request names nothing specific ("simplify my plan")."""
    m = _REQUEST.search(request or "")
    if not m:
        return None, []
    phrase = _TIMEWORD.sub(" ", m.group(2)).strip()
    phrase = re.sub(r"\s{2,}", " ", phrase)
    if not phrase or not _tokens(phrase):
        return None, []
    if _WORKOUT.search(phrase):
        # "post-workout electrolytes" is not a workout
        hits = [i for i in items if i["program"] in ("trainmax", "fitmax") or _WORKOUT.match(i["title"])]
        return phrase, hits if _has_workout(items) else []
    want = _tokens(phrase)
    hits = []
    for i in items:
        have = _tokens(i["title"]) | _tokens(i["habit"].replace("_", " "))
        if i["program"] == "suppmax":
            have.add("supp")
        if i["program"] == "skinhairmax":
            have.add("skin")
        if want & have:
            hits.append(i)
    return phrase, hits


def _list(items: list[dict], limit: int = 8) -> str:
    names = [i["title"] for i in items if i["kind"] != "rule"][:limit]
    return ", ".join(n.lower() for n in names)


async def handle(user_id: str, message: str, db) -> Optional[str]:
    """A truthful reply for a plan request, or None to let the turn run."""
    from services import plan_diff
    msg = (message or "").strip()
    if not msg or len(msg) > 400:
        return None
    snap = await plan_diff.snapshot(user_id, db)
    items = plan_items(snap)
    if not items:
        return None

    if _PAUSE.search(msg):
        return ("i can't pause a plan yet, so your habits will still show on home while you're away. "
                "skipping them is fine and won't undo anything. when you're back, tell me if your wake or bed "
                "time changed and i'll retime everything. if you'd rather not see them at all, you can stop a "
                "program in explore and start it again later.")

    if _TRAVEL.search(msg) and not _MINUTES.search(msg):
        return ("i can't plan around a flight or a time-zone change yet, so i haven't moved anything. "
                "once you land, tell me your wake and bed times there (for example \"i'm waking at 7 now\") and "
                "i'll retime every habit to them. until then, follow the plan on your phone's clock or skip "
                "what doesn't fit.")

    mm = _MINUTES.search(msg)
    if mm and (_SIMPLIFY.search(msg) or re.search(r"\b(only|just|a day|per day|each day)\b", msg, re.I)):
        n = max(5, min(120, int(mm.group(1))))
        from uuid import UUID
        from models.sqlalchemy_models import User
        from services import day_shape
        user = await db.get(User, UUID(user_id))
        await day_shape.write(user, db, {"daily_minutes": n}, source="chat_minutes")
        await db.commit()
        return (f"set your day to about {n} minutes across all your programs. 1-minute reminders and rules "
                f"don't count toward it.")

    phrase, hits = resolve_target(msg, items)
    if phrase and not hits:
        what = "a workout" if _WORKOUT.search(phrase) else f"\"{phrase}\""
        return (f"i don't see {what} in your plan, so i haven't changed anything. what's in it now: "
                f"{_list(items)}. tell me which of those to change.")
    return None
