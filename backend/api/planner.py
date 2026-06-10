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

from datetime import date, datetime, timedelta, timezone as _utc_tz
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


def _today_read(
    task_count: int,
    held_back: list[dict],
    sleep_hours: float,
    calendar_busy_minutes: int = 0,
) -> dict:
    """Deterministic Whoop-style day verdict (spec 3.2/4.3). Pure function of
    stated sleep + task load + calendar density (real sleep joins in P3).
    Icon + label + color, never color-only."""
    hard_trim = any(e.get("reason_code") == "day_full_hard" for e in held_back)
    packed_calendar = calendar_busy_minutes >= 8 * 60
    busy_calendar = calendar_busy_minutes >= 5 * 60
    if (sleep_hours < 6 and task_count >= 6) or hard_trim or (packed_calendar and task_count >= 6):
        return {
            "level": "red",
            "icon": "battery-half-outline",
            "color": "#C0452C",
            "line": "Rough runway. Kept it to the essentials.",
        }
    if held_back or task_count > 8 or sleep_hours < 6.5 or busy_calendar:
        return {
            "level": "yellow",
            "icon": "partly-sunny-outline",
            "color": "#B07D10",
            "line": "Packed calendar. Trimmed to what matters."
            if busy_calendar
            else "Lighter day. Trimmed to what matters.",
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

    # Calendar projections for the day (spec 4.8): busy blocks the device
    # pushed via /planner/signals join the quiet timeline and the today-read.
    # They are PROJECTED here, never written into onboarding.obligations.
    from models.sqlalchemy_models import CalendarEvent
    day_start = datetime.combine(target, datetime.min.time())
    day_end = day_start + timedelta(days=1)
    cal_res = await db.execute(
        select(CalendarEvent).where(
            (CalendarEvent.user_id == uid)
            & (CalendarEvent.is_busy.is_(True))
            & (CalendarEvent.starts_at < day_end)
            & (CalendarEvent.ends_at > day_start)
        ).order_by(CalendarEvent.starts_at)
    )
    calendar_events = cal_res.scalars().all()
    calendar_busy_minutes = 0
    last_synced: datetime | None = None
    for ev in calendar_events:
        s = ev.starts_at.replace(tzinfo=None) if ev.starts_at.tzinfo else ev.starts_at
        e = ev.ends_at.replace(tzinfo=None) if ev.ends_at.tzinfo else ev.ends_at
        s, e = max(s, day_start), min(e, day_end)
        if e <= s:
            continue
        calendar_busy_minutes += int((e - s).total_seconds() // 60)
        structure.append({
            "time": f"{s.hour:02d}:{s.minute:02d}",
            "label": (ev.title or "Busy")[:40],
            "end": f"{e.hour:02d}:{e.minute:02d}",
            "source": "calendar",
        })

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
            int(today_entry.get("task_count") or 0),
            held_back,
            sleep_hours,
            calendar_busy_minutes,
        ),
        "held_back_count": len(held_back),
        "locked_in": locked_in,
        "calendar_event_count": len(calendar_events),
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


@router.get("/places")
async def list_places(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """The user's places (spec P2). Typed/address-first now; geofence-learned
    places arrive later as confirm-first suggestions."""
    from models.sqlalchemy_models import UserPlace

    uid = _uid(current_user)
    res = await db.execute(
        select(UserPlace).where(
            (UserPlace.user_id == uid) & (UserPlace.is_active.is_(True))
        ).order_by(UserPlace.created_at)
    )
    return {
        "places": [
            {
                "id": str(p.id),
                "name": p.name,
                "kind": p.kind,
                "radius_m": p.radius_m,
                "source": p.source,
            }
            for p in res.scalars().all()
        ]
    }


@router.post("/places")
async def upsert_place(
    payload: dict = Body(...),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Add or update a place. Address text only for now (Google Places
    resolution joins when location ships); nothing leaves the user's account."""
    from models.sqlalchemy_models import UserPlace

    uid = _uid(current_user)
    name = str(payload.get("name") or "").strip()[:80]
    kind = str(payload.get("kind") or "custom").strip().lower()
    if kind not in ("home", "work", "gym", "grocery", "custom"):
        kind = "custom"
    if not name:
        raise HTTPException(status_code=422, detail="name required")

    existing = (await db.execute(
        select(UserPlace).where(
            (UserPlace.user_id == uid)
            & (UserPlace.kind == kind)
            & (UserPlace.is_active.is_(True))
        )
    )).scalars().first() if kind != "custom" else None

    if existing:
        existing.name = name
        place = existing
    else:
        place = UserPlace(user_id=uid, name=name, kind=kind, source="typed")
        db.add(place)
    await db.commit()
    return {"id": str(place.id), "name": place.name, "kind": place.kind}


@router.delete("/places/{place_id}")
async def remove_place(
    place_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from models.sqlalchemy_models import UserPlace

    uid = _uid(current_user)
    try:
        pid = UUID(place_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="Bad place id")
    place = (await db.execute(
        select(UserPlace).where((UserPlace.id == pid) & (UserPlace.user_id == uid))
    )).scalars().first()
    if place is None:
        raise HTTPException(status_code=404, detail="Place not found")
    place.is_active = False
    await db.commit()
    return {"removed": True}


@router.post("/signals")
async def ingest_signals(
    payload: dict = Body(...),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Device-pushed signals (spec 4.7): calendar busy projections, geofence
    events, derived prefs. Idempotent via device_event_id. The device is the
    source of truth for calendar (EventKit on-device, v1) and location; the
    server only ever sees projections and derived values, never raw streams.
    External text is DATA, never instructions (P3) - titles are stored,
    truncated, and never fed to any LLM."""
    from models.sqlalchemy_models import (
        CalendarConnection,
        CalendarEvent,
        GeofenceEvent,
        UserLearnedPrefs,
    )

    uid = _uid(current_user)
    stored = {"calendar_events": 0, "geofence_events": 0, "derived_prefs": 0}

    # --- calendar projections: replace the window the device reports on ----
    cal = payload.get("calendar")
    if isinstance(cal, dict) and isinstance(cal.get("events"), list):
        provider = str(cal.get("provider") or "manual")[:24]
        conn = (await db.execute(
            select(CalendarConnection).where(
                (CalendarConnection.user_id == uid)
                & (CalendarConnection.provider == provider)
                & (CalendarConnection.is_active.is_(True))
            )
        )).scalars().first()
        if conn is None:
            conn = CalendarConnection(user_id=uid, provider=provider)
            db.add(conn)
            await db.flush()
        conn.last_synced_at = datetime.utcnow()

        # The device reports a window [from, to); replace events inside it so
        # deletions on the device propagate (no tombstone bookkeeping).
        win_from = payload.get("window_from") or cal.get("window_from")
        win_to = payload.get("window_to") or cal.get("window_to")
        if win_from and win_to:
            try:
                f = datetime.fromisoformat(str(win_from)).replace(tzinfo=_utc_tz.utc)
                t = datetime.fromisoformat(str(win_to)).replace(tzinfo=_utc_tz.utc)
                from sqlalchemy import delete as _delete
                await db.execute(
                    _delete(CalendarEvent).where(
                        (CalendarEvent.user_id == uid)
                        & (CalendarEvent.connection_id == conn.id)
                        & (CalendarEvent.starts_at >= f)
                        & (CalendarEvent.starts_at < t)
                    )
                )
            except ValueError:
                pass

        # WALL-CLOCK convention: calendar times are the user's local wall
        # time. Any offset is dropped and the naive wall time is stored
        # tagged as UTC so the round trip through the tz-aware column is
        # identity (the device renders in its own local time anyway).
        def _wall(s: str) -> datetime:
            dt = datetime.fromisoformat(str(s))
            return dt.replace(tzinfo=_utc_tz.utc)

        for e in cal["events"][:200]:
            try:
                starts = _wall(e["starts_at"])
                ends = _wall(e["ends_at"])
            except (KeyError, ValueError):
                continue
            db.add(CalendarEvent(
                user_id=uid,
                connection_id=conn.id,
                external_event_id=str(e.get("external_event_id") or "")[:255] or None,
                title=(str(e.get("title") or "")[:255] or None),
                starts_at=starts,
                ends_at=ends,
                all_day=bool(e.get("all_day")),
                location=(str(e.get("location") or "")[:255] or None),
                is_busy=bool(e.get("is_busy", True)),
            ))
            stored["calendar_events"] += 1

    # --- geofence events (idempotent on device_event_id) --------------------
    geo = payload.get("geofence_events")
    if isinstance(geo, list):
        for g in geo[:100]:
            dev_id = str((g or {}).get("device_event_id") or "")[:64] or None
            if dev_id:
                dup = (await db.execute(
                    select(GeofenceEvent).where(
                        (GeofenceEvent.user_id == uid)
                        & (GeofenceEvent.device_event_id == dev_id)
                    )
                )).scalars().first()
                if dup:
                    continue
            try:
                occurred = datetime.fromisoformat(str(g["occurred_at"]))
            except (KeyError, TypeError, ValueError):
                continue
            db.add(GeofenceEvent(
                user_id=uid,
                place_id=g.get("place_id"),
                event_type=str(g.get("event_type") or "enter")[:8],
                occurred_at=occurred,
                dwell_min=g.get("dwell_min"),
                device_event_id=dev_id,
            ))
            stored["geofence_events"] += 1

    # --- device-derived prefs (HealthKit derivations land here in P3) -------
    derived = payload.get("derived_prefs")
    if isinstance(derived, dict) and derived:
        prefs = (await db.execute(
            select(UserLearnedPrefs).where(UserLearnedPrefs.user_id == uid)
        )).scalars().first()
        if prefs is None:
            prefs = UserLearnedPrefs(user_id=uid)
            db.add(prefs)
        allowed = {"learned_wake", "learned_sleep", "learned_workout_window"}
        for k, v in derived.items():
            if k in allowed and isinstance(v, str) and len(v) <= 16:
                setattr(prefs, k, v)
                stored["derived_prefs"] += 1
        prefs.last_recomputed = datetime.utcnow()

    await db.commit()
    return {"stored": stored}


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
