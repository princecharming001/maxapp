"""Build one user's notification_engine.EngineInput from the database.

The only impure part of push engine v3. Everything here is a READ; the engine
decides and the scheduler writes. Task times come from the master view — the
exact times the app shows, after the cross-program collision pass — while task
STATUSES come from the rows loaded this tick, so a task completed a second ago
is never pushed. The master view is cached per user and recomputed when any
active schedule row changes (or after a few minutes, for calendar edits).
"""

from __future__ import annotations

import logging
import time as _time
from datetime import date, datetime, timedelta
from typing import Any, Optional
from zoneinfo import ZoneInfo

from sqlalchemy import func, select

from services import notification_engine as ne
import services.notification_state as ns

logger = logging.getLogger(__name__)

_PLAN_TTL_S = 10 * 60
_PROGRESS_TTL_S = 30 * 60
_plan_cache: dict[str, tuple[tuple, float, list[dict]]] = {}
_progress_cache: dict[str, tuple[str, float, ne.ProgressView]] = {}


def reset_caches() -> None:
    _plan_cache.clear()
    _progress_cache.clear()


def parse_hhmm(raw: Any) -> Optional[int]:
    """'07:30' / '7:30 PM' / '23.15' → minute of day, else None."""
    if raw is None:
        return None
    s = str(raw).strip().upper()
    if not s:
        return None
    try:
        if s.endswith("AM") or s.endswith("PM"):
            t = datetime.strptime(s.replace(" ", ""), "%I:%M%p").time()
            return t.hour * 60 + t.minute
        parts = s.replace(".", ":").split(":")
        h, m = int(parts[0]), int(parts[1][:2]) if len(parts) > 1 else 0
        if 0 <= h <= 23 and 0 <= m <= 59:
            return h * 60 + m
    except (ValueError, IndexError):
        return None
    return None


def user_tz(onboarding: dict | None) -> ZoneInfo:
    try:
        return ZoneInfo(str((onboarding or {}).get("timezone") or "UTC"))
    except Exception:
        return ZoneInfo("UTC")


def wake_sleep_for(onboarding: dict | None, weekday_name: Optional[str] = None) -> tuple[int, int]:
    """(wake_min, sleep_min) for a weekday — the Planner's per-weekday override
    first (onboarding.weekly_timings[day]), then the global rhythm."""
    ob = onboarding or {}
    wake = parse_hhmm(ob.get("wake_time"))
    sleep = parse_hhmm(ob.get("sleep_time"))
    if weekday_name:
        wt = ob.get("weekly_timings")
        if isinstance(wt, dict) and isinstance(wt.get(weekday_name), dict):
            day = wt[weekday_name]
            wake = parse_hhmm(day.get("wake_time")) or wake
            sleep = parse_hhmm(day.get("sleep_time")) or sleep
    return (7 * 60 if wake is None else wake), (23 * 60 if sleep is None else sleep)


def schedule_dicts(schedules: list) -> list[dict]:
    """ORM rows → the plain dicts the streak / merge helpers take."""
    out = []
    for s in schedules or []:
        out.append({
            "id": str(getattr(s, "id", "") or ""),
            "maxx_id": getattr(s, "maxx_id", None),
            "days": list(getattr(s, "days", None) or []),
            "course_title": getattr(s, "course_title", None),
        })
    return out


def _task_key(t: dict) -> Optional[str]:
    for k in ("task_uuid", "uuid", "task_id"):
        v = t.get(k)
        if v:
            return str(v)
    return None


def _fresh_statuses(schedules: list, day_iso: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for s in schedules or []:
        for d in (getattr(s, "days", None) or []):
            if d.get("date") != day_iso:
                continue
            for t in d.get("tasks") or []:
                st = str(t.get("status") or "pending").lower()
                for k in ("task_uuid", "uuid", "task_id"):
                    if t.get(k):
                        out[str(t[k])] = st
    return out


def _fingerprint(schedules: list, day_iso: str) -> tuple:
    rows = []
    for s in schedules or []:
        ua = getattr(s, "updated_at", None)
        rows.append((str(getattr(s, "id", "")), ua.isoformat() if hasattr(ua, "isoformat") else str(ua),
                     len(getattr(s, "days", None) or [])))
    return (day_iso, tuple(sorted(rows)))


def with_v2_push_marks(state: dict, schedules: list, day_iso: str) -> dict:
    """Tasks the v2 planner already pushed today (row flag
    `notification_sent_push`) count as sent, so switching engines mid-day — the
    deploy, or a flag flip — can't push the same task twice. A view-only copy
    of the ledger; never persisted (the row flag lasts the day anyway)."""
    keys = []
    for s in schedules or []:
        for d in (getattr(s, "days", None) or []):
            if d.get("date") != day_iso:
                continue
            for t in d.get("tasks") or []:
                if t.get("notification_sent_push") is True:
                    k = _task_key(t)
                    if k:
                        keys.append(k)
    if not keys:
        return state
    st = dict(state or {})
    led = dict(st.get(ne.TASK_SENT_KEY) or {})
    day = dict(led.get(day_iso) or {})
    for k in keys:
        # not a timestamp: the gap math skips it (_ext_of_iso → None)
        day.setdefault(ne.task_ledger_key(day_iso, k), "v2")
    led[day_iso] = day
    st[ne.TASK_SENT_KEY] = led
    return st


async def displayed_tasks(db, user, schedules: list, day_iso: str) -> list[dict]:
    """Today's tasks exactly as the app shows them (master view), with FRESH
    statuses. Falls back to the stored days if the master view fails."""
    uid = str(user.id)
    fp = _fingerprint(schedules, day_iso)
    hit = _plan_cache.get(uid)
    tasks: Optional[list[dict]] = None
    if hit and hit[0] == fp and _time.monotonic() - hit[1] < _PLAN_TTL_S:
        tasks = hit[2]
    if tasks is None:
        try:
            from services.master_schedule import build_master_view

            view = await build_master_view(
                uid, db, days=1, today_iso=day_iso, actives=list(schedules), user_row=user,
            )
            tasks = [dict(t) for t in (view[0]["tasks"] if view else [])]
        except Exception as e:  # noqa: BLE001 — never lose reminders over the view
            logger.warning("notif: master view failed for %s (%s); using stored times", uid, e)
            tasks = []
            for s in schedules or []:
                for d in (getattr(s, "days", None) or []):
                    if d.get("date") == day_iso:
                        for t in d.get("tasks") or []:
                            t2 = dict(t)
                            t2.setdefault("maxx_id", getattr(s, "maxx_id", None))
                            t2.setdefault("schedule_id", str(getattr(s, "id", "")))
                            tasks.append(t2)
        _plan_cache[uid] = (fp, _time.monotonic(), tasks)
        if len(_plan_cache) > 20000:
            _plan_cache.clear()
    fresh = _fresh_statuses(schedules, day_iso)
    out = []
    for t in tasks:
        t2 = dict(t)
        k = _task_key(t2)
        if k and k in fresh:
            t2["status"] = fresh[k]
        out.append(t2)
    return out


def engine_tasks(raw: list[dict], wake_min: int, sleep_min: int) -> list[ne.EngineTask]:
    out: list[ne.EngineTask] = []
    seen: set[str] = set()
    for t in raw or []:
        tm = parse_hhmm(t.get("time"))
        if tm is None:
            continue
        title = str(t.get("title") or "").strip() or "your routine"
        key = _task_key(t) or f"{t.get('maxx_id') or ''}:{title.lower()}:{tm}"
        if key in seen:
            continue
        seen.add(key)
        try:
            dur = int(t.get("duration_min") or t.get("duration") or 5)
        except (TypeError, ValueError):
            dur = 5
        out.append(ne.EngineTask(
            key=key,
            title=title,
            at=ne.task_ext_min(tm, wake_min, sleep_min),
            status=str(t.get("status") or "pending").lower(),
            maxx=str(t.get("maxx_id") or ""),
            schedule_id=str(t["schedule_id"]) if t.get("schedule_id") else None,
            task_id=str(t["task_id"]) if t.get("task_id") else None,
            task_uuid=str(t["task_uuid"]) if t.get("task_uuid") else None,
            duration_min=max(1, min(240, dur)),
        ))
    return out


def streak_view(profile: dict, sched_dicts: list[dict], today: date) -> ne.StreakView:
    """The streak as the app will see it on next open — reconciled on a COPY
    (never written). Credits a yesterday that was completed but never synced,
    so a user who closed yesterday isn't told it 'got away'."""
    from services.schedule_master_merge import (
        DAY_CLOSE_RESOLVED_FRACTION,
        collect_merged_tasks_for_date,
        merged_day_all_completed,
    )
    from services.schedule_streak import (
        FREEZE_USED_ON_KEY,
        LAST_PERFECT_KEY,
        RESET_ON_KEY,
        STREAK_KEY,
        _credit_if_perfect_day,
        _reconcile_missed,
    )

    view = dict(profile or {})
    y = today - timedelta(days=1)
    today_iso, y_iso = today.isoformat(), y.isoformat()
    try:
        if view.get(LAST_PERFECT_KEY) not in (y_iso, today_iso) and merged_day_all_completed(sched_dicts, y_iso):
            _reconcile_missed(view, y, sched_dicts)
            _credit_if_perfect_day(view, sched_dicts, y)
        _reconcile_missed(view, today, sched_dicts)
    except Exception as e:  # noqa: BLE001
        logger.debug("notif streak view degraded: %s", e)
    current = int(view.get(STREAK_KEY) or 0)
    last = view.get(LAST_PERFECT_KEY)
    tasks = collect_merged_tasks_for_date(sched_dicts, today_iso)
    completed = sum(1 for t in tasks if t.get("status") == "completed")
    skipped = sum(1 for t in tasks if t.get("status") == "skipped")
    closed = last == today_iso or (bool(tasks) and merged_day_all_completed(sched_dicts, today_iso))
    return ne.StreakView(
        current=current,
        closed_today=bool(closed),
        needed_to_close=0 if closed else ne.needed_to_close(len(tasks), completed, skipped, DAY_CLOSE_RESOLVED_FRACTION),
        freeze_used_yesterday=view.get(FREEZE_USED_ON_KEY) == y_iso,
        fresh_start_today=view.get(RESET_ON_KEY) == today_iso,
        last_close_yesterday=last == y_iso,
    )


def week_view(sched_dicts: list[dict], today: date) -> ne.WeekView:
    from services.schedule_master_merge import collect_merged_tasks_for_date, merged_day_all_completed

    closed = active = done = total = 0
    for off in range(6, -1, -1):
        d = (today - timedelta(days=off)).isoformat()
        tasks = collect_merged_tasks_for_date(sched_dicts, d)
        if not tasks:
            continue
        active += 1
        total += len(tasks)
        done += sum(1 for t in tasks if t.get("status") == "completed")
        if merged_day_all_completed(sched_dicts, d):
            closed += 1
    return ne.WeekView(closed_days=closed, active_days=active, done=done, total=total)


def journey_day(user, profile: dict, today: date, tz: ZoneInfo) -> int:
    from services.schedule_streak import JOURNEY_START_KEY

    start: Optional[date] = None
    raw = (profile or {}).get(JOURNEY_START_KEY)
    if raw:
        try:
            start = date.fromisoformat(str(raw))
        except ValueError:
            start = None
    if start is None and getattr(user, "created_at", None):
        c = user.created_at
        if c.tzinfo is None:
            c = c.replace(tzinfo=ZoneInfo("UTC"))
        start = c.astimezone(tz).date()
    if start is None or start > today:
        return 0
    return (today - start).days + 1


async def progress_view(db, user, profile: dict, today: date, tz: ZoneInfo) -> ne.ProgressView:
    uid = str(user.id)
    hit = _progress_cache.get(uid)
    if hit and hit[0] == today.isoformat() and _time.monotonic() - hit[1] < _PROGRESS_TTL_S:
        return hit[2]
    from models.sqlalchemy_models import Scan, UserProgressPhoto

    days_since_scan = days_since_photo = None
    try:
        last_scan = (await db.execute(
            select(func.max(Scan.created_at)).where(
                Scan.user_id == user.id, Scan.processing_status == "completed",
            )
        )).scalar()
        last_photo = (await db.execute(
            select(func.max(UserProgressPhoto.created_at)).where(UserProgressPhoto.user_id == user.id)
        )).scalar()
    except Exception as e:  # noqa: BLE001
        logger.debug("notif progress view degraded for %s: %s", uid, e)
        last_scan = last_photo = None

    def _days(ts) -> Optional[int]:
        if ts is None:
            return None
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=ZoneInfo("UTC"))
        return max(0, (today - ts.astimezone(tz).date()).days)

    days_since_scan, days_since_photo = _days(last_scan), _days(last_photo)
    pv = ne.ProgressView(
        journey_day=journey_day(user, profile, today, tz),
        has_scanned=days_since_scan is not None,
        days_since_scan=days_since_scan,
        # Basic plans allow one scan per 7 days (premium: daily) — a weekly
        # "your next scan is ready" fits both without nagging premium daily.
        scan_ready=bool(getattr(user, "is_paid", False)) and days_since_scan is not None and days_since_scan >= 7,
        days_since_photo=days_since_photo,
    )
    _progress_cache[uid] = (today.isoformat(), _time.monotonic(), pv)
    if len(_progress_cache) > 20000:
        _progress_cache.clear()
    return pv


def _user_why(onboarding: dict | None) -> Optional[str]:
    ob = onboarding or {}
    for k in ("why", "goal", "primary_goal", "motivation"):
        v = ob.get(k)
        if isinstance(v, str) and v.strip():
            return v.strip().rstrip(".")
    goals = ob.get("goals")
    if isinstance(goals, dict) and isinstance(goals.get("why"), str) and goals["why"].strip():
        return goals["why"].strip().rstrip(".")
    return None


async def build_engine_input(
    db,
    user,
    schedules: list,
    *,
    profile: dict,
    now_utc: datetime,
    foreground_suppress_min: int = 5,
) -> Optional[ne.EngineInput]:
    ob = dict(user.onboarding or {})
    tz = user_tz(ob)
    local_now = now_utc.astimezone(tz).replace(tzinfo=None)
    # Logical day from the global wake; then that day's own wake/sleep.
    g_wake, _ = wake_sleep_for(ob)
    logical, _ = ne.logical_day(local_now, g_wake)
    wake_min, sleep_min = wake_sleep_for(ob, logical.strftime("%A").lower())
    logical, now_ext = ne.logical_day(local_now, wake_min)
    day_iso = logical.isoformat()

    raw = await displayed_tasks(db, user, schedules, day_iso)
    tasks = engine_tasks(raw, wake_min, sleep_min)
    sd = schedule_dicts(schedules)
    state = with_v2_push_marks(ns.get_state(profile), schedules, day_iso)

    last_active = None
    la = state.get("last_active_at")
    if la:
        try:
            last_active = datetime.fromisoformat(str(la))
        except ValueError:
            last_active = None
    if last_active is not None and last_active.tzinfo is not None:
        last_active = last_active.astimezone(ZoneInfo("UTC")).replace(tzinfo=None)
    now_naive_utc = now_utc.astimezone(ZoneInfo("UTC")).replace(tzinfo=None)
    if last_active is None and getattr(user, "created_at", None):
        c = user.created_at
        last_active = c.astimezone(ZoneInfo("UTC")).replace(tzinfo=None) if c.tzinfo else c
    hours_since = None
    last_active_date = None
    if last_active is not None:
        hours_since = max(0.0, (now_naive_utc - last_active).total_seconds() / 3600.0)
        last_active_date = last_active.replace(tzinfo=ZoneInfo("UTC")).astimezone(tz).date()

    return ne.EngineInput(
        now=local_now,
        logical_date=logical,
        now_ext=now_ext,
        wake_min=wake_min,
        sleep_ext=ne.sleep_ext_min(wake_min, sleep_min),
        tasks=tasks,
        state=state,
        streak=streak_view(profile, sd, logical),
        progress=await progress_view(db, user, profile, logical, tz),
        week=week_view(sd, logical),
        hours_since_active=hours_since,
        last_active_date=last_active_date,
        foreground_recent=ns.foreground_recent(state, now_naive_utc, foreground_suppress_min),
        muted=ns.muted_categories(ob),
        name=(getattr(user, "first_name", None) or ob.get("first_name") or "").strip() or None,
        why=_user_why(ob),
        coaching_tone=getattr(user, "coaching_tone", None),
        rotation=int(state.get("seq") or len(state.get("delivered") or [])),
    )
