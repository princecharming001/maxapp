"""Push engine v3 — what to push to ONE user at ONE minute. Pure + deterministic.

Why v3 (production, 2026-09-24): v2 ran every task reminder through a daily
cap of 5 and a 90-minute minimum gap, and collapsed any tasks within 90 minutes
of each other into a single reminder. A real 8-task day produced ~3 pushes —
tasks at 05:22, 06:03 and 06:30 never got theirs and a 21:00-22:28 evening
block collapsed into one. v2 also read each program's STORED task times, which
differ from the times the app shows after the cross-program collision pass
(11% of a day's tasks, up to 39 minutes off). And a lapsed user got a
re-engagement push every single day, forever.

Two lanes, evaluated once a minute by services.scheduler_job:

TASK lane — every task on today's DISPLAYED plan (master view times) gets a
push at its own minute. Tasks due within ``task_lookahead_min`` ride in one
push that names them. Not limited by the ambient budget and not suppressed
while the app is open (a banner at the task's minute is still the right
reminder). Paused while the user is lapsed: eight pushes a day to someone who
stopped opening the app is how apps get their notifications switched off.

AMBIENT lane — everything else, at most one per tick, each a singleton per day
unless stated:
  * morning brief — or a special morning: streak milestone, freeze used,
    fresh start after a streak ended, journey milestone (day 7/14/30/...)
  * missed-task follow-up — overdue tasks still open (<= 2 a day)
  * streak saver — the evening before the day closes, when a real streak is at
    stake and something earlier is still open; streak last call before bed
  * evening close — end-of-day wrap of what's still open
  * weekly recap (Sunday), progress photo (weekly), new scan unlocked
  * re-engagement ladder for lapsed users (day 3/6/10/14/21/30, then quiet)
  * tip (Mon/Wed/Fri, only on otherwise quiet days)
Governed by a daily budget, a minimum gap between ambient pushes, a buffer
around task pushes (never two buzzes in a row), the wake/sleep window,
foreground suppression and per-category mute.

Time axis: every minute here is an "ext minute" — minutes since midnight of the
user's LOGICAL day. A night owl's 01:07 task belongs to yesterday's plan and
sits at 1507; the logical day starts ``OVERNIGHT_LEAD_MIN`` before wake. So one
integer comparison handles days that cross midnight.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from typing import Any, Optional

from services.notification_copy import (
    CAT_COMEBACK,
    CAT_EVENING_RECAP,
    CAT_JOURNEY,
    CAT_MISSED,
    CAT_MORNING_PREVIEW,
    CAT_PROGRESS_PHOTO,
    CAT_REENGAGE,
    CAT_SCAN_READY,
    CAT_STREAK,
    CAT_STREAK_FREEZE,
    CAT_STREAK_LAST_CALL,
    CAT_STREAK_MILESTONE,
    CAT_TASK_DUE,
    CAT_TIP,
    CAT_WEEKLY,
    MUTE_PARENT,
    compose,
)

OVERNIGHT_LEAD_MIN = 120          # the logical day starts this long before wake
STREAK_DAY_END_EXT = 1430         # a streak day ends at calendar midnight (23:50 margin)
STREAK_MILESTONES = frozenset({3, 7, 14, 21, 30, 50, 75, 100, 150, 200, 250, 300, 365})
JOURNEY_MILESTONES = frozenset({7, 14, 30, 60, 90, 180, 365})
MORNING_KEY = f"cat:{CAT_MORNING_PREVIEW}"   # one morning push a day, whichever flavour

# notif_state keys owned by the engine (alongside notification_state's `sent`).
TASK_SENT_KEY = "task_sent"       # {logical_date: {task_key: iso}}
MISSED_SENT_KEY = "missed_sent"   # {logical_date: {task_key: iso}}
ONCE_KEY = "once"                 # {event_key: iso} — weekly recap, scan unlock, photo
REENGAGE_KEY = "reengage"         # {"anchor": last-active date, "days": [ladder stages sent]}
_KEEP_DAYS = 3


# --------------------------------------------------------------------------- #
#  Inputs / outputs                                                           #
# --------------------------------------------------------------------------- #

@dataclass(frozen=True)
class EngineTask:
    key: str                         # stable identity for today (task_uuid, else task_id)
    title: str
    at: int                          # ext minute the app shows for this task
    status: str = "pending"
    maxx: str = ""
    schedule_id: Optional[str] = None
    task_id: Optional[str] = None
    task_uuid: Optional[str] = None
    duration_min: int = 5

    @property
    def pending(self) -> bool:
        return self.status not in ("completed", "skipped")


@dataclass(frozen=True)
class StreakView:
    current: int = 0                 # effective streak (through yesterday, or today if closed)
    closed_today: bool = False       # today already counts toward the streak
    needed_to_close: int = 0         # tasks still needed for today to count
    freeze_used_yesterday: bool = False
    fresh_start_today: bool = False  # a streak ended since the last close
    last_close_yesterday: bool = False


@dataclass(frozen=True)
class ProgressView:
    journey_day: int = 0             # 1 on the first day with Max
    has_scanned: bool = False
    days_since_scan: Optional[int] = None
    scan_ready: bool = False         # a new scan is allowed now AND >= 7 days since the last
    days_since_photo: Optional[int] = None   # None = never took one


@dataclass(frozen=True)
class WeekView:
    closed_days: int = 0
    active_days: int = 0
    done: int = 0
    total: int = 0


@dataclass(frozen=True)
class EngineConfig:
    task_late_grace_min: int = 15     # a task push may go at most this late (server hiccup)
    task_lookahead_min: int = 3       # tasks this close ride in the same push
    task_daily_ceiling: int = 24      # safety net, far above any real plan
    ambient_daily_cap: int = 5
    ambient_min_gap_min: int = 75
    task_buffer_min: int = 15         # no ambient push this close to a task push
    lapse_pause_hours: int = 48       # no app activity this long → task lane pauses
    missed_after_min: int = 45        # a task counts as overdue this long after its time
    missed_max_per_day: int = 2
    missed_min_gap_min: int = 150
    missed_lookback_min: int = 360    # follow-ups only name tasks from the last 6 h
    reengage_ladder_days: tuple = (3, 6, 10, 14, 21, 30)
    reengage_max_days: int = 40       # beyond this, stay quiet


@dataclass
class EngineInput:
    now: datetime                    # user-local, naive
    logical_date: date
    now_ext: int
    wake_min: int
    sleep_ext: int
    tasks: list[EngineTask]
    state: dict
    streak: StreakView = field(default_factory=StreakView)
    progress: ProgressView = field(default_factory=ProgressView)
    week: WeekView = field(default_factory=WeekView)
    hours_since_active: Optional[float] = None
    last_active_date: Optional[date] = None
    foreground_recent: bool = False
    muted: frozenset = frozenset()
    name: Optional[str] = None
    why: Optional[str] = None
    coaching_tone: Optional[str] = None
    rotation: int = 0


@dataclass(frozen=True)
class Push:
    category: str
    lane: str                        # "task" | "ambient"
    dedup_key: str                   # ambient ledger key (ignored for the task lane)
    title: str
    body: str
    route: str
    params: dict
    thread_id: str
    task_keys: tuple = ()            # task lane: tasks covered; missed: tasks followed up
    once_key: Optional[str] = None   # recorded in the ONCE ledger when sent
    reengage_stage: Optional[int] = None
    apns_category: Optional[str] = None
    expires_in_s: int = 3600
    template_id: str = ""


# --------------------------------------------------------------------------- #
#  Time helpers (pure)                                                        #
# --------------------------------------------------------------------------- #

def logical_day(now_local: datetime, wake_min: int) -> tuple[date, int]:
    """(logical date, now as ext minute). Before (wake - lead) the user is still
    in yesterday's day — a night owl at 01:00 hasn't started a new day yet."""
    m = now_local.hour * 60 + now_local.minute
    start = wake_min - OVERNIGHT_LEAD_MIN
    if start > 0 and m < start:
        return now_local.date() - timedelta(days=1), m + 1440
    return now_local.date(), m


def sleep_ext_min(wake_min: int, sleep_min: int) -> int:
    """Bedtime on the ext axis (after midnight → +1440)."""
    return sleep_min + 1440 if sleep_min <= wake_min else sleep_min


def task_ext_min(time_min: int, wake_min: int, sleep_min: int) -> int:
    """A plan time on the ext axis. Only a sleep that crosses midnight makes an
    early-hours task belong to the night before (01:07 for a 02:00 bedtime)."""
    crosses = sleep_min <= wake_min
    if crosses and time_min < wake_min and time_min <= sleep_min + 60:
        return time_min + 1440
    return time_min


def clock_label(ext: int) -> str:
    """'7:30am' / '1:05pm' — lowercase, the app's voice."""
    m = ext % 1440
    h, mm = divmod(m, 60)
    suffix = "am" if h < 12 else "pm"
    h12 = h % 12 or 12
    return f"{h12}:{mm:02d}{suffix}"


def _ext_of_iso(iso: Any, logical_date: date) -> Optional[int]:
    try:
        dt = datetime.fromisoformat(str(iso))
    except (TypeError, ValueError):
        return None
    if dt.tzinfo is not None:
        dt = dt.replace(tzinfo=None)   # stored in the user's local time
    base = datetime.combine(logical_date, time())
    return int((dt - base).total_seconds() // 60)


# --------------------------------------------------------------------------- #
#  Ledger reads (pure)                                                        #
# --------------------------------------------------------------------------- #

def _day(state: dict, key: str, day_iso: str) -> dict:
    return dict(((state or {}).get(key) or {}).get(day_iso) or {})


def ambient_sent_today(state: dict, day_iso: str) -> dict:
    return _day(state, "sent", day_iso)


def task_sent_today(state: dict, day_iso: str) -> dict:
    return _day(state, TASK_SENT_KEY, day_iso)


def missed_sent_today(state: dict, day_iso: str) -> dict:
    return _day(state, MISSED_SENT_KEY, day_iso)


def task_ledger_key(day_iso: str, task_key: str) -> str:
    return f"{day_iso}:{task_key}"


# --------------------------------------------------------------------------- #
#  Ledger writes (pure; the caller persists under the profile row lock)       #
# --------------------------------------------------------------------------- #

def _prune_days(d: dict) -> dict:
    out = dict(d or {})
    for k in sorted(out)[:-_KEEP_DAYS]:
        out.pop(k, None)
    return out


def record_push(state: dict, push: Push, day_iso: str, now_local: datetime) -> dict:
    """Return a new notif_state with `push` recorded. Idempotent per key."""
    st = dict(state or {})
    iso = now_local.replace(tzinfo=None).isoformat(timespec="seconds")
    if push.lane == "task":
        led = dict(st.get(TASK_SENT_KEY) or {})
        day = dict(led.get(day_iso) or {})
        for k in push.task_keys:
            day.setdefault(task_ledger_key(day_iso, k), iso)
        led[day_iso] = day
        st[TASK_SENT_KEY] = _prune_days(led)
    else:
        sent = dict(st.get("sent") or {})
        day = dict(sent.get(day_iso) or {})
        day[push.dedup_key] = iso
        sent[day_iso] = day
        st["sent"] = _prune_days(sent)
        if push.category == CAT_MISSED and push.task_keys:
            led = dict(st.get(MISSED_SENT_KEY) or {})
            mday = dict(led.get(day_iso) or {})
            for k in push.task_keys:
                mday.setdefault(task_ledger_key(day_iso, k), iso)
            led[day_iso] = mday
            st[MISSED_SENT_KEY] = _prune_days(led)
        if push.once_key:
            once = dict(st.get(ONCE_KEY) or {})
            once[push.once_key] = iso
            if len(once) > 60:
                for k in sorted(once, key=lambda k: once[k])[: len(once) - 60]:
                    once.pop(k, None)
            st[ONCE_KEY] = once
        if push.reengage_stage is not None:
            rg = dict(st.get(REENGAGE_KEY) or {})
            anchor = push.params.get("_anchor") if isinstance(push.params, dict) else None
            if rg.get("anchor") != anchor:
                rg = {"anchor": anchor, "days": []}
            days = list(rg.get("days") or [])
            if push.reengage_stage not in days:
                days.append(push.reengage_stage)
            rg["days"] = days
            st[REENGAGE_KEY] = rg
    # delivered log feeds analytics / adaptive backoff elsewhere (bounded);
    # `seq` is the monotonic copy-rotation counter — the bounded log's length
    # stops growing at the bound and would freeze the rotation on one line.
    delivered = [t for t in (st.get("delivered") or []) if isinstance(t, str)]
    st["delivered"] = (delivered + [iso])[-200:]
    st["seq"] = int(st.get("seq") or 0) + 1
    return st


def _key_offset(key: str) -> int:
    """Small stable per-task offset so two tasks pushed the same day don't
    get the same line (deterministic, unlike hash())."""
    return sum(ord(c) for c in str(key)) % 7


# --------------------------------------------------------------------------- #
#  The decision                                                               #
# --------------------------------------------------------------------------- #

def decide(inp: EngineInput, cfg: Optional[EngineConfig] = None) -> list[Push]:
    """Everything to push to this user right now (possibly nothing)."""
    cfg = cfg or EngineConfig()
    pushes = _task_lane(inp, cfg)
    if pushes:
        return pushes  # an ambient push this same minute would be a double buzz
    amb = _ambient_lane(inp, cfg)
    return [amb] if amb else []


def is_lapsed(inp: EngineInput, cfg: EngineConfig) -> bool:
    return inp.hours_since_active is not None and inp.hours_since_active >= cfg.lapse_pause_hours


def _muted(category: str, muted: frozenset) -> bool:
    return category in muted or MUTE_PARENT.get(category, "") in muted


def _day_iso(inp: EngineInput) -> str:
    return inp.logical_date.isoformat()


def _plausible(t: EngineTask, inp: EngineInput) -> bool:
    return inp.wake_min - 60 <= t.at <= inp.sleep_ext + 30


def _unsent_pending(inp: EngineInput) -> list[EngineTask]:
    day = _day_iso(inp)
    sent = task_sent_today(inp.state, day)
    return [
        t for t in inp.tasks
        if t.pending and _plausible(t, inp) and task_ledger_key(day, t.key) not in sent
    ]


def _task_route_params(t: EngineTask) -> tuple[str, dict]:
    params: dict = {"task_uuid": t.task_uuid or t.key, "maxx": t.maxx, "title": t.title}
    if t.schedule_id and t.task_id:
        params["schedule_id"] = str(t.schedule_id)
        params["task_id"] = str(t.task_id)
        return "TaskGuide", params
    return "Home", params


def _task_lane(inp: EngineInput, cfg: EngineConfig) -> list[Push]:
    if is_lapsed(inp, cfg):
        return []
    day = _day_iso(inp)
    if len(task_sent_today(inp.state, day)) >= cfg.task_daily_ceiling:
        return []
    pending = _unsent_pending(inp)
    due = [t for t in pending if 0 <= inp.now_ext - t.at <= cfg.task_late_grace_min]
    if not due:
        return []
    due_keys = {t.key for t in due}
    soon = [
        t for t in pending
        if t.key not in due_keys and 0 < t.at - inp.now_ext <= cfg.task_lookahead_min
    ]
    group = sorted(due + soon, key=lambda t: (t.at, t.title))
    streak = inp.streak.current if inp.streak.current >= 2 else None
    if len(group) == 1:
        t = group[0]
        route, params = _task_route_params(t)
        copy = compose(
            CAT_TASK_DUE, name=inp.name, task=t.title, streak=streak, why=inp.why,
            rotation=inp.rotation + _key_offset(t.key), coaching_tone=inp.coaching_tone,
            route_params=params,
        )
        return [Push(
            category=CAT_TASK_DUE, lane="task", dedup_key=f"task:{t.key}",
            title=copy["title"], body=copy["body"], route=route, params=copy["params"],
            thread_id="tasks", task_keys=(t.key,),
            apns_category="TASK_REMINDER" if route == "TaskGuide" else None,
            template_id=copy["template_id"],
        )]
    copy = compose(
        CAT_TASK_DUE, name=inp.name, tasks=[t.title for t in group], variant="group",
        rotation=inp.rotation, route_params={"task_count": len(group)},
    )
    return [Push(
        category=CAT_TASK_DUE, lane="task", dedup_key=f"task:{group[0].key}",
        title=copy["title"], body=copy["body"], route="Home", params=copy["params"],
        thread_id="tasks", task_keys=tuple(t.key for t in group),
        template_id=copy["template_id"],
    )]


def _ambient_lane(inp: EngineInput, cfg: EngineConfig) -> Optional[Push]:
    if is_lapsed(inp, cfg):
        return _reengage(inp, cfg)
    if inp.foreground_recent:
        return None
    day = _day_iso(inp)
    amb = ambient_sent_today(inp.state, day)
    if len(amb) >= cfg.ambient_daily_cap:
        return None
    if not (inp.wake_min <= inp.now_ext <= inp.sleep_ext - 15):
        return None
    amb_ext = [e for e in (_ext_of_iso(v, inp.logical_date) for v in amb.values()) if e is not None]
    if amb_ext and inp.now_ext - max(amb_ext) < cfg.ambient_min_gap_min:
        return None
    task_ext = [
        e for e in (_ext_of_iso(v, inp.logical_date) for v in task_sent_today(inp.state, day).values())
        if e is not None
    ]
    if task_ext and inp.now_ext - max(task_ext) < cfg.task_buffer_min:
        return None
    if any(0 <= t.at - inp.now_ext < cfg.task_buffer_min for t in _unsent_pending(inp)):
        return None
    for build in (
        _streak_last_call, _streak_saver, _evening_close, _missed_followup,
        _morning, _weekly, _progress_photo, _scan_ready, _tip,
    ):
        p = build(inp, cfg, amb)
        if p is not None and not _muted(p.category, inp.muted):
            return p
    return None


# --------------------------------------------------------------------------- #
#  Ambient builders — each returns a Push or None; mute is checked by caller   #
#  (builders with a fallback check mute themselves)                           #
# --------------------------------------------------------------------------- #

def _overdue(t: EngineTask, inp: EngineInput, cfg: EngineConfig) -> bool:
    return t.pending and inp.now_ext >= t.at + cfg.task_late_grace_min


def _followup_due(t: EngineTask, inp: EngineInput, cfg: EngineConfig) -> bool:
    return t.pending and inp.now_ext >= t.at + max(cfg.missed_after_min, t.duration_min + 30)


def _ambient(inp: EngineInput, category: str, dedup_key: str, copy: dict, **kw) -> Push:
    return Push(
        category=category, lane="ambient", dedup_key=dedup_key,
        title=copy["title"], body=copy["body"], route=kw.pop("route", copy["route"]),
        params=kw.pop("params", copy["params"]), thread_id=kw.pop("thread_id", category),
        template_id=copy["template_id"], expires_in_s=kw.pop("expires_in_s", 3 * 3600), **kw,
    )


def _missed_followup(inp: EngineInput, cfg: EngineConfig, amb: dict) -> Optional[Push]:
    if inp.now_ext < inp.wake_min + 60 or inp.now_ext > inp.sleep_ext - 75:
        return None
    if inp.streak.closed_today:
        return None  # the day already counts; don't nag after a good day
    fu = {k: v for k, v in amb.items() if k.startswith("missed:")}
    if len(fu) >= cfg.missed_max_per_day:
        return None
    fu_ext = [e for e in (_ext_of_iso(v, inp.logical_date) for v in fu.values()) if e is not None]
    if fu_ext and inp.now_ext - max(fu_ext) < cfg.missed_min_gap_min:
        return None
    day = _day_iso(inp)
    already = missed_sent_today(inp.state, day)
    cands = [
        t for t in inp.tasks
        if _followup_due(t, inp, cfg)
        and _plausible(t, inp)
        and inp.now_ext - t.at <= cfg.missed_lookback_min
        and task_ledger_key(day, t.key) not in already
    ]
    if not cands:
        return None
    cands.sort(key=lambda t: t.at)
    mins = sum(max(1, int(t.duration_min or 5)) for t in cands)
    if len(cands) == 1:
        route, params = _task_route_params(cands[0])
    else:
        route, params = "Home", {}
    copy = compose(
        CAT_MISSED, name=inp.name, tasks=[t.title for t in cands], count=len(cands),
        mins=mins if mins <= 30 else None,   # "about 70 min" is a deterrent, not a nudge
        rotation=inp.rotation, coaching_tone=inp.coaching_tone, route_params=params,
    )
    return _ambient(
        inp, CAT_MISSED, f"missed:{len(fu) + 1}", copy, route=route,
        task_keys=tuple(t.key for t in cands),
    )


def _evening_close(inp: EngineInput, cfg: EngineConfig, amb: dict) -> Optional[Push]:
    if f"cat:{CAT_EVENING_RECAP}" in amb or f"cat:{CAT_STREAK}" in amb:
        return None
    if inp.streak.closed_today:
        return None
    overdue = [t for t in inp.tasks if _overdue(t, inp, cfg) and _plausible(t, inp)]
    if not overdue:
        return None
    last_at = max((t.at for t in inp.tasks if _plausible(t, inp)), default=None)
    start = inp.sleep_ext - 120
    if last_at is not None:
        start = max(start, last_at + 30)
    if not (start <= inp.now_ext <= inp.sleep_ext - 15):
        return None
    # Most recent first: at bedtime the evening tasks are the doable ones, not
    # a 07:15 shampoo from fifteen hours ago.
    overdue.sort(key=lambda t: t.at, reverse=True)
    mins = sum(max(1, int(t.duration_min or 5)) for t in overdue)
    copy = compose(
        CAT_EVENING_RECAP, name=inp.name, tasks=[t.title for t in overdue], count=len(overdue),
        mins=mins if mins <= 30 else None,
        streak=inp.streak.current if inp.streak.current >= 2 else None,
        rotation=inp.rotation, coaching_tone=inp.coaching_tone,
    )
    return _ambient(inp, CAT_EVENING_RECAP, f"cat:{CAT_EVENING_RECAP}", copy)


def _streak_saver(inp: EngineInput, cfg: EngineConfig, amb: dict) -> Optional[Push]:
    s = inp.streak
    if s.current < 2 or s.closed_today or s.needed_to_close < 1:
        return None
    if f"cat:{CAT_STREAK}" in amb:
        return None
    # Only when something EARLIER is clearly still open (past the same 45-min
    # mark as a follow-up). If everything left is still ahead — or was pushed
    # minutes ago — each task's own push is the reminder; a saver 15 minutes
    # after a task push is nagging.
    if not any(_followup_due(t, inp, cfg) and _plausible(t, inp) for t in inp.tasks):
        return None
    start = inp.sleep_ext - 150
    end = min(inp.sleep_ext - 45, STREAK_DAY_END_EXT)
    if not (start <= inp.now_ext <= end):
        return None
    copy = compose(
        CAT_STREAK, name=inp.name, streak=s.current, needed=s.needed_to_close,
        rotation=inp.rotation, coaching_tone=inp.coaching_tone,
    )
    return _ambient(inp, CAT_STREAK, f"cat:{CAT_STREAK}", copy, expires_in_s=2 * 3600)


def _streak_last_call(inp: EngineInput, cfg: EngineConfig, amb: dict) -> Optional[Push]:
    s = inp.streak
    if s.current < 3 or s.closed_today or s.needed_to_close < 1:
        return None
    saver = amb.get(f"cat:{CAT_STREAK}")
    if not saver or f"cat:{CAT_STREAK_LAST_CALL}" in amb:
        return None
    saver_ext = _ext_of_iso(saver, inp.logical_date)
    if saver_ext is None or inp.now_ext - saver_ext < 60:
        return None
    start = inp.sleep_ext - 40
    end = min(inp.sleep_ext - 15, STREAK_DAY_END_EXT)
    if not (start <= inp.now_ext <= end):
        return None
    copy = compose(
        CAT_STREAK_LAST_CALL, name=inp.name, streak=s.current, needed=s.needed_to_close,
        rotation=inp.rotation, coaching_tone=inp.coaching_tone,
    )
    return _ambient(
        inp, CAT_STREAK_LAST_CALL, f"cat:{CAT_STREAK_LAST_CALL}", copy,
        thread_id=CAT_STREAK, expires_in_s=3600,
    )


def _morning(inp: EngineInput, cfg: EngineConfig, amb: dict) -> Optional[Push]:
    if MORNING_KEY in amb:
        return None
    s, pr = inp.streak, inp.progress
    upcoming = sorted((t for t in inp.tasks if t.pending and t.at >= inp.now_ext), key=lambda t: t.at)
    first = upcoming[0] if upcoming else None
    special_window = inp.wake_min + 10 <= inp.now_ext <= inp.wake_min + 240
    if special_window:
        specials: list[tuple[str, dict]] = []
        if s.last_close_yesterday and s.current in STREAK_MILESTONES:
            specials.append((CAT_STREAK_MILESTONE, dict(streak=s.current)))
        if s.freeze_used_yesterday:
            specials.append((CAT_STREAK_FREEZE, dict(streak=s.current if s.current >= 2 else None,
                                                     count=len(inp.tasks) or None)))
        if s.fresh_start_today:
            specials.append((CAT_COMEBACK, dict(task=first.title if first else None)))
        if pr.journey_day in JOURNEY_MILESTONES:
            specials.append((CAT_JOURNEY, dict(day=pr.journey_day)))
        for category, kw in specials:
            if _muted(category, inp.muted):
                continue
            copy = compose(category, name=inp.name, rotation=inp.rotation,
                           coaching_tone=inp.coaching_tone, **kw)
            return _ambient(inp, category, MORNING_KEY, copy)
    if not (inp.wake_min + 10 <= inp.now_ext <= inp.wake_min + 120):
        return None
    if not inp.tasks or first is None:
        return None
    # A brief only makes sense BEFORE the day starts: once any task push went
    # out (or the day's first task is under 40 min away) the task pushes are the
    # day's opener, and "first up: <a 5pm task>" after three morning pings reads
    # wrong.
    if task_sent_today(inp.state, _day_iso(inp)):
        return None
    day_first = min((t.at for t in inp.tasks if _plausible(t, inp)), default=first.at)
    if day_first - inp.now_ext < 40:
        return None
    copy = compose(
        CAT_MORNING_PREVIEW, name=inp.name, count=len(inp.tasks), tasks=[first.title],
        time_label=clock_label(first.at), why=inp.why, rotation=inp.rotation,
        coaching_tone=inp.coaching_tone,
    )
    return _ambient(inp, CAT_MORNING_PREVIEW, MORNING_KEY, copy)


def _weekly(inp: EngineInput, cfg: EngineConfig, amb: dict) -> Optional[Push]:
    if inp.logical_date.weekday() != 6:
        return None
    iso = inp.logical_date.isocalendar()
    once_key = f"weekly:{iso[0]}-W{iso[1]:02d}"
    if once_key in ((inp.state or {}).get(ONCE_KEY) or {}):
        return None
    w = inp.week
    if w.active_days < 3 or w.done < 1:
        return None
    start = max(inp.wake_min + 360, inp.sleep_ext - 300)
    if not (start <= inp.now_ext <= inp.sleep_ext - 90):
        return None
    copy = compose(CAT_WEEKLY, name=inp.name, closed=w.closed_days or None, done=w.done,
                   rotation=inp.rotation, coaching_tone=inp.coaching_tone)
    return _ambient(inp, CAT_WEEKLY, f"cat:{CAT_WEEKLY}", copy, once_key=once_key,
                    expires_in_s=12 * 3600)


def _progress_photo(inp: EngineInput, cfg: EngineConfig, amb: dict) -> Optional[Push]:
    pr = inp.progress
    due = (pr.days_since_photo is None and pr.journey_day >= 3) or (
        pr.days_since_photo is not None and pr.days_since_photo >= 7
    )
    if not due or pr.journey_day in JOURNEY_MILESTONES:
        return None  # a journey-milestone morning already asked for a photo
    if f"cat:{CAT_WEEKLY}" in amb:
        return None
    last = ((inp.state or {}).get(ONCE_KEY) or {}).get("photo")
    if last:
        last_ext = _ext_of_iso(last, inp.logical_date)
        if last_ext is not None and inp.now_ext - last_ext < 6 * 1440:
            return None
    start = max(inp.wake_min + 480, inp.sleep_ext - 240)
    if not (start <= inp.now_ext <= inp.sleep_ext - 60):
        return None
    week = max(1, (pr.journey_day + 6) // 7) if pr.journey_day else None
    copy = compose(CAT_PROGRESS_PHOTO, name=inp.name, week=week, rotation=inp.rotation,
                   coaching_tone=inp.coaching_tone)
    return _ambient(inp, CAT_PROGRESS_PHOTO, f"cat:{CAT_PROGRESS_PHOTO}", copy, once_key="photo",
                    expires_in_s=6 * 3600)


def _scan_ready(inp: EngineInput, cfg: EngineConfig, amb: dict) -> Optional[Push]:
    pr = inp.progress
    if not (pr.has_scanned and pr.scan_ready and pr.days_since_scan is not None):
        return None
    # One per unlock: the unlock is identified by the last scan's date.
    scan_date = inp.logical_date - timedelta(days=pr.days_since_scan)
    once_key = f"scan:{scan_date.isoformat()}"
    if once_key in ((inp.state or {}).get(ONCE_KEY) or {}):
        return None
    if not (inp.wake_min + 180 <= inp.now_ext <= inp.sleep_ext - 120):
        return None
    copy = compose(CAT_SCAN_READY, name=inp.name, days=pr.days_since_scan, rotation=inp.rotation,
                   coaching_tone=inp.coaching_tone)
    return _ambient(inp, CAT_SCAN_READY, f"cat:{CAT_SCAN_READY}", copy, once_key=once_key,
                    expires_in_s=12 * 3600)


def _tip(inp: EngineInput, cfg: EngineConfig, amb: dict) -> Optional[Push]:
    if inp.logical_date.weekday() not in (0, 2, 4) or amb:
        return None  # only on otherwise quiet days
    if not inp.tasks:
        return None
    start = max(inp.wake_min + 240, 12 * 60)
    if not (start <= inp.now_ext <= 15 * 60):
        return None
    copy = compose(CAT_TIP, name=inp.name, rotation=inp.rotation, coaching_tone=inp.coaching_tone)
    return _ambient(inp, CAT_TIP, f"cat:{CAT_TIP}", copy)


def _reengage(inp: EngineInput, cfg: EngineConfig) -> Optional[Push]:
    if _muted(CAT_REENGAGE, inp.muted) or inp.hours_since_active is None:
        return None
    days = int(inp.hours_since_active // 24)
    if days > cfg.reengage_max_days:
        return None
    stages = [d for d in cfg.reengage_ladder_days if d <= days]
    if not stages:
        return None
    stage = stages[-1]
    anchor = inp.last_active_date.isoformat() if inp.last_active_date else None
    rg = (inp.state or {}).get(REENGAGE_KEY) or {}
    sent = list(rg.get("days") or []) if rg.get("anchor") == anchor else []
    if stage in sent:
        return None
    if f"cat:{CAT_REENGAGE}" in ambient_sent_today(inp.state, _day_iso(inp)):
        return None
    if not (inp.wake_min + 60 <= inp.now_ext <= inp.wake_min + 360):
        return None
    copy = compose(CAT_REENGAGE, name=inp.name, why=inp.why, final=stage == cfg.reengage_ladder_days[-1],
                   rotation=inp.rotation + stage, coaching_tone=inp.coaching_tone)
    params = dict(copy["params"])
    params["_anchor"] = anchor
    return _ambient(inp, CAT_REENGAGE, f"cat:{CAT_REENGAGE}", copy, params=params,
                    reengage_stage=stage, expires_in_s=12 * 3600)


# --------------------------------------------------------------------------- #
#  Streak arithmetic shared with the signal builder (pure)                    #
# --------------------------------------------------------------------------- #

def needed_to_close(total: int, completed: int, skipped: int, fraction: float) -> int:
    """How many more tasks (done or skipped) close the day under the streak's
    rule: >= `fraction` of tasks resolved AND at least one real completion."""
    if total <= 0:
        return 0
    resolved = completed + skipped
    need = max(0, math.ceil(fraction * total - 1e-9) - resolved)
    if completed == 0:
        need = max(need, 1)
    return need
