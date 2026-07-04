"""Master schedule daily streak — all merged tasks completed by local end-of-day."""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from models.sqlalchemy_models import User
from services.schedule_master_merge import (
    collect_merged_tasks_for_date,
    merged_day_all_completed,
)

logger = logging.getLogger(__name__)

STREAK_KEY = "master_schedule_streak"
LAST_PERFECT_KEY = "master_schedule_streak_last_perfect_date"
# Streak v2 (spec 3.5): freezes are EARNED (1 per fully-closed week), max 2
# armed, never purchasable. A missed day silently consumes one instead of
# resetting; the next-open card says "Used a freeze for yesterday. Streak's
# safe." Never the words lost/broke/failed/missed near the streak number.
FREEZES_KEY = "master_schedule_streak_freezes"
FREEZE_USED_ON_KEY = "master_schedule_streak_freeze_used_on"
# The date a weekly freeze was actually GRANTED. Lets the un-credit path be
# symmetric with the CLAMPED grant: if the +1 was clamped away (already at max),
# un-checking that day must not hand back a freeze that was never earned.
FREEZE_CREDITED_ON_KEY = "master_schedule_streak_freeze_credited_on"
# Snapshot of how many tasks were COMPLETED when today was credited perfect. Lets
# _uncredit_if_unperfect tell a genuine un-check (completed count DROPPED) from a
# denominator growing (a new max / regen appended pending tasks, dropping the
# resolved fraction below the close threshold) — only the former should revoke.
PERFECT_COMPLETED_KEY = "master_schedule_streak_perfect_completed"
RESET_ON_KEY = "master_schedule_streak_reset_on"
MAX_ARMED_FREEZES = 2
# Stable journey anchor: "Day 1" is the day the user onboarded their first max
# (proxied by account creation in their tz). Persisted once so the day counter
# keeps incrementing day-over-day and never resets when schedules regenerate.
JOURNEY_START_KEY = "master_journey_start_date"


def _user_tz(onboarding: dict | None) -> ZoneInfo:
    tz_name = str((onboarding or {}).get("timezone") or "UTC").strip() or "UTC"
    try:
        return ZoneInfo(tz_name)
    except Exception:
        return ZoneInfo("UTC")


def local_today_date(onboarding: dict | None) -> date:
    return datetime.now(_user_tz(onboarding)).date()


def _journey_start(user: User, profile: dict[str, Any], onboarding: dict | None, today: date) -> date:
    """The fixed Day-1 anchor. Once persisted it never moves; otherwise it's the
    account-creation date in the user's tz (≈ first-max onboarding day)."""
    raw = profile.get(JOURNEY_START_KEY)
    if raw:
        try:
            return date.fromisoformat(str(raw))
        except (TypeError, ValueError):
            pass
    created = getattr(user, "created_at", None)
    if created:
        try:
            if created.tzinfo is None:
                created = created.replace(tzinfo=ZoneInfo("UTC"))
            d = created.astimezone(_user_tz(onboarding)).date()
            if d <= today:
                return d
        except Exception:
            pass
    return today


def _reconcile_missed(
    profile: dict[str, Any],
    today: date,
    schedules: list[dict] | None = None,
) -> bool:
    """Handle days with no perfect close. Armed freezes silently bridge the
    gap (one per missed day); only when freezes run out does the streak
    reset. Returns True if the profile changed.

    When `schedules` is provided, days with NO scheduled tasks (true rest /
    deload / regen-emptied days) are NOT counted as misses — they neither burn a
    freeze nor reset. `schedules=None` keeps the pure date-based gap math (used by
    the display-only reconcile copy)."""
    last_s = profile.get(LAST_PERFECT_KEY)
    if not last_s:
        return False
    try:
        last_d = date.fromisoformat(str(last_s))
    except (TypeError, ValueError):
        profile[LAST_PERFECT_KEY] = None
        profile[STREAK_KEY] = 0
        return True
    # Clamp a FUTURE marker to today: a backward timezone edit / clock skew can
    # leave LAST_PERFECT ahead of local today. Time can't run backwards, so the
    # streak must be PRESERVED — not collapsed to 1 by the next credit's gap
    # branch (which would see last_d != today-1).
    clamped = False
    if last_d > today:
        last_d = today
        profile[LAST_PERFECT_KEY] = today.isoformat()
        clamped = True
    if last_d >= today - timedelta(days=1):
        return clamped

    if schedules is not None:
        # Count only days that actually HAD tasks. A rest/no-task day is not a
        # miss, so it must not consume a freeze or reset the streak.
        task_bearing_gap = 0
        cur = last_d + timedelta(days=1)
        yesterday = today - timedelta(days=1)
        while cur <= yesterday:
            if collect_merged_tasks_for_date(schedules, cur.isoformat()):
                task_bearing_gap += 1
            cur += timedelta(days=1)
        if task_bearing_gap == 0:
            # Every gap day was a no-task day → nothing was missed. Carry the
            # streak forward so today's perfect close continues it (no freeze cost).
            profile[LAST_PERFECT_KEY] = yesterday.isoformat()
            return True
        gap_days = task_bearing_gap
    else:
        gap_days = (today - timedelta(days=1) - last_d).days

    freezes = int(profile.get(FREEZES_KEY) or 0)
    if 0 < gap_days <= freezes:
        # Bridge: consume one freeze per missed day, keep the streak intact.
        profile[FREEZES_KEY] = freezes - gap_days
        profile[LAST_PERFECT_KEY] = (today - timedelta(days=1)).isoformat()
        profile[FREEZE_USED_ON_KEY] = (today - timedelta(days=1)).isoformat()
        return True

    # Hard reset. Zero the freezes + clear all freeze markers so a fresh streak
    # doesn't start already holding protection, and so a stale "freeze used" card
    # can't render next to the fresh-start card.
    profile[STREAK_KEY] = 0
    profile[LAST_PERFECT_KEY] = None
    profile[FREEZES_KEY] = 0
    profile[FREEZE_USED_ON_KEY] = None
    profile.pop(FREEZE_CREDITED_ON_KEY, None)
    profile.pop(PERFECT_COMPLETED_KEY, None)
    # Drives the locked next-open card: "Yesterday got away. Today's a fresh
    # one." - the reset is never silent, and never shamed.
    profile[RESET_ON_KEY] = today.isoformat()
    return True


def _credit_if_perfect_day(
    profile: dict[str, Any],
    schedules: list[dict],
    today: date,
) -> bool:
    """If merged view shows all tasks done for today, bump streak once per calendar day."""
    today_s = today.isoformat()
    if not merged_day_all_completed(schedules, today_s):
        return False
    last_s = profile.get(LAST_PERFECT_KEY)
    if last_s == today_s:
        return False

    current = int(profile.get(STREAK_KEY) or 0)
    try:
        last_d = date.fromisoformat(str(last_s)) if last_s else None
    except (TypeError, ValueError):
        last_d = None

    if last_d is None:
        new_streak = 1
    elif last_d == today - timedelta(days=1):
        new_streak = current + 1
    else:
        new_streak = 1

    profile[STREAK_KEY] = new_streak
    profile[LAST_PERFECT_KEY] = today_s
    # Snapshot how many tasks were completed at credit time so a later un-credit
    # can distinguish a real un-check (this count drops) from the denominator
    # merely growing (a new max / regen appends pending tasks).
    profile[PERFECT_COMPLETED_KEY] = sum(
        1 for t in collect_merged_tasks_for_date(schedules, today_s)
        if t.get("status") == "completed"
    )
    # Earn a freeze for every fully-closed week, capped at 2 armed. Record the
    # grant date ONLY when the +1 actually took effect (wasn't clamped away), so
    # the un-credit path knows whether there's a freeze to hand back.
    if new_streak > 0 and new_streak % 7 == 0:
        prev = int(profile.get(FREEZES_KEY) or 0)
        new_freezes = min(MAX_ARMED_FREEZES, prev + 1)
        profile[FREEZES_KEY] = new_freezes
        if new_freezes > prev:
            profile[FREEZE_CREDITED_ON_KEY] = today_s
    return True


def _uncredit_if_unperfect(
    profile: dict[str, Any],
    schedules: list[dict],
    today: date,
) -> bool:
    """Inverse of `_credit_if_perfect_day`. If today was already credited as a
    perfect day but the merged view is no longer all-complete (the user
    UN-checked a task), roll today's credit back so the streak reflects reality
    instead of staying stuck at the value it reached when the day was complete."""
    today_s = today.isoformat()
    # Only undo when TODAY is the credited perfect day and it's no longer perfect.
    if profile.get(LAST_PERFECT_KEY) != today_s:
        return False
    if merged_day_all_completed(schedules, today_s):
        return False

    today_tasks = collect_merged_tasks_for_date(schedules, today_s)
    # (a) An EMPTY merged view is "no information", not "today became incomplete".
    # This fires on a transient empty `schedules` (a concurrent /active/full
    # during a regen commit gap, or right after the last active max is stopped) —
    # rolling back here would strip a day the user actually earned.
    if not today_tasks:
        return False
    # (b) Denominator-grew guard: only revoke when the COMPLETED count actually
    # dropped below what it was at credit time. Adding a new max / a regen that
    # appends PENDING tasks lowers the resolved fraction below the close
    # threshold WITHOUT any completion being undone — that must not revoke.
    snap = profile.get(PERFECT_COMPLETED_KEY)
    now_completed = sum(1 for t in today_tasks if t.get("status") == "completed")
    if snap is not None and now_completed >= int(snap):
        return False

    current = int(profile.get(STREAK_KEY) or 0)
    # Mirror the freeze earned in _credit_if_perfect_day, but ONLY if a freeze
    # was actually granted for today (not clamped away at the max). Otherwise
    # un-checking a day when already at max freezes would destroy an earlier,
    # legitimately-earned freeze.
    if (
        current > 0
        and current % 7 == 0
        and profile.get(FREEZE_CREDITED_ON_KEY) == today_s
    ):
        profile[FREEZES_KEY] = max(0, int(profile.get(FREEZES_KEY) or 0) - 1)
    # Clear the per-day grant marker regardless once we've undone today's credit.
    if profile.get(FREEZE_CREDITED_ON_KEY) == today_s:
        profile.pop(FREEZE_CREDITED_ON_KEY, None)
    # Today's credit is being revoked — drop its completed-count snapshot too.
    profile.pop(PERFECT_COMPLETED_KEY, None)

    new_streak = max(0, current - 1)
    profile[STREAK_KEY] = new_streak
    # The previous last-perfect day was yesterday (the only way today could have
    # been credited as +1); drop to None when nothing is left.
    profile[LAST_PERFECT_KEY] = (
        (today - timedelta(days=1)).isoformat() if new_streak > 0 else None
    )
    return True


def streak_payload_from_profile(profile: dict[str, Any], today: date) -> dict[str, Any]:
    # Reconcile a COPY for display so read-only surfaces (/planner/today,
    # /achievements) show the same current/freeze/reset view as the write path
    # (/schedules/active/full) regardless of which endpoint the client hits
    # first. `_reconcile_missed` is pure date logic (no schedule read, no
    # completion credit), so applying it to a throwaway dict is side-effect-free:
    # it only bridges via armed freezes or resets to 0 for a gap the stored
    # profile hasn't been reconciled through yet. The real persist still happens
    # in sync_master_schedule_streak; here we never write it back.
    view = dict(profile)
    _reconcile_missed(view, today)
    freeze_used_on = view.get(FREEZE_USED_ON_KEY)
    yesterday = (today - timedelta(days=1)).isoformat()
    reset_on = view.get(RESET_ON_KEY)
    profile = view
    return {
        "current": int(profile.get(STREAK_KEY) or 0),
        "last_perfect_date": profile.get(LAST_PERFECT_KEY),
        "today_date": today.isoformat(),
        "armed_freezes": int(profile.get(FREEZES_KEY) or 0),
        # True exactly on the first open after a freeze silently bridged
        # yesterday - drives the "Used a freeze for yesterday. Streak's safe."
        # card. Locked copy lives client-side.
        "freeze_used_yesterday": freeze_used_on == yesterday,
        # True on the first open after a no-freeze reset (today only).
        "fresh_start_today": reset_on == today.isoformat(),
    }


async def sync_master_schedule_streak(
    user: User | None,
    schedules: list[dict],
    db: AsyncSession,
) -> dict[str, Any]:
    """
    Reconcile missed days, credit today if all merged tasks complete, persist profile.
    Returns streak payload for API clients.
    """
    if not user:
        t = date.today()
        return {
            "current": 0,
            "last_perfect_date": None,
            "today_date": t.isoformat(),
            "journey_start_date": t.isoformat(),
            "day_number": 1,
        }

    onboarding = dict(user.onboarding or {})
    today = local_today_date(onboarding)
    profile = dict(user.profile or {})

    # Pass schedules so a rest/no-task gap day doesn't burn a freeze or reset.
    prev_streak = int(profile.get(STREAK_KEY) or 0)
    changed = _reconcile_missed(profile, today, schedules)
    changed = _credit_if_perfect_day(profile, schedules, today) or changed
    # Reverse today's credit if the user un-checked a task and today is no longer
    # perfect (mutually exclusive with the credit above). Keeps the streak honest.
    changed = _uncredit_if_unperfect(profile, schedules, today) or changed

    # XP: perfect-day (+25) once/day + 7-day milestone bonus (+100), additive-only.
    # Awarded here so it rides the streak's own commit. Best-effort — never fatal.
    try:
        from services.gamification import award_streak_xp
        new_streak = int(profile.get(STREAK_KEY) or 0)
        _xp = award_streak_xp(profile, prev_streak, new_streak, today.isoformat())
        if _xp.get("xp_awarded"):
            changed = True
    except Exception:  # pragma: no cover - non-fatal
        pass

    # Anchor (and persist once) the Day-1 date so the day counter is stable.
    start = _journey_start(user, profile, onboarding, today)
    if profile.get(JOURNEY_START_KEY) != start.isoformat():
        profile[JOURNEY_START_KEY] = start.isoformat()
        changed = True

    if changed:
        user.profile = profile
        flag_modified(user, "profile")
        user.updated_at = datetime.utcnow()
        await db.commit()

    payload = streak_payload_from_profile(profile, today)
    payload["journey_start_date"] = start.isoformat()
    payload["day_number"] = max(1, (today - start).days + 1)
    return payload
