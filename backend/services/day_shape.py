"""The user's day shape: one place that writes it, one place that reads it.

Beta-1 found the same wake time held in six places that disagreed (the
scalar `onboarding.wake_time`, its `wake_window`, per-day `weekly_timings`,
`user_facts`, a raw copy in the schedule context, and each schedule's frozen
`preferences`). A chat "I wake at 10 now" moved one of them, so the planner,
the settings sheet, the task text and the coach each told a different story.

Rules:
  * `onboarding` is the store. Everything else is a mirror written here.
  * A new scalar moves its window (and the per-day timings, and the
    get-ready window that hangs off waking) by the same delta, so readers
    that prefer windows and readers that prefer scalars agree.
  * Context copies of day-shape keys are deleted on write, and
    `merged_user_state` never lets the context override them.
  * Every write returns warnings (overlapping windows, a short night) and
    retimes active plans.
"""
from __future__ import annotations

import logging
import re
from typing import Any, Optional

logger = logging.getLogger(__name__)

# keys that describe the shape of the day; owned by onboarding
DAY_SHAPE_KEYS = frozenset({
    "wake_time", "sleep_time", "wake_window", "sleep_window", "wind_down_window",
    "get_ready_window", "get_ready_time", "get_ready_minutes",
    "preferred_workout_window", "preferred_workout_time", "workout_time",
    "obligations", "weekly_timings", "daily_minutes", "biohack_level",
    "breakfast_time", "lunch_time", "dinner_time", "commute_minutes", "work_location",
    "weekend_shift",
})

_HM = re.compile(r"^(\d{1,2}):(\d{2})")


def to_min(v: Any, default: int = -1) -> int:
    m = _HM.match(str(v or "").strip())
    if not m:
        return default
    h, mi = int(m.group(1)), int(m.group(2))
    if h > 24 or mi > 59:
        return default
    return (h * 60 + mi) % 1440


def hm(m: int) -> str:
    m %= 1440
    return f"{m // 60:02d}:{m % 60:02d}"


def _shift(v: Any, delta: int) -> Any:
    m = to_min(v)
    return v if m < 0 else hm(m + delta)


def _shift_window(w: Any, delta: int) -> Any:
    if isinstance(w, (list, tuple)) and len(w) == 2:
        return [_shift(w[0], delta), _shift(w[1], delta)]
    return w


def _delta(old: Any, new: Any) -> int:
    a, b = to_min(old), to_min(new)
    if a < 0 or b < 0:
        return 0
    d = (b - a) % 1440
    return d - 1440 if d > 720 else d


def normalize(current: dict, patch: dict) -> dict:
    """The onboarding blob after `patch`, with every mirror of a moved anchor
    moved with it. Pure."""
    ob = dict(current or {})
    patch = dict(patch or {})
    wake_d = _delta(ob.get("wake_time"), patch["wake_time"]) if patch.get("wake_time") else 0
    sleep_d = _delta(ob.get("sleep_time"), patch["sleep_time"]) if patch.get("sleep_time") else 0
    ob.update(patch)
    if patch.get("wake_time"):
        w = hm(to_min(patch["wake_time"], 7 * 60))
        ob["wake_time"] = w
        if "wake_window" not in patch:
            ob["wake_window"] = _shift_window(ob.get("wake_window"), wake_d) if ob.get("wake_window") else [w, w]
        if "get_ready_window" not in patch and wake_d:
            if ob.get("get_ready_window"):
                ob["get_ready_window"] = _shift_window(ob["get_ready_window"], wake_d)
            if ob.get("get_ready_time"):
                ob["get_ready_time"] = _shift(ob["get_ready_time"], wake_d)
    if patch.get("sleep_time"):
        s = hm(to_min(patch["sleep_time"], 23 * 60))
        ob["sleep_time"] = s
        for key in ("sleep_window", "wind_down_window"):
            if key not in patch and ob.get(key):
                ob[key] = _shift_window(ob[key], sleep_d)
    if (wake_d or sleep_d) and "weekly_timings" not in patch and isinstance(ob.get("weekly_timings"), dict):
        wt = {}
        for day, t in ob["weekly_timings"].items():
            if not isinstance(t, dict):
                wt[day] = t
                continue
            t = dict(t)
            if wake_d and t.get("wake_time"):
                t["wake_time"] = _shift(t["wake_time"], wake_d)
            if wake_d and t.get("wake_window"):
                t["wake_window"] = _shift_window(t["wake_window"], wake_d)
            if sleep_d and t.get("sleep_time"):
                t["sleep_time"] = _shift(t["sleep_time"], sleep_d)
            wt[day] = t
        ob["weekly_timings"] = wt
    return ob


# ── warnings: windows that collide, a night that's too short ─────────────────

def _span(w: Any) -> Optional[tuple[int, int]]:
    if isinstance(w, (list, tuple)) and len(w) == 2:
        a, b = to_min(w[0]), to_min(w[1])
        if a >= 0 and b >= 0:
            return (a, b if b > a else b + 1440)
    return None


def _pretty(m: int) -> str:
    m %= 1440
    h, mi = divmod(m, 60)
    suf = "AM" if h < 12 else "PM"
    h = h % 12 or 12
    return f"{h}:{mi:02d} {suf}" if mi else f"{h} {suf}"


def _weekday_obligations(ob: dict) -> list[tuple[str, int, int]]:
    out = []
    for o in ob.get("obligations") or []:
        if not isinstance(o, dict):
            continue
        days = o.get("days") or "weekdays"
        if isinstance(days, str) and days.lower() == "weekends":
            continue
        a, b = to_min(o.get("start")), to_min(o.get("end"))
        if a >= 0 and b > a:
            out.append((str(o.get("label") or "Commitment"), a, b))
    return out


def warnings(ob: dict) -> list[dict]:
    """Collisions between the windows the user set, and a short night."""
    out: list[dict] = []
    blocks: list[tuple[str, int, int]] = []
    gr = _span(ob.get("get_ready_window"))
    if gr:
        blocks.append(("Get ready", gr[0], gr[1]))
    wk = _span(ob.get("preferred_workout_window"))
    if wk and wk[1] - wk[0] < 6 * 60:          # a narrow window is a booking, not "any time"
        blocks.append(("Workout window", wk[0], wk[1]))
    blocks += _weekday_obligations(ob)
    seen = set()
    for i, (la, a0, a1) in enumerate(blocks):
        for lb, b0, b1 in blocks[i + 1:]:
            if a0 < b1 and b0 < a1 and (la, lb) not in seen:
                # a derived commute that ends exactly where work starts is fine
                seen.add((la, lb))
                out.append({"code": "overlap",
                            "message": f"{la} ({_pretty(a0)}–{_pretty(a1)}) overlaps {lb} "
                                       f"({_pretty(b0)}–{_pretty(b1)}). Move one so your morning fits."})
    wake = to_min(ob.get("wake_time"))
    if gr:
        for label, a, _b in _weekday_obligations(ob):
            if "commute" in label.lower() and a < gr[0] and (a - (wake if wake >= 0 else 0)) % 1440 < 12 * 60:
                out.append({"code": "order",
                            "message": f"Get ready ({_pretty(gr[0])}–{_pretty(gr[1])}) starts after your "
                                       f"{label.lower()} ({_pretty(a)}). Move get ready earlier."})
                break
    if gr and wake >= 0 and (gr[0] - wake) % 1440 > 12 * 60:
        out.append({"code": "before_wake",
                    "message": f"Get ready starts at {_pretty(gr[0])}, before you wake at {_pretty(wake)}."})
    bed = to_min(ob.get("sleep_time"))
    if wake >= 0 and bed >= 0:
        night = (wake - bed) % 1440
        if 0 < night < 7 * 60:
            h, m = divmod(night, 60)
            out.append({"code": "short_sleep",
                        "message": f"Bed at {_pretty(bed)} and up at {_pretty(wake)} leaves {h} h"
                                   f"{f' {m} min' if m else ''} for sleep; most adults need 7 or more."})
    return out


# ── the one writer ────────────────────────────────────────────────────────────

async def write(user, db, patch: dict, *, source: str, regen: bool = True) -> dict:
    """Apply a day-shape change everywhere it lives. Returns
    {"changed": [keys], "warnings": [...], "onboarding": blob}."""
    from sqlalchemy.orm.attributes import flag_modified

    patch = {k: v for k, v in (patch or {}).items() if k in DAY_SHAPE_KEYS or k in ("timezone",)}
    if not user or not patch:
        return {"changed": [], "warnings": [], "onboarding": dict(getattr(user, "onboarding", None) or {})}
    before = dict(user.onboarding or {})
    after = normalize(before, patch)
    changed = sorted(k for k in set(after) | set(before) if after.get(k) != before.get(k))
    if not changed:
        return {"changed": [], "warnings": warnings(after), "onboarding": after}
    user.onboarding = after
    flag_modified(user, "onboarding")
    sp = dict(user.schedule_preferences or {})
    for k in ("wake_time", "sleep_time"):
        if after.get(k):
            sp[k] = after[k]
    user.schedule_preferences = sp
    flag_modified(user, "schedule_preferences")
    await db.flush()
    await sync_mirrors(str(user.id), after, db)
    if regen:
        try:
            from services.schedule_runtime import regenerate_active_schedules
            await regenerate_active_schedules(user_id=str(user.id), db=db, reason=f"day_shape:{source}")
        except Exception as e:  # noqa: BLE001
            logger.warning("day_shape regen failed (non-fatal): %s", e)
        try:
            from services import task_guide_service as _tg
            if hasattr(_tg, "invalidate_user_guides"):
                await _tg.invalidate_user_guides(str(user.id), db)
        except Exception as e:  # noqa: BLE001
            logger.warning("guide invalidation failed (non-fatal): %s", e)
    return {"changed": changed, "warnings": warnings(after), "onboarding": after}


async def sync_mirrors(user_id: str, ob: dict, db) -> None:
    """user_facts, context copies and each active schedule's frozen
    preferences follow the onboarding blob."""
    from sqlalchemy import select
    from models.sqlalchemy_models import UserSchedule
    from services.user_context_service import get_context, merge_context
    from services.user_facts_service import FACTS_KEY
    from uuid import UUID

    try:
        ctx = await get_context(user_id, db)
        updates: dict[str, Any] = {k: None for k in DAY_SHAPE_KEYS if k in ctx and ctx.get(k) is not None}
        facts = dict(ctx.get(FACTS_KEY) or {})
        for k in ("wake_time", "sleep_time"):
            if ob.get(k) and facts.get(k) != ob[k]:
                facts[k] = ob[k]
                updates[FACTS_KEY] = facts
        if updates:
            await merge_context(user_id, updates, db)
    except Exception as e:  # noqa: BLE001
        logger.warning("day_shape context sync failed (non-fatal): %s", e)
    try:
        res = await db.execute(select(UserSchedule).where(
            (UserSchedule.user_id == UUID(user_id)) & (UserSchedule.is_active.is_(True))))
        for s in res.scalars().all():
            prefs = dict(s.preferences or {})
            new = {**prefs, **{k: ob[k] for k in ("wake_time",) if ob.get(k)},
                   **({"sleep_time": ob["sleep_time"]} if ob.get("sleep_time") else {})}
            if new != prefs:
                s.preferences = new
        await db.flush()
    except Exception as e:  # noqa: BLE001
        logger.warning("day_shape schedule prefs sync failed (non-fatal): %s", e)
