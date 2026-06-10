"""
Planner API - the Today Loop's server surface (one namespace, spec 4.7).

This slice: GET /planner/held-back - the suppression ledger for a given day,
across every active program. Powers the "Held back today" chip on Today: every
task the Merge dropped or deferred, with a human reason, what beat it, and when
it comes back. No silent drops anywhere.

Later slices add: /planner/today, /planner/task/{id}/done|snooze|lock,
/planner/feasibility, /planner/reviews/weekly, /planner/signals.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db import get_db
from middleware.auth_middleware import get_current_user
from models.sqlalchemy_models import User, UserSchedule

router = APIRouter(prefix="/planner", tags=["Planner"])

# User-facing reason lines per ledger reason_code (voice-guide compliant).
_REASON_LINES = {
    "duplicate": "Covered by another program today.",
    "moved_conflict": "Moved so it doesn't clash with another treatment.",
    "day_full": "Your day was full.",
    "day_full_hard": "Your day was packed. Kept the essentials.",
    "unfittable": "Could not fit this around your day.",
}


def _uid(current_user: dict) -> UUID:
    raw = current_user.get("id") or current_user.get("user_id") or current_user.get("sub")
    if raw is None:
        raise HTTPException(status_code=401, detail="No user id on token")
    try:
        return UUID(str(raw))
    except ValueError:
        raise HTTPException(status_code=401, detail="Bad user id")


def _parse_hm_minutes(s: str | None, default: int) -> int:
    try:
        h, m = str(s).strip().split(":", 1)
        return int(h) * 60 + int(m[:2])
    except (ValueError, AttributeError):
        return default


def _stated_sleep_hours(ob: dict) -> float:
    """Stated sleep duration from onboarding wake/sleep (HealthKit comes P3)."""
    wake = _parse_hm_minutes(ob.get("wake_time"), 7 * 60)
    sleep = _parse_hm_minutes(ob.get("sleep_time"), 23 * 60)
    minutes = (wake - sleep) % (24 * 60)
    return round(minutes / 60.0, 1)


def _today_read(task_count: int, held_back: list[dict], sleep_hours: float) -> dict:
    """Deterministic Whoop-style day verdict (spec 3.2/4.3). Pure function of
    stated inputs - calendar density and real sleep join in later phases.
    Icon + label + color, never color-only."""
    hard_trim = any(e.get("reason_code") == "day_full_hard" for e in held_back)
    if (sleep_hours < 6 and task_count >= 6) or hard_trim:
        return {
            "level": "red",
            "icon": "battery-half-outline",
            "color": "#C0452C",
            "line": "Heavy day. Kept it to the essentials.",
        }
    if held_back or task_count > 8 or sleep_hours < 6.5:
        return {
            "level": "yellow",
            "icon": "partly-sunny-outline",
            "color": "#B07D10",
            "line": "Lighter day. Trimmed to what matters.",
        }
    return {
        "level": "green",
        "icon": "sunny-outline",
        "color": "#3D8B4F",
        "line": "Good runway today. Full plan fits.",
    }


@router.get("/today")
async def planner_today(
    day: str | None = Query(default=None, description="ISO date; defaults to today"),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Today's merged plan + the deterministic today-read + day structure.

    Tasks come from the same master merge the schedule view uses (each task
    carries maxx_id + schedule_id so the existing complete/pending endpoints
    work unchanged). Structure rows (wake / obligations / sleep) come from
    stated onboarding. next-up selection happens client-side in device tz.
    """
    from services.master_schedule import build_master_view

    uid = _uid(current_user)
    try:
        target = date.fromisoformat(day) if day else date.today()
    except ValueError:
        raise HTTPException(status_code=422, detail="Bad date; use YYYY-MM-DD")

    window = await build_master_view(
        user_id=str(uid), db=db, days=1, today_iso=target.isoformat()
    )
    today_entry = window[0] if window else {"tasks": [], "task_count": 0}

    user = await db.get(User, uid)
    ob = dict(user.onboarding or {}) if user else {}

    # Structure rows for the quiet timeline: wake, today's obligations, sleep.
    weekday = target.strftime("%A").lower()
    structure: list[dict[str, Any]] = [
        {"time": ob.get("wake_time") or "07:00", "label": "Wake"},
    ]
    for o in ob.get("obligations") or []:
        days_list = [str(d).lower() for d in (o.get("days") or [])]
        if days_list and weekday not in days_list:
            continue
        structure.append({
            "time": o.get("start") or "09:00",
            "label": str(o.get("label") or "Busy").capitalize(),
            "end": o.get("end"),
        })
    structure.append({"time": ob.get("sleep_time") or "23:00", "label": "Sleep"})

    # Persisted suppression ledger for the day (generation-time merge).
    held_back: list[dict] = []
    res = await db.execute(
        select(UserSchedule).where(
            (UserSchedule.user_id == uid) & (UserSchedule.is_active.is_(True))
        )
    )
    for sched in res.scalars().all():
        for d in sched.days or []:
            if d.get("date") == target.isoformat():
                held_back.extend(d.get("held_back") or [])

    sleep_hours = _stated_sleep_hours(ob)
    locked_in = bool((ob.get("lock_ins") or {}).get(target.isoformat()))

    # Streak v2 state for the ring glyph + freeze-used card.
    from services.schedule_streak import streak_payload_from_profile
    profile = dict(user.profile or {}) if user else {}
    streak = streak_payload_from_profile(profile, target)

    return {
        "date": target.isoformat(),
        "tasks": today_entry.get("tasks") or [],
        "structure": structure,
        "today_read": _today_read(
            int(today_entry.get("task_count") or 0), held_back, sleep_hours
        ),
        "held_back_count": len(held_back),
        "locked_in": locked_in,
        "streak_armed_freeze": streak["armed_freezes"] > 0,
        "freeze_used_yesterday": streak["freeze_used_yesterday"],
    }


@router.post("/lock-in")
async def lock_in(
    payload: dict = Body(default={}),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Morning lock-in: the user confirmed today's plan. Idempotent."""
    uid = _uid(current_user)
    try:
        target = (
            date.fromisoformat(str(payload.get("date")))
            if payload.get("date")
            else date.today()
        )
    except ValueError:
        raise HTTPException(status_code=422, detail="Bad date; use YYYY-MM-DD")

    user = await db.get(User, uid)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    ob = dict(user.onboarding or {})
    lock_ins = dict(ob.get("lock_ins") or {})
    lock_ins[target.isoformat()] = datetime.utcnow().isoformat()
    # Keep the map small: only the last 14 days matter.
    if len(lock_ins) > 14:
        for k in sorted(lock_ins)[: len(lock_ins) - 14]:
            lock_ins.pop(k, None)
    ob["lock_ins"] = lock_ins
    user.onboarding = ob  # reassign so SQLAlchemy flushes the JSON change
    await db.commit()
    return {"locked_in": True, "date": target.isoformat()}


# Per-native-maxx placement requirements for the feasibility sim. Creator
# courses carry schedule_hints on their marketplace records instead.
_NATIVE_REQUIREMENTS: dict[str, dict[str, Any]] = {
    "skinmax": {"sessions_per_week": 7, "minutes": 12, "window": "any"},
    "fitmax": {"sessions_per_week": 4, "minutes": 45, "window": "any"},
    "hairmax": {"sessions_per_week": 7, "minutes": 10, "window": "any"},
    "heightmax": {"sessions_per_week": 7, "minutes": 15, "window": "any"},
    "bonemax": {"sessions_per_week": 7, "minutes": 10, "window": "any"},
}


def _free_minutes_intervals(
    busy: list[tuple[int, int]], wake_min: int, sleep_min: int
) -> list[tuple[int, int]]:
    """Waking day minus busy windows (same-day model, matching the validator)."""
    if sleep_min <= wake_min:
        sleep_min = 23 * 60 + 59  # overnight sleepers: treat day as wake..midnight
    free: list[tuple[int, int]] = []
    cursor = wake_min
    for s, e in sorted(busy):
        s, e = max(s, wake_min), min(e, sleep_min)
        if e <= s:
            continue
        if s > cursor:
            free.append((cursor, s))
        cursor = max(cursor, e)
    if cursor < sleep_min:
        free.append((cursor, sleep_min))
    return free


def _window_bounds(window: str) -> tuple[int, int]:
    if window == "morning":
        return (5 * 60, 12 * 60)
    if window == "evening":
        return (17 * 60, 24 * 60)
    return (0, 24 * 60)


@router.post("/feasibility")
async def feasibility(
    payload: dict = Body(...),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Schedule-fit sim (spec 3.4) - BEFORE purchase, dry-run the program's
    sessions against the user's real wake/sleep/obligations per weekday.
    Returns {verdict, fits_n_of_m, ghost_week} for the detail sheet chip +
    ghosted 7-day mini-strip. Deterministic; no LLM."""
    from services.schedule_validator import (
        _WEEKDAY_NAMES,
        _busy_intervals_from_ctx,
        _effective_day_ctx,
    )
    from api.marketplace import _SEED_COURSES
    from services.user_context_service import merged_user_state

    program_id = str(payload.get("program_id") or "").strip().lower()
    if not program_id:
        raise HTTPException(status_code=422, detail="program_id required")

    req = _NATIVE_REQUIREMENTS.get(program_id)
    if req is None:
        for c in _SEED_COURSES:
            if c["id"] == program_id:
                req = c.get("schedule_hints") or {"sessions_per_week": 3, "minutes": 20, "window": "any"}
                break
    if req is None:
        raise HTTPException(status_code=404, detail="Unknown program")

    uid = _uid(current_user)
    user = await db.get(User, uid)
    ob = dict(user.onboarding or {}) if user else {}
    state = merged_user_state(ob, None)
    g_wake = str(state.get("wake_time") or "07:00")
    g_sleep = str(state.get("sleep_time") or "23:00")
    minutes = int(req.get("minutes") or 20)
    sessions = max(1, int(req.get("sessions_per_week") or 3))
    win_lo, win_hi = _window_bounds(str(req.get("window") or "any"))

    ghost_week: list[dict[str, Any]] = []
    fittable_days = 0
    for wd in _WEEKDAY_NAMES:
        eff = _effective_day_ctx(state, wd, global_wake=g_wake, global_sleep=g_sleep)
        wake_min = _parse_hm_minutes(eff.get("wake_time"), 7 * 60)
        sleep_min = _parse_hm_minutes(eff.get("sleep_time"), 23 * 60)
        busy = _busy_intervals_from_ctx(eff)
        slots: list[str] = []
        for s, e in _free_minutes_intervals(busy, wake_min, sleep_min):
            s2, e2 = max(s, win_lo), min(e, win_hi)
            if e2 - s2 >= minutes:
                slots.append(f"{s2 // 60:02d}:{s2 % 60:02d}")
        if slots:
            fittable_days += 1
        ghost_week.append({"day": wd[:3].capitalize(), "slots": slots[:2]})

    fits = min(sessions, fittable_days)
    if fits >= sessions:
        verdict = "green"
    elif fits * 3 >= sessions * 2:  # >= 2/3 of required sessions fit
        verdict = "amber"
    else:
        verdict = "red"

    return {
        "verdict": verdict,
        "fits_n_of_m": {"fits": fits, "of": sessions},
        "minutes_per_session": minutes,
        "ghost_week": ghost_week,
    }


def _window_for_time(hhmm: str | None) -> str:
    m = _parse_hm_minutes(hhmm, 12 * 60)
    if m < 12 * 60:
        return "morning"
    if m < 17 * 60:
        return "midday"
    return "evening"


@router.get("/reviews/weekly")
async def weekly_review(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """'This week with Max' - completion framed by what got DONE, plus
    confirm-first learned facts (T1 schedule facts only in Phase 0; deeper
    inference joins with the Learner). I never change the plan without asking.
    """
    from services.schedule_master_merge import merged_day_all_completed
    from services.schedule_service import schedule_service

    uid = _uid(current_user)
    user = await db.get(User, uid)
    ob = dict(user.onboarding or {}) if user else {}
    schedules = await schedule_service.get_all_active_schedules(str(uid), db)

    today = date.today()
    days: list[dict[str, Any]] = []
    window_hits: dict[str, int] = {"morning": 0, "midday": 0, "evening": 0}
    for offset in range(6, -1, -1):
        d = today - timedelta(days=offset)
        diso = d.isoformat()
        done = 0
        total = 0
        for sched in schedules:
            for day in sched.get("days") or []:
                if day.get("date") != diso:
                    continue
                for t in day.get("tasks") or []:
                    total += 1
                    if (t.get("status") or "") == "completed":
                        done += 1
                        window_hits[_window_for_time(t.get("time"))] += 1
        days.append({
            "date": diso,
            "weekday": d.strftime("%a"),
            "closed": bool(total) and merged_day_all_completed(schedules, diso),
            "done": done,
            "total": total,
        })

    closed_count = sum(1 for d in days if d["closed"])
    active_days = sum(1 for d in days if d["total"] > 0)
    strongest = max(window_hits, key=lambda k: window_hits[k]) if any(window_hits.values()) else None

    # Confirm-first T1 facts - each one true, dated, derived from actual data.
    confirmed = set((ob.get("confirmed_facts") or {}).keys())
    facts: list[dict[str, str]] = []
    if strongest and window_hits[strongest] >= 3 and "strongest_window" not in confirmed:
        line = {
            "morning": "You show up strongest in the morning. Lean the plan that way?",
            "midday": "Midday is your window. Lean the plan that way?",
            "evening": "You show up strongest in the evening. Lean the plan that way?",
        }[strongest]
        facts.append({"id": "strongest_window", "text": line, "value": strongest})
    lock_ins = ob.get("lock_ins") or {}
    if len(lock_ins) >= 3 and "locks_in_mornings" not in confirmed:
        facts.append({
            "id": "locks_in_mornings",
            "text": "You lock in your day most mornings. Keep the morning check-in?",
            "value": "true",
        })

    return {
        "days": days,
        "closed_count": closed_count,
        "active_days": active_days,
        "strongest_window": strongest,
        "facts": facts,
    }


@router.post("/reviews/weekly")
async def confirm_weekly_facts(
    payload: dict = Body(default={}),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Store [Yep]/[Not quite] answers. Confirm-first is the ONLY way
    inference changes the plan; rejected facts are remembered so they are
    never re-asked."""
    uid = _uid(current_user)
    user = await db.get(User, uid)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    confirmations = payload.get("confirmations") or []
    if not isinstance(confirmations, list):
        raise HTTPException(status_code=422, detail="confirmations must be a list")
    ob = dict(user.onboarding or {})
    stored = dict(ob.get("confirmed_facts") or {})
    for c in confirmations:
        fid = str(c.get("id") or "").strip()
        if not fid:
            continue
        stored[fid] = {
            "accepted": bool(c.get("accepted")),
            "value": c.get("value"),
            "at": datetime.utcnow().isoformat(),
        }
    ob["confirmed_facts"] = stored
    user.onboarding = ob
    await db.commit()
    return {"stored": len(confirmations)}


@router.get("/held-back")
async def held_back(
    day: str | None = Query(default=None, description="ISO date; defaults to today"),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Everything the Merge held back on `day`, across active programs."""
    uid = _uid(current_user)
    try:
        target = date.fromisoformat(day) if day else date.today()
    except ValueError:
        raise HTTPException(status_code=422, detail="Bad date; use YYYY-MM-DD")

    res = await db.execute(
        select(UserSchedule).where(
            (UserSchedule.user_id == uid) & (UserSchedule.is_active.is_(True))
        )
    )
    items: list[dict[str, Any]] = []
    for sched in res.scalars().all():
        program = sched.maxx_id or sched.course_title or "program"
        for d in sched.days or []:
            if d.get("date") != target.isoformat():
                continue
            for entry in d.get("held_back") or []:
                deferred_to = entry.get("deferred_to")
                returns_on = None
                if isinstance(deferred_to, int):
                    # deferred_to is a day index within this schedule's window.
                    days = sched.days or []
                    if 0 <= deferred_to < len(days):
                        returns_on = days[deferred_to].get("date")
                items.append({
                    "title": entry.get("title"),
                    "program_id": entry.get("program_id") or program,
                    "reason_code": entry.get("reason_code"),
                    "reason": _REASON_LINES.get(
                        entry.get("reason_code") or "", "Held back for today."
                    ),
                    "beaten_by": entry.get("beaten_by"),
                    "returns_on": returns_on,
                    "deferral_age": entry.get("deferral_age", 1),
                })
    return {"date": target.isoformat(), "items": items}
