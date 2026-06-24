"""Per-user notification state — the memory the planner reads/writes.

Lives in ``user.profile['notif_state']`` (parallel to the conductor's
``profile['jitai']``). Pure dict transforms where possible so the planner stays
testable; the caller persists the returned dict.

Tracks, per user:
  * ``last_active_at``      — last time the app was foregrounded (review item 2)
  * ``delivered`` / ``opened`` — rolling ISO-timestamp lists for adaptive
    backoff (review item 3)
  * ``sent``               — {local_date: {dedup_key: send_iso}} for dedup + cap
  * ``recent_templates``   — {category: [template_id,...]} rotation guard
  * ``broadcasts``         — rolling ISO list for the global broadcast rate-limit
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional

from services.notification_copy import (
    ESSENTIAL_CATEGORIES,
    OPTIONAL_CATEGORIES,
)

_ROLL_DAYS = 14
_RECENT_TEMPLATES_KEEP = 4


def get_state(profile: dict | None) -> dict:
    return dict((profile or {}).get("notif_state") or {})


def put_state(profile: dict, state: dict) -> dict:
    out = dict(profile or {})
    out["notif_state"] = state
    return out


def _parse(ts: str) -> Optional[datetime]:
    try:
        return datetime.fromisoformat(str(ts))
    except (TypeError, ValueError):
        return None


def _prune(items: list, now: datetime, days: int = _ROLL_DAYS) -> list:
    cutoff = now - timedelta(days=days)
    out = []
    for it in items or []:
        dt = _parse(it)
        if dt and dt >= cutoff:
            out.append(it)
    return out


# --- foreground suppression (review item 2) ---------------------------------

def mark_app_active(state: dict, now: datetime) -> dict:
    out = dict(state or {})
    out["last_active_at"] = now.isoformat()
    return out


def foreground_recent(state: dict, now: datetime, suppress_min: int) -> bool:
    """True if the app was used within the last `suppress_min` minutes."""
    last = _parse((state or {}).get("last_active_at") or "")
    if not last:
        return False
    if last.tzinfo and now.tzinfo is None:
        last = last.replace(tzinfo=None)
    if now.tzinfo and last.tzinfo is None:
        last = last.replace(tzinfo=now.tzinfo)
    return (now - last) < timedelta(minutes=max(0, suppress_min))


# --- adaptive backoff inputs (review item 3) --------------------------------

def record_delivered(state: dict, now: datetime, count: int = 1) -> dict:
    out = dict(state or {})
    arr = _prune(list(out.get("delivered") or []), now)
    arr.extend([now.isoformat()] * max(1, count))
    out["delivered"] = arr
    return out


def record_opened(state: dict, now: datetime) -> dict:
    out = dict(state or {})
    out["opened"] = _prune(list(out.get("opened") or []), now) + [now.isoformat()]
    out["last_active_at"] = now.isoformat()  # opening a push == app activity
    return out


def backoff_inputs(
    state: dict, now: datetime, *, lapse_days: int, window_days: int = 7
) -> tuple[int, int, bool]:
    """Return (recent_delivered, recent_opened, returning_lapsed) for the cap."""
    cutoff = now - timedelta(days=window_days)
    delivered = [t for t in (state or {}).get("delivered") or [] if (_parse(t) or now) >= cutoff]
    opened = [t for t in (state or {}).get("opened") or [] if (_parse(t) or now) >= cutoff]
    # Returning lapsed: an open today but the prior open was > lapse_days ago.
    opened_all = sorted([d for d in (_parse(t) for t in (state or {}).get("opened") or []) if d])
    returning = False
    if len(opened_all) >= 1:
        last = opened_all[-1]
        recent_open = (now - last) < timedelta(days=1)
        prev = opened_all[-2] if len(opened_all) >= 2 else None
        if recent_open and prev is not None and (last - prev) >= timedelta(days=lapse_days):
            returning = True
    return len(delivered), len(opened), returning


def is_lapsed(state: dict, now: datetime, lapse_days: int) -> bool:
    """No app activity (open/use) for >= lapse_days, but there WAS prior
    activity (empty-state new users are not 'lapsed')."""
    last = _parse((state or {}).get("last_active_at") or "")
    if not last:
        return False  # never active -> brand-new, not lapsed (review item 8)
    if last.tzinfo and now.tzinfo is None:
        now = now.replace(tzinfo=last.tzinfo)
    if now.tzinfo and last.tzinfo is None:
        last = last.replace(tzinfo=now.tzinfo)
    return (now - last) >= timedelta(days=lapse_days)


# --- dedup / cap bookkeeping ------------------------------------------------

def sent_keys_today(state: dict, local_date_iso: str) -> frozenset:
    day = ((state or {}).get("sent") or {}).get(local_date_iso) or {}
    return frozenset(day.keys())

def sent_count_today(state: dict, local_date_iso: str) -> int:
    return len(((state or {}).get("sent") or {}).get(local_date_iso) or {})

def last_send_min_today(state: dict, local_date_iso: str) -> Optional[int]:
    day = ((state or {}).get("sent") or {}).get(local_date_iso) or {}
    mins = []
    for iso in day.values():
        dt = _parse(iso)
        if dt:
            mins.append(dt.hour * 60 + dt.minute)
    return max(mins) if mins else None


def record_sent(state: dict, local_date_iso: str, dedup_key: str, now: datetime) -> dict:
    out = dict(state or {})
    sent = dict(out.get("sent") or {})
    day = dict(sent.get(local_date_iso) or {})
    day[dedup_key] = now.isoformat()
    sent[local_date_iso] = day
    # keep only last 3 local days
    for k in sorted(sent)[:-3]:
        sent.pop(k, None)
    out["sent"] = sent
    return out


# --- rotation guard ---------------------------------------------------------

def recent_templates(state: dict, category: str) -> list:
    return list(((state or {}).get("recent_templates") or {}).get(category) or [])

def push_recent_template(state: dict, category: str, template_id: str) -> dict:
    out = dict(state or {})
    rt = dict(out.get("recent_templates") or {})
    arr = list(rt.get(category) or [])
    arr.append(template_id)
    rt[category] = arr[-_RECENT_TEMPLATES_KEEP:]
    out["recent_templates"] = rt
    return out


# --- broadcast global rate-limit (review item 5) ----------------------------

def broadcasts_last_week(state: dict, now: datetime) -> int:
    cutoff = now - timedelta(days=7)
    return len([t for t in (state or {}).get("broadcasts") or [] if (_parse(t) or now) >= cutoff])

def record_broadcast(state: dict, now: datetime) -> dict:
    out = dict(state or {})
    out["broadcasts"] = _prune(list(out.get("broadcasts") or []), now) + [now.isoformat()]
    return out


# --- per-category mute (review item 6) --------------------------------------

def muted_categories(onboarding: dict | None) -> frozenset:
    """Optional categories the user has muted. Essential (task/plan reminders)
    can never be muted here — opting out of those is the channel-level toggle.
    Optional default ON; honor explicit False."""
    prefs = (onboarding or {}).get("notif_category_prefs") or {}
    muted = set()
    for cat in OPTIONAL_CATEGORIES:
        if prefs.get(cat) is False:
            muted.add(cat)
    return frozenset(muted)


def set_category_pref(onboarding: dict, category: str, enabled: bool) -> dict:
    out = dict(onboarding or {})
    prefs = dict(out.get("notif_category_prefs") or {})
    prefs[category] = bool(enabled)
    out["notif_category_prefs"] = prefs
    return out
