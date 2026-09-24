"""XP + Rank — additive-only gamification, stored in User.profile JSON.

XP accrues from real, repeated behaviour:
  • completing today's scheduled tasks — a fully-done day is worth ~90 XP
    whatever the plan size (5..15 per task), × a streak multiplier (≤1.5)
  • a perfect day (all of today's tasks done)          -> +25
  • a streak milestone (every 7 days)                  -> +100
  • unlocking a badge — scaled by what it took: setup badges (first routine,
    first scan, second max, telling Max about yourself) +10, bronze +25,
    silver +75, gold +200, Centurion +500

Calibration (2026-09-24, simulated over two years for four archetypes):
  perfect user  → L2 day 1, L5 week 1, L12 month 1, L24 month 3, L58 year 1
  typical user  → L3 week 1, L5 month 1, L10 month 3, L21 year 1
The previous economy paid 50 XP per badge regardless of tier, so onboarding
alone (3 setup badges) put every new user on level 3 before a single task,
and one completed day reached level 5 — levels meant nothing.

XP maps to a level (1..100) via a power curve and levels group into named
RANKS. Everything here is PURE: the functions mutate the passed `profile`
dict and NEVER commit — the caller owns the transaction (mirrors the streak
helpers in schedule_streak.py). Every function is defensive: on any error it
no-ops, so an XP award can never break the task/achievement/streak write it
rides on. XP is additive-only — un-checking a task keeps the XP, it just won't
be re-awarded.

Keys live in `profile` alongside the streak keys (zero new tables, OTA-safe).
"""
from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

# ── profile JSON keys (namespaced like STREAK_KEY et al.) ────────────────────
XP_KEY = "xp_total"
LEVEL_KEY = "xp_level"
EARNED_TODAY_KEY = "xp_earned_today"
LAST_AWARD_DATE_KEY = "xp_last_award_date"
PERFECT_XP_DATE_KEY = "xp_perfect_awarded_date"  # guards the once/day perfect-day award

# ── award amounts ────────────────────────────────────────────────────────────
XP_TASK_ON_TIME = 15          # per-task ceiling (small plans)
XP_TASK_FLOOR = 5             # per-task floor (very large plans)
TASK_DAY_BUDGET = 90          # a fully-completed day is worth ~this much task XP
XP_ACHIEVEMENT = 25            # fallback for a badge code missing from the table below
XP_PERFECT_DAY = 25
XP_STREAK_MILESTONE = 100
STREAK_MILESTONE_EVERY = 7
TASK_LEDGER_KEY = "xp_task_ledger"  # {"date": iso, "ids": [task ids already paid today]}

# Badge XP scales with what the badge took. Setup badges are earned by simply
# finishing onboarding, so they are a token — they must never level a user up
# on their own. Keyed by services.achievements CATALOG code.
XP_BADGE_SETUP = 10
XP_BADGE_BY_TIER = {"bronze": 25, "silver": 75, "gold": 200}
_SETUP_BADGES = frozenset({"first_routine", "first_scan", "two_maxxes", "knows_me"})
_BADGE_OVERRIDES = {"streak_100": 500}


def achievement_xp(code: str, tier: str | None = None) -> int:
    """XP for unlocking badge `code` (tier from the catalog when not given)."""
    try:
        code = str(code or "")
        if code in _BADGE_OVERRIDES:
            return _BADGE_OVERRIDES[code]
        if code in _SETUP_BADGES:
            return XP_BADGE_SETUP
        if tier is None:
            from services.achievements import CATALOG_BY_CODE
            a = CATALOG_BY_CODE.get(code)
            tier = a.tier if a is not None else None
        return XP_BADGE_BY_TIER.get(str(tier or "").lower(), XP_ACHIEVEMENT)
    except Exception:  # pragma: no cover - never break the badge write
        return XP_ACHIEVEMENT

# Streak multiplier on task XP — consistency is the top earner and can't be
# farmed in a sitting. (0-2: ×1.0, 3-6: ×1.1, 7-29: ×1.25, 30+: ×1.5)
_STREAK_MULT = [(30, 1.5), (7, 1.25), (3, 1.1)]


def streak_multiplier(streak: int) -> float:
    try:
        streak = int(streak or 0)
    except (TypeError, ValueError):
        return 1.0
    for min_days, mult in _STREAK_MULT:
        if streak >= min_days:
            return mult
    return 1.0


def task_xp_for_plan(n_tasks_today: int) -> int:
    """Per-task XP normalized to the size of TODAY'S plan (the fair form of
    diminishing returns): a fully-completed day earns ~TASK_DAY_BUDGET for
    everyone, so a 12-task plan can't out-earn a 6-task plan by volume.
    Clamped to [floor, ceiling] so tiny plans don't mint jackpots."""
    try:
        n = max(1, int(n_tasks_today or 1))
    except (TypeError, ValueError):
        n = 1
    return max(XP_TASK_FLOOR, min(XP_TASK_ON_TIME, round(TASK_DAY_BUDGET / n)))


def award_task_xp(
    profile: dict, task_id: str, n_tasks_today: int, streak: int, today_iso: str
) -> dict:
    """Award XP for completing a task today — once per (task, day) EVER.
    The ledger makes toggle-farming (uncomplete → recomplete) worthless: a task
    id already paid today never pays again, and XP is additive-only so
    un-checking refunds nothing. Amount = plan-normalized per-task XP × the
    streak multiplier. Mutates profile in place, never commits, never raises."""
    try:
        ledger = profile.get(TASK_LEDGER_KEY) or {}
        if ledger.get("date") != today_iso:
            ledger = {"date": today_iso, "ids": []}
        ids = list(ledger.get("ids") or [])
        tid = str(task_id)
        if tid in ids:
            return award_xp(profile, 0, today_iso) | {"xp_awarded": 0, "already_paid": True}
        ids.append(tid)
        ledger["ids"] = ids[-200:]  # bound the ledger
        profile[TASK_LEDGER_KEY] = ledger
        amount = int(round(task_xp_for_plan(n_tasks_today) * streak_multiplier(streak)))
        return award_xp(profile, amount, today_iso) | {"already_paid": False}
    except Exception as e:  # pragma: no cover - never break task completion
        logger.warning("award_task_xp no-op (non-fatal): %s", e)
        return award_xp(profile, 0, today_iso) | {"xp_awarded": 0, "already_paid": False}

MAX_LEVEL = 100
# Power curve: XP to REACH level n = round(100 · (n-1)^1.6). Early levels cost
# about a real day of work each (L2 = 100 ≈ one completed day), mid levels a
# week or two, and the top of the ladder years:
#   L2=100  L5=919  L10=3,363  L25=16,156  L40=35,132  L60=68,134  L100=155,961
# A precomputed integer table keeps xp_for_level/level_from_xp exactly
# consistent (float drift once caused an off-by-one at a boundary).
_CURVE_SCALE = 100
_CURVE_EXP = 1.6
_LEVEL_TABLE: tuple[int, ...] = tuple(
    int(round(_CURVE_SCALE * (n - 1) ** _CURVE_EXP)) for n in range(1, MAX_LEVEL + 1)
)

# Named ranks over the 1..100 ladder — themed to the app's disciplined,
# self-improvement vibe. (min_level inclusive, ascending.)
# Ascension ladder — the self-improvement arc from mortal to god.
RANKS = [
    (1, "Mortal"),
    (10, "Aspirant"),
    (25, "Champion"),
    (40, "Hero"),
    (60, "Demigod"),
    (80, "Titan"),
    (100, "Olympian"),
]


def xp_for_level(n: int) -> int:
    """Cumulative XP required to REACH level n (n>=1). Level 1 = 0 XP."""
    n = max(1, min(int(n), MAX_LEVEL))
    return _LEVEL_TABLE[n - 1]


def level_from_xp(xp: int) -> int:
    """Highest level whose XP threshold `xp` meets. Clamped to [1, MAX_LEVEL]."""
    try:
        xp = max(0, int(xp or 0))
    except (TypeError, ValueError):
        return 1
    lvl = 1
    while lvl < MAX_LEVEL and xp >= _LEVEL_TABLE[lvl]:
        lvl += 1
    return lvl


def rank_for_level(level: int) -> str:
    name = RANKS[0][1]
    for min_lvl, rname in RANKS:
        if level >= min_lvl:
            name = rname
    return name


def award_xp(profile: dict, amount: int, today_iso: str) -> dict:
    """Add `amount` XP to `profile` IN PLACE (no commit). Lazily resets the
    per-day counter when the local date rolls over. Returns a summary with
    level_before/level_after/level_gained (level_gained>0 drives the level-up
    celebration + review-prompt trigger). Never raises."""
    try:
        amount = max(0, int(amount))
        total_before = int(profile.get(XP_KEY) or 0)
        level_before = level_from_xp(total_before)

        # Daily reset: a new local day zeroes "earned today" before we add.
        if profile.get(LAST_AWARD_DATE_KEY) != today_iso:
            profile[EARNED_TODAY_KEY] = 0

        if amount > 0:
            total_after = total_before + amount
            profile[XP_KEY] = total_after
            profile[EARNED_TODAY_KEY] = int(profile.get(EARNED_TODAY_KEY) or 0) + amount
            profile[LAST_AWARD_DATE_KEY] = today_iso
        else:
            total_after = total_before

        level_after = level_from_xp(total_after)
        profile[LEVEL_KEY] = level_after
        return {
            "xp_total": total_after,
            "xp_awarded": amount,
            "xp_earned_today": int(profile.get(EARNED_TODAY_KEY) or 0),
            "level_before": level_before,
            "level_after": level_after,
            "level_gained": max(0, level_after - level_before),
        }
    except Exception as e:  # never break the caller's primary write
        logger.warning("award_xp no-op (non-fatal): %s", e)
        cur = int((profile or {}).get(XP_KEY) or 0) if isinstance(profile, dict) else 0
        lvl = level_from_xp(cur)
        return {"xp_total": cur, "xp_awarded": 0, "xp_earned_today": 0,
                "level_before": lvl, "level_after": lvl, "level_gained": 0}


def award_streak_xp(profile: dict, prev_streak: int, new_streak: int, today_iso: str) -> dict:
    """Award the perfect-day bonus (+25) at most once per local day, plus a
    milestone bonus (+100) when the streak crosses a multiple of 7. Only fires
    when the streak actually advanced (new_streak > prev_streak). Guarded by a
    date key so an un-check/re-check can't double-pay. Never raises."""
    try:
        if new_streak <= prev_streak:
            return award_xp(profile, 0, today_iso) | {"xp_awarded": 0}
        if profile.get(PERFECT_XP_DATE_KEY) == today_iso:
            return award_xp(profile, 0, today_iso) | {"xp_awarded": 0}
        amount = XP_PERFECT_DAY
        if new_streak > 0 and new_streak % STREAK_MILESTONE_EVERY == 0:
            amount += XP_STREAK_MILESTONE
        profile[PERFECT_XP_DATE_KEY] = today_iso
        return award_xp(profile, amount, today_iso)
    except Exception as e:
        logger.warning("award_streak_xp no-op (non-fatal): %s", e)
        return award_xp(profile, 0, today_iso) | {"xp_awarded": 0}


def gamification_payload(profile: dict, today_iso: str) -> dict:
    """Pure dict-reads for the hot /schedules/active/full endpoint. Reports the
    current level/rank, progress within the level, and today's XP (0 if the
    stored counter is from a previous day — never show a stale value)."""
    try:
        profile = profile or {}
        total = int(profile.get(XP_KEY) or 0)
        # Level is a pure function of XP. (A stored-level floor used to keep
        # levels minted by an older, looser curve — e.g. level 8 on 240 XP.)
        level = level_from_xp(total)
        earned_today = (
            int(profile.get(EARNED_TODAY_KEY) or 0)
            if profile.get(LAST_AWARD_DATE_KEY) == today_iso else 0
        )
        cur_floor = xp_for_level(level)
        next_ceiling = xp_for_level(min(MAX_LEVEL, level + 1))
        # Surface the active streak multiplier (read off the streak key the
        # streak service maintains in this same profile blob).
        mult = streak_multiplier(int(profile.get("master_schedule_streak") or 0))
        return {
            "current_xp": total,
            "current_level": level,
            "rank": rank_for_level(level),
            "xp_earned_today": earned_today,
            "xp_into_level": max(0, total - cur_floor),
            "xp_for_next_level": max(1, next_ceiling - cur_floor),
            "next_level_at": next_ceiling,
            "is_max_level": level >= MAX_LEVEL,
            "streak_multiplier": mult,
        }
    except Exception:
        floor2 = xp_for_level(2)
        return {"current_xp": 0, "current_level": 1, "rank": RANKS[0][1],
                "xp_earned_today": 0, "xp_into_level": 0, "xp_for_next_level": floor2,
                "next_level_at": floor2, "is_max_level": False, "streak_multiplier": 1.0}
