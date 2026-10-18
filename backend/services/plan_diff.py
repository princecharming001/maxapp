"""What actually changed in someone's plans this turn, in plain words.

Beta-1: the coach said "moved your workout to evening" (there was no
workout), "plan paused" (nothing was paused), "retimed your active
schedules" (nothing was retimed), and "removed the alcohol buffer" without
saying what changed. Replies were written from the request, never from the
plan.

So every chat turn is bracketed: a snapshot of all active AI plans before,
one after, and the difference is the only thing a reply may claim. A reply
that claims a change when nothing changed is replaced (`guard_reply`).
"""
from __future__ import annotations

import re
from typing import Any, Optional

WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


def _pretty(hm: str) -> str:
    m = re.match(r"^(\d{1,2}):(\d{2})", str(hm or ""))
    if not m:
        return ""
    h, mi = int(m.group(1)), int(m.group(2))
    suf = "AM" if h < 12 else "PM"
    h12 = h % 12 or 12
    return f"{h12}:{mi:02d} {suf}"


def _days_label(days: list[str]) -> str:
    ds = [d for d in WEEKDAYS if d in (days or [])]
    if len(ds) == 7:
        return "daily"
    if ds == WEEKDAYS[:5]:
        return "weekdays"
    if ds == ["sat", "sun"]:
        return "weekends"
    return ", ".join(d.capitalize() for d in ds)


async def snapshot(user_id: str, db) -> dict[str, dict[str, dict]]:
    """{maxx_id: {habit_id: {title, time, weekend_time, minutes, days, kind}}}
    for every active AI program plan."""
    from uuid import UUID
    from sqlalchemy import select
    from models.sqlalchemy_models import UserSchedule
    from services.ai_programs import is_ai_program

    out: dict[str, dict[str, dict]] = {}
    try:
        res = await db.execute(select(UserSchedule).where(
            (UserSchedule.user_id == UUID(str(user_id))) & (UserSchedule.is_active.is_(True))))
        for s in res.scalars().all():
            if not is_ai_program(s.maxx_id):
                continue
            plan = (s.schedule_context or {}).get("ai_plan") or {}
            hs = {}
            for h in plan.get("habits") or []:
                if not isinstance(h, dict) or not h.get("habit_id"):
                    continue
                hs[h["habit_id"]] = {
                    "title": str(h.get("title") or h["habit_id"]),
                    "time": str(h.get("time") or ""),
                    "weekend_time": str(h.get("weekend_time") or ""),
                    "minutes": int(h.get("minutes") or 0),
                    "days": list(h.get("days") or []),
                    "kind": str(h.get("kind") or ""),
                }
            out[s.maxx_id] = hs
    except Exception:  # noqa: BLE001  a failed snapshot must never break a chat turn
        return {}
    return out


def diff(before: dict, after: dict) -> list[dict]:
    """Changes between two snapshots: added, removed, moved, resized, days,
    program_added, program_removed."""
    out: list[dict] = []
    for mid in sorted(set(before) | set(after)):
        b, a = before.get(mid), after.get(mid)
        if b is None:
            out.append({"type": "program_added", "program": mid, "habits": a})
            continue
        if a is None:
            out.append({"type": "program_removed", "program": mid})
            continue
        for hid in sorted(set(b) | set(a)):
            hb, ha = b.get(hid), a.get(hid)
            if hb is None:
                out.append({"type": "added", "program": mid, "habit": hid, "after": ha})
            elif ha is None:
                out.append({"type": "removed", "program": mid, "habit": hid, "before": hb})
            else:
                if hb["time"] != ha["time"] or hb["weekend_time"] != ha["weekend_time"]:
                    out.append({"type": "moved", "program": mid, "habit": hid, "before": hb, "after": ha})
                if hb["minutes"] != ha["minutes"] and ha.get("kind") != "rule":
                    out.append({"type": "resized", "program": mid, "habit": hid, "before": hb, "after": ha})
                if set(hb["days"]) != set(ha["days"]):
                    out.append({"type": "days", "program": mid, "habit": hid, "before": hb, "after": ha})
    return out


def describe(changes: list[dict], *, limit: int = 8) -> str:
    """Plain sentences for the changes, nothing else."""
    from services.ai_programs import program_label

    lines: list[str] = []
    for c in changes:
        t = c["type"]
        if t == "program_added":
            lines.append(f"started {program_label(c['program'])}")
            continue
        if t == "program_removed":
            lines.append(f"stopped {program_label(c['program'])}")
            continue
        h = c.get("after") or c.get("before") or {}
        name = h.get("title") or c.get("habit")
        if t == "added":
            when = _pretty(h.get("time"))
            lines.append(f"added {name}" + (f" at {when}" if when else "") +
                         (f" ({_days_label(h.get('days'))})" if _days_label(h.get("days")) not in ("", "daily") else ""))
        elif t == "removed":
            lines.append(f"removed {name}")
        elif t == "moved":
            b, a = c["before"], c["after"]
            if b["time"] != a["time"]:
                lines.append(f"moved {name} from {_pretty(b['time'])} to {_pretty(a['time'])}")
            else:
                lines.append(f"moved {name} on weekends to {_pretty(a['weekend_time'] or a['time'])}")
        elif t == "resized":
            lines.append(f"{'shortened' if c['after']['minutes'] < c['before']['minutes'] else 'lengthened'} "
                         f"{name} from {c['before']['minutes']} to {c['after']['minutes']} min")
        elif t == "days":
            lines.append(f"{name} now runs {_days_label(c['after']['days']) or 'on no days'}")
    if not lines:
        return ""
    more = len(lines) - limit
    lines = lines[:limit]
    text = "; ".join(lines)
    if more > 0:
        text += f"; and {more} more"
    return text[0].upper() + text[1:] + "."


# a reply that says something in the plan changed ("creatine can be added to
# coffee" is not a claim; "moved your d3 to lunch" is)
_VERB = (r"(moved|retimed|rescheduled|updated|changed|paused|removed|dropped|added|swapped|shifted|"
         r"cleared|took out|taken out|pushed|pulled|cut|trimmed|simplified)")
_PLAN_WORD = (r"(plan|schedule|routine|task|habit|reminder|workout|session|wake|bed|morning|evening|night|"
              r"lunch|breakfast|dinner|\d{1,2}(?::\d{2})?\s?(?:am|pm)|\d{1,2}:\d{2})")
_CLAIM = re.compile(
    rf"\b{_VERB}\b[^.!?\n]{{0,60}}\b{_PLAN_WORD}|\b(?:your|the) {_PLAN_WORD}[^.!?\n]{{0,40}}\b(?:is|are) now\b|"
    r"\bplan paused\b|\blocked in\b|\bnow sits?\b|\bretimed\b", re.I)


def claims_change(text: str) -> bool:
    return bool(_CLAIM.search(text or ""))


def guard_reply(reply: str, changes: list[dict], *, day_shape_changed: bool = False) -> str:
    """The reply, made honest: a change claim with no change behind it is
    replaced; real changes are always listed."""
    # a new program's plan card already shows its habits; what's worth saying
    # is what that did to the programs they already had (a shortened habit)
    started = {c["program"] for c in changes if c["type"] == "program_added"}
    changes = [c for c in changes if c["type"] != "program_added" and c["program"] not in started]
    if started and not changes:
        return reply
    summary = describe(changes)
    if not changes and not day_shape_changed and claims_change(reply):
        return ("nothing in your plan changed this time. tell me exactly which habit and what to change "
                "(for example \"move vitamin d3 to 1 pm\"), and i'll do it and show you the before and after.")
    if changes and summary and summary.lower().rstrip(".") not in (reply or "").lower():
        return f"{(reply or '').rstrip()}\n\nwhat changed: {summary}"
    return reply
