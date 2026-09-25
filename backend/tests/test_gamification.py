"""XP + Rank core — pure-logic unit tests (DB-free).

Covers the level curve, rank ladder, additive-only award semantics, the daily
`earned_today` reset, the once/day perfect-day guard + 7-day milestone bonus,
and the hot-endpoint payload. These are the security-adjacent invariants: XP must
be additive-only, never raise, and never double-pay.
"""
from __future__ import annotations

from services import gamification as g


# ── level curve + ranks ──────────────────────────────────────────────────────
def test_level_curve_monotonic_and_capped():
    assert g.xp_for_level(1) == 0
    # strictly increasing until the cap
    prev = -1
    for n in range(1, g.MAX_LEVEL + 1):
        cur = g.xp_for_level(n)
        assert cur >= prev
        prev = cur
    # cap: asking beyond MAX_LEVEL clamps
    assert g.xp_for_level(g.MAX_LEVEL + 50) == g.xp_for_level(g.MAX_LEVEL)


def test_level_from_xp_boundaries():
    assert g.level_from_xp(0) == 1
    assert g.level_from_xp(-100) == 1          # never below 1
    assert g.level_from_xp(g.xp_for_level(2)) == 2
    assert g.level_from_xp(g.xp_for_level(2) - 1) == 1
    assert g.level_from_xp(10 ** 9) == g.MAX_LEVEL  # clamps at the top
    assert g.level_from_xp(None) == 1          # malformed → safe


def test_ranks_ascend():
    assert g.rank_for_level(1) == "Mortal"
    assert g.rank_for_level(10) == "Aspirant"
    assert g.rank_for_level(24) == "Aspirant"
    assert g.rank_for_level(25) == "Champion"
    assert g.rank_for_level(100) == "Olympian"


# ── award_xp ─────────────────────────────────────────────────────────────────
def test_award_adds_and_tracks_today():
    p = {}
    r = g.award_xp(p, 15, "2026-07-04")
    assert p[g.XP_KEY] == 15 and r["xp_total"] == 15
    assert p[g.EARNED_TODAY_KEY] == 15
    g.award_xp(p, 50, "2026-07-04")
    assert p[g.XP_KEY] == 65 and p[g.EARNED_TODAY_KEY] == 65


def test_earned_today_resets_on_new_day():
    p = {g.XP_KEY: 100, g.EARNED_TODAY_KEY: 40, g.LAST_AWARD_DATE_KEY: "2026-07-03"}
    g.award_xp(p, 15, "2026-07-04")           # new day
    assert p[g.EARNED_TODAY_KEY] == 15         # reset then added, not 55
    assert p[g.XP_KEY] == 115                   # total is cumulative


def test_award_is_additive_only():
    p = {g.XP_KEY: 100}
    g.award_xp(p, -999, "2026-07-04")          # negative clamped to 0
    assert p[g.XP_KEY] == 100


def test_award_reports_level_gained():
    p = {}
    # jump straight past level 2's threshold
    r = g.award_xp(p, g.xp_for_level(3), "2026-07-04")
    assert r["level_before"] == 1
    assert r["level_after"] == 3
    assert r["level_gained"] == 2


def test_award_never_raises_on_garbage():
    r = g.award_xp(None, 15, "2026-07-04")     # type: ignore[arg-type]
    assert r["level_gained"] == 0


# ── streak / perfect-day XP ──────────────────────────────────────────────────
def test_perfect_day_awards_once_per_day():
    p = {}
    r1 = g.award_streak_xp(p, prev_streak=0, new_streak=1, today_iso="2026-07-04")
    assert r1["xp_awarded"] == g.XP_PERFECT_DAY
    # same day, streak "advances" again (un-check/re-check) → no double pay
    r2 = g.award_streak_xp(p, prev_streak=0, new_streak=1, today_iso="2026-07-04")
    assert r2["xp_awarded"] == 0


def test_milestone_bonus_at_7():
    p = {}
    r = g.award_streak_xp(p, prev_streak=6, new_streak=7, today_iso="2026-07-04")
    assert r["xp_awarded"] == g.XP_PERFECT_DAY + g.XP_STREAK_MILESTONE


def test_no_streak_xp_when_streak_did_not_advance():
    p = {}
    r = g.award_streak_xp(p, prev_streak=5, new_streak=5, today_iso="2026-07-04")
    assert r["xp_awarded"] == 0
    assert not p.get(g.XP_KEY)


# ── hot-endpoint payload ─────────────────────────────────────────────────────
def test_payload_shape_and_stale_today():
    p = {g.XP_KEY: g.xp_for_level(2), g.EARNED_TODAY_KEY: 40, g.LAST_AWARD_DATE_KEY: "2026-07-03"}
    pay = g.gamification_payload(p, "2026-07-04")
    assert pay["current_level"] == 2
    assert pay["rank"] == "Mortal"
    assert pay["xp_earned_today"] == 0          # stale (yesterday) → not shown
    assert pay["xp_for_next_level"] >= 1
    assert pay["current_xp"] == g.xp_for_level(2)


def test_payload_earned_today_when_current():
    p = {g.XP_KEY: 100, g.EARNED_TODAY_KEY: 40, g.LAST_AWARD_DATE_KEY: "2026-07-04"}
    pay = g.gamification_payload(p, "2026-07-04")
    assert pay["xp_earned_today"] == 40


# ── anti-farm: plan-normalized task XP ───────────────────────────────────────
def test_task_xp_normalized_to_plan_size():
    assert g.task_xp_for_plan(6) == 15          # typical plan → full rate
    assert g.task_xp_for_plan(3) == 15          # tiny plan clamped at ceiling
    assert g.task_xp_for_plan(12) == 8          # big plan → each task worth less
    assert g.task_xp_for_plan(40) == 5          # huge plan → floor
    # a fully-completed day is ~budget regardless of plan size
    for n in (6, 9, 12, 18):
        assert abs(n * g.task_xp_for_plan(n) - g.TASK_DAY_BUDGET) <= g.TASK_DAY_BUDGET * 0.35


def test_streak_multiplier_tiers():
    assert g.streak_multiplier(0) == 1.0
    assert g.streak_multiplier(2) == 1.0
    assert g.streak_multiplier(3) == 1.1
    assert g.streak_multiplier(7) == 1.25
    assert g.streak_multiplier(29) == 1.25
    assert g.streak_multiplier(30) == 1.5
    assert g.streak_multiplier(None) == 1.0     # malformed → safe


# ── anti-farm: the toggle exploit is dead ────────────────────────────────────
def test_task_paid_once_per_day_ever():
    p = {}
    r1 = g.award_task_xp(p, "task_a", 6, 0, "2026-07-04")
    assert r1["xp_awarded"] == 15 and r1["already_paid"] is False
    # uncomplete → recomplete: same task id, same day → pays NOTHING
    r2 = g.award_task_xp(p, "task_a", 6, 0, "2026-07-04")
    assert r2["xp_awarded"] == 0 and r2["already_paid"] is True
    assert p[g.XP_KEY] == 15                    # total unchanged by the toggle
    # a different task still pays
    r3 = g.award_task_xp(p, "task_b", 6, 0, "2026-07-04")
    assert r3["xp_awarded"] == 15


def test_task_ledger_resets_next_day():
    p = {}
    g.award_task_xp(p, "task_a", 6, 0, "2026-07-04")
    r = g.award_task_xp(p, "task_a", 6, 0, "2026-07-05")   # new day → pays again
    assert r["xp_awarded"] == 15


def test_task_xp_applies_streak_multiplier():
    p = {}
    r = g.award_task_xp(p, "task_a", 6, 30, "2026-07-04")  # 30-day streak → ×1.5
    assert r["xp_awarded"] == round(15 * 1.5)


def test_payload_exposes_multiplier():
    p = {"master_schedule_streak": 7}
    pay = g.gamification_payload(p, "2026-07-04")
    assert pay["streak_multiplier"] == 1.25



# --- 2026-09-24 recalibration: levels must be earned, not given ---------------

def test_curve_milestones_are_pinned():
    # Pinned so a future edit to the curve is a deliberate, reviewed change.
    assert [g.xp_for_level(n) for n in (1, 2, 5, 10, 25, 40, 60, 100)] == [
        0, 100, 919, 3363, 16156, 35132, 68134, 155961]


def test_badge_xp_scales_with_tier_and_setup_badges_are_tokens():
    assert g.achievement_xp("first_routine") == 10
    assert g.achievement_xp("first_scan") == 10
    assert g.achievement_xp("two_maxxes") == 10
    assert g.achievement_xp("knows_me") == 10
    assert g.achievement_xp("streak_3") == 25        # bronze
    assert g.achievement_xp("streak_7") == 75        # silver
    assert g.achievement_xp("streak_30") == 200      # gold
    assert g.achievement_xp("streak_100") == 500     # override
    assert g.achievement_xp("unknown_code") == g.XP_ACHIEVEMENT
    # every catalog badge resolves to a sane amount
    from services.achievements import CATALOG
    for a in CATALOG:
        assert 10 <= g.achievement_xp(a.code, a.tier) <= 500, a.code


def test_onboarding_alone_never_levels_up():
    # finishing onboarding (all four setup badges) without doing a task
    p = {}
    for code in ("first_routine", "first_scan", "two_maxxes", "knows_me"):
        g.award_xp(p, g.achievement_xp(code), "2026-09-24")
    assert g.gamification_payload(p, "2026-09-24")["current_level"] == 1


def test_one_fully_completed_first_day_is_level_two_not_five():
    p = {}
    today = "2026-09-24"
    g.award_xp(p, g.achievement_xp("first_routine") + g.achievement_xp("first_scan"), today)
    for i in range(7):
        g.award_task_xp(p, f"t{i}", 7, 0, today)
    g.award_streak_xp(p, 0, 1, today)
    g.award_xp(p, g.achievement_xp("perfect_day"), today)
    assert g.gamification_payload(p, today)["current_level"] == 2


def test_level_is_pure_function_of_xp_no_legacy_floor():
    # a level minted by the old curve (level 8 on 240 XP) is not preserved
    p = {g.XP_KEY: 240, g.LEVEL_KEY: 8}
    assert g.gamification_payload(p, "2026-09-24")["current_level"] == g.level_from_xp(240) == 2
    r = g.award_xp(p, 0, "2026-09-24")
    assert r["level_after"] == 2 and p[g.LEVEL_KEY] == 2


def test_a_perfect_month_is_about_level_ten_not_thirty():
    p = {}
    streak = 0
    import datetime as dt
    d0 = dt.date(2026, 9, 1)
    for day in range(30):
        iso = (d0 + dt.timedelta(days=day)).isoformat()
        for i in range(7):
            g.award_task_xp(p, f"{day}-{i}", 7, streak, iso)
        g.award_streak_xp(p, streak, streak + 1, iso)
        streak += 1
    lvl = g.gamification_payload(p, (d0 + dt.timedelta(days=29)).isoformat())["current_level"]
    assert 9 <= lvl <= 13, lvl


# ── on time vs late ───────────────────────────────────────────────────────────
def test_is_on_time_early_exact_grace_and_missing():
    assert g.is_on_time("09:00", 8 * 60)                         # early is fine
    assert g.is_on_time("09:00", 9 * 60)                         # on the minute
    assert g.is_on_time("09:00", 9 * 60 + g.ON_TIME_GRACE_MIN)   # last on-time minute
    assert not g.is_on_time("09:00", 9 * 60 + g.ON_TIME_GRACE_MIN + 1)
    assert g.is_on_time(None, 23 * 60) and g.is_on_time("", 0) and g.is_on_time("garbage", 0)


def test_late_task_pays_half_and_is_still_paid_once():
    p = {}
    late = g.award_task_xp(p, "t1", 1, 0, "2026-09-25", on_time=False)
    assert late["xp_awarded"] == round(15 * g.XP_LATE_FRACTION) and late["on_time"] is False
    # re-completing on time later never pays again
    again = g.award_task_xp(p, "t1", 1, 0, "2026-09-25", on_time=True)
    assert again["xp_awarded"] == 0 and again["already_paid"] is True
    on_time = g.award_task_xp(p, "t2", 1, 0, "2026-09-25")
    assert on_time["xp_awarded"] == 15 and on_time["on_time"] is True
    assert p[g.XP_KEY] == round(15 * g.XP_LATE_FRACTION) + 15


def test_late_award_never_rounds_to_zero():
    # the smallest per-task amount (floor 5 on a huge plan) still pays something late
    p = {}
    r = g.award_task_xp(p, "t1", 40, 0, "2026-09-25", on_time=False)
    assert r["xp_awarded"] >= 1
