"""Master schedule daily streak — all merged tasks completed by local end-of-day."""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from models.sqlalchemy_models import User
from services.schedule_master_merge import merged_day_all_completed

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


def _reconcile_missed(profile: dict[str, Any], today: date) -> bool:
    """Handle days with no perfect close. Armed freezes silently bridge the
    gap (one per missed day); only when freezes run out does the streak
    reset. Returns True if the profile changed."""
    last_s = profile.get(LAST_PERFECT_KEY)
    if not last_s:
        return False
    try:
        last_d = date.fromisoformat(str(last_s))
    except (TypeError, ValueError):
        profile[LAST_PERFECT_KEY] = None
        profile[STREAK_KEY] = 0
        return True
    if last_d >= today - timedelta(days=1):
        return False

    gap_days = (today - timedelta(days=1) - last_d).days
    freezes = int(profile.get(FREEZES_KEY) or 0)
    if 0 < gap_days <= freezes:
        # Bridge: consume one freeze per missed day, keep the streak intact.
        profile[FREEZES_KEY] = freezes - gap_days
        profile[LAST_PERFECT_KEY] = (today - timedelta(days=1)).isoformat()
        profile[FREEZE_USED_ON_KEY] = (today - timedelta(days=1)).isoformat()
        return True

    profile[STREAK_KEY] = 0
    profile[LAST_PERFECT_KEY] = None
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

    new_streak = max(0, current - 1)
    profile[STREAK_KEY] = new_streak
    # The previous last-perfect day was yesterday (the only way today could have
    # been credited as +1); drop to None when nothing is left.
    profile[LAST_PERFECT_KEY] = (
        (today - timedelta(days=1)).isoformat() if new_streak > 0 else None
    )
    return True


def streak_payload_from_profile(profile: dict[str, Any], today: date) -> dict[str, Any]:
    freeze_used_on = profile.get(FREEZE_USED_ON_KEY)
    yesterday = (today - timedelta(days=1)).isoformat()
    reset_on = profile.get(RESET_ON_KEY)
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

    changed = _reconcile_missed(profile, today)
    changed = _credit_if_perfect_day(profile, schedules, today) or changed
    # Reverse today's credit if the user un-checked a task and today is no longer
    # perfect (mutually exclusive with the credit above). Keeps the streak honest.
    changed = _uncredit_if_unperfect(profile, schedules, today) or changed

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
